-- Only descriptive correction of one field on a simple SKU. No source data backfill.
CREATE UNIQUE INDEX product_classification_key ON product_family_events((next->>'operationKey')) WHERE next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION';
--> statement-breakpoint
CREATE FUNCTION fyf_check_simple_classification(old_p products,new_p products) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e product_family_events%ROWTYPE; col text;
BEGIN
 SELECT * INTO e FROM product_family_events WHERE product_id=old_p.id AND family_id IS NULL
 AND next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION'
 AND previous->>'transactionId'=pg_current_xact_id()::text AND previous->'product'=to_jsonb(old_p);
 IF NOT FOUND THEN RAISE EXCEPTION 'Simple classification requires transactional ADMIN audit' USING ERRCODE='23514'; END IF;
 col:=CASE e.next->>'field' WHEN 'brand' THEN 'brand' WHEN 'category' THEN 'category_id' ELSE NULL END;
 IF col IS NULL OR old_p.family_id IS NOT NULL OR new_p.family_id IS NOT NULL OR old_p.variant_key IS NOT NULL
 OR new_p.variant_key IS NOT NULL OR e.user_id IS NULL OR e.reason IS NULL OR length(btrim(e.reason)) NOT BETWEEN 8 AND 500
 OR NOT coalesce(e.next->>'operationKey' ~ '^[a-zA-Z0-9-]{20,80}$',false)
 OR NOT coalesce(e.next->>'requestHash' ~ '^[a-f0-9]{64}$',false)
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=e.user_id AND u.status='ACTIVE' AND r.name='ADMIN')
 OR (to_jsonb(old_p)-col-'updated_at') IS DISTINCT FROM (to_jsonb(new_p)-col-'updated_at')
 OR to_jsonb(old_p)->col IS DISTINCT FROM e.next->'previousValue'
 OR to_jsonb(new_p)->col IS DISTINCT FROM e.next->'value'
 OR to_jsonb(old_p)->col IS NOT DISTINCT FROM to_jsonb(new_p)->col
 OR (e.next->>'revision')::timestamp IS DISTINCT FROM new_p.updated_at
 OR EXISTS(SELECT 1 FROM product_variant_values WHERE product_id=old_p.id)
 OR EXISTS(SELECT 1 FROM product_family_events WHERE product_id=old_p.id AND family_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Simple classification must preserve every other product field' USING ERRCODE='23514'; END IF;
 IF col='brand' AND (new_p.brand IS NULL OR length(new_p.brand) NOT BETWEEN 1 AND 100
 OR new_p.brand<>regexp_replace(btrim(new_p.brand),'\s+',' ','g') OR new_p.brand ~ '[[:cntrl:]]'
 OR lower(regexp_replace(btrim(coalesce(old_p.brand,'')),'\s+',' ','g'))=lower(new_p.brand))
 THEN RAISE EXCEPTION 'Invalid or equivalent brand' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM categories WHERE id=new_p.category_id)
 OR EXISTS(SELECT 1 FROM products p WHERE p.id<>new_p.id AND p.category_id=new_p.category_id
 AND lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=lower(regexp_replace(btrim(new_p.name),'\s+',' ','g')))
 THEN RAISE EXCEPTION 'Category unavailable or duplicate product name' USING ERRCODE='23514'; END IF;
 PERFORM fyf_assert_product_name_ready(old_p.id);
 IF EXISTS(WITH covering AS (
  SELECT p.* FROM promotions p WHERE p.is_active AND
   (EXISTS(SELECT 1 FROM promotion_products t WHERE t.promotion_id=p.id AND t.product_id=old_p.id)
    OR EXISTS(SELECT 1 FROM promotion_categories t WHERE t.promotion_id=p.id AND t.category_id=new_p.category_id))
 ) SELECT 1 FROM covering a JOIN covering b ON a.id<b.id
 WHERE a.starts_at<coalesce(b.ends_at,'infinity'::timestamptz) AND b.starts_at<coalesce(a.ends_at,'infinity'::timestamptz))
 THEN RAISE EXCEPTION 'Correction would create overlapping promotions' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION fyf_guard_simple_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.family_id IS NULL AND OLD.category_id IS DISTINCT FROM NEW.category_id
 AND (EXISTS(SELECT 1 FROM sale_details WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM online_order_items WHERE product_id=OLD.id)
 OR EXISTS(SELECT 1 FROM inventory_movements WHERE product_id=OLD.id)) THEN PERFORM fyf_check_simple_classification(OLD,NEW); END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER simple_category_guard BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fyf_guard_simple_category();
--> statement-breakpoint
CREATE FUNCTION fyf_guard_simple_classification_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION' OR NEW.next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION'
 THEN RAISE EXCEPTION 'Simple classification audit is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER simple_classification_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_simple_classification_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_verify_simple_classification_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_p products%ROWTYPE; new_p products%ROWTYPE;
BEGIN
 IF NEW.next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION' THEN
  old_p:=jsonb_populate_record(NULL::products,NEW.previous->'product');
  SELECT * INTO new_p FROM products WHERE id=NEW.product_id;
  IF NEW.family_id IS NOT NULL OR NEW.product_id IS DISTINCT FROM old_p.id OR new_p.id IS NULL
  OR NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text THEN
   RAISE EXCEPTION 'Invalid simple correction audit' USING ERRCODE='23514'; END IF;
  PERFORM fyf_check_simple_classification(old_p,new_p);
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER simple_classification_audit_commit AFTER INSERT ON product_family_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fyf_verify_simple_classification_audit();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fyf_preserve_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean; detached product_family_events%ROWTYPE;
BEGIN
  IF OLD.family_id IS NULL AND NEW.family_id IS NULL AND OLD.brand IS DISTINCT FROM NEW.brand
    AND EXISTS(SELECT 1 FROM product_family_events e WHERE e.product_id=OLD.id AND e.family_id IS NULL
      AND e.next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION' AND e.previous->>'transactionId'=pg_current_xact_id()::text) THEN
    PERFORM fyf_check_simple_classification(OLD,NEW);
    RETURN NEW;
  END IF;
  IF OLD.name IS DISTINCT FROM NEW.name THEN PERFORM fyf_check_product_name_correction(OLD,NEW); END IF;
  SELECT EXISTS(SELECT 1 FROM sale_details WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM online_order_items WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM inventory_movements WHERE product_id=OLD.id) INTO has_history;

  IF OLD.brand IS DISTINCT FROM NEW.brand AND OLD.family_id IS NOT NULL THEN
    PERFORM fyf_check_family_brand_product(OLD,NEW);
  END IF;
  IF has_history AND (OLD.unit_measure IS DISTINCT FROM NEW.unit_measure
    OR (OLD.brand IS DISTINCT FROM NEW.brand AND OLD.family_id IS NULL)) THEN
    RAISE EXCEPTION 'Historical product identity cannot change' USING ERRCODE='23514';
  END IF;

  IF OLD.family_id IS NOT NULL AND (OLD.family_id IS DISTINCT FROM NEW.family_id OR OLD.variant_key IS DISTINCT FROM NEW.variant_key) THEN
    IF NEW.family_id IS NULL AND NEW.variant_key IS NULL THEN
      -- A detach must not smuggle in changes to any other product column, even without history.
      IF (to_jsonb(OLD)-'family_id'-'variant_key') IS DISTINCT FROM (to_jsonb(NEW)-'family_id'-'variant_key')
        OR NOT EXISTS (
          SELECT 1 FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
          WHERE e.product_id=OLD.id AND e.family_id=OLD.family_id AND r.name='ADMIN' AND u.status='ACTIVE'
            AND e.previous->>'familyId'=OLD.family_id::text AND e.previous->>'variantKey'=OLD.variant_key
            AND jsonb_typeof(e.previous->'attributes')='array' AND jsonb_array_length(e.previous->'attributes')>0
            AND e.previous->>'transactionId'=pg_current_xact_id()::text
            AND e.next->>'operation'='DETACH' AND e.next->'familyId'='null'::jsonb
            AND e.next->'variantKey'='null'::jsonb AND length(btrim(e.reason)) BETWEEN 8 AND 500
        ) THEN
        RAISE EXCEPTION 'Family detach requires unchanged product and transactional ADMIN audit' USING ERRCODE='23514';
      END IF;
    ELSIF OLD.family_id=NEW.family_id AND fyf_authorized_dimension_extension(OLD,NEW) THEN
      NULL;
    ELSIF has_history THEN
      RAISE EXCEPTION 'Historical product identity cannot change' USING ERRCODE='23514';
    END IF;
  END IF;

  -- Detachment must not become a back door for assigning a historical SKU to another combination.
  IF has_history AND OLD.family_id IS NULL AND NEW.family_id IS NOT NULL THEN
    SELECT * INTO detached FROM product_family_events
      WHERE product_id=OLD.id AND next->>'operation'='DETACH' ORDER BY id DESC LIMIT 1;
    IF FOUND AND (detached.previous->>'familyId' IS DISTINCT FROM NEW.family_id::text
      OR detached.previous->>'variantKey' IS DISTINCT FROM NEW.variant_key) THEN
      RAISE EXCEPTION 'Historical detached product can only recover its original combination' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
