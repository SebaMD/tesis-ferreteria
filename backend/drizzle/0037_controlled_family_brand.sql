-- Descriptive corrections only; source operations and snapshots remain unchanged.
CREATE UNIQUE INDEX family_brand_operation_key ON product_family_events((next->>'operationKey'),(next->>'operation')) WHERE next->>'operation' IN ('FAMILY_BRAND_AUTHORIZATION','FAMILY_BRAND_CORRECTION');
--> statement-breakpoint
CREATE FUNCTION fyf_start_family_brand_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior jsonb; member jsonb;
BEGIN
 IF NEW.next->>'operation' IS DISTINCT FROM 'FAMILY_BRAND_AUTHORIZATION' THEN RETURN NEW; END IF;
 prior:=fyf_dimension_state(NEW.family_id);
 IF NEW.product_id IS NOT NULL OR prior IS NULL OR prior IS DISTINCT FROM NEW.previous->'state'
 OR NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR NOT coalesce(NEW.next->>'operationKey' ~ '^[a-zA-Z0-9-]{20,80}$',false)
 OR NOT coalesce(NEW.next->>'requestHash' ~ '^[a-f0-9]{64}$',false)
 OR NOT coalesce(NEW.previous->>'revision' ~ '^[a-f0-9]{64}$',false)
 OR length(btrim(NEW.reason)) NOT BETWEEN 8 AND 500
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=NEW.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR prior->'family'->>'archived_at' IS NOT NULL
 OR jsonb_array_length(prior->'members')<1
 OR jsonb_typeof(NEW.next->'brand') IS DISTINCT FROM 'string'
 OR length(NEW.next->>'brand') NOT BETWEEN 1 AND 100
 OR NEW.next->>'brand' ~ '[[:cntrl:]]'
 OR NEW.next->>'brand' IS DISTINCT FROM regexp_replace(btrim(NEW.next->>'brand'),'\s+',' ','g')
 OR lower(coalesce(regexp_replace(btrim(prior->'family'->>'brand'),'\s+',' ','g'),''))=lower(NEW.next->>'brand')
 THEN RAISE EXCEPTION 'Invalid transactional ADMIN brand authorization' USING ERRCODE='23514'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(prior->'members') LOOP
  PERFORM fyf_assert_product_name_ready((member->'product'->>'id')::integer);
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER family_brand_audit_start BEFORE INSERT ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_start_family_brand_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_check_family_brand_product(old_product products,new_product products) RETURNS void LANGUAGE plpgsql AS $$
DECLARE audit product_family_events%ROWTYPE; old_member jsonb;
BEGIN
 SELECT e.* INTO audit FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
 WHERE e.family_id=old_product.family_id AND e.product_id IS NULL AND e.next->>'operation'='FAMILY_BRAND_AUTHORIZATION'
 AND e.previous->>'transactionId'=pg_current_xact_id()::text AND r.name='ADMIN' AND u.status='ACTIVE' ORDER BY e.id DESC LIMIT 1;
 SELECT value INTO old_member FROM jsonb_array_elements(audit.previous->'state'->'members') WHERE value->'product'->>'id'=old_product.id::text;
 IF audit.id IS NULL OR old_member IS NULL OR old_member->'product' IS DISTINCT FROM to_jsonb(old_product)
 OR (to_jsonb(old_product)-'brand'-'updated_at') IS DISTINCT FROM (to_jsonb(new_product)-'brand'-'updated_at')
 OR new_product.brand IS DISTINCT FROM audit.next->>'brand' THEN
  RAISE EXCEPTION 'Brand correction requires exact unchanged SKU and transactional ADMIN audit' USING ERRCODE='23514';
 END IF;
 PERFORM fyf_assert_product_name_ready(old_product.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION fyf_guard_family_brand() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.brand IS DISTINCT FROM NEW.brand AND NOT EXISTS(
 SELECT 1 FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
 WHERE e.family_id=OLD.id AND e.product_id IS NULL AND e.next->>'operation'='FAMILY_BRAND_AUTHORIZATION'
 AND e.previous->>'transactionId'=pg_current_xact_id()::text AND e.previous->'state'->'family'=to_jsonb(OLD)
 AND r.name='ADMIN' AND u.status='ACTIVE' AND e.next->>'brand'=NEW.brand
 AND (to_jsonb(OLD)-'brand'-'updated_at')=(to_jsonb(NEW)-'brand'-'updated_at')
 ) THEN RAISE EXCEPTION 'Family brand requires an independent audited correction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER family_brand_guard BEFORE UPDATE ON product_families FOR EACH ROW EXECUTE FUNCTION fyf_guard_family_brand();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fyf_preserve_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean; detached product_family_events%ROWTYPE;
BEGIN
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

--> statement-breakpoint
CREATE FUNCTION fyf_guard_family_brand_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.next->>'operation' IN ('FAMILY_BRAND_AUTHORIZATION','FAMILY_BRAND_CORRECTION') OR NEW.next->>'operation' IN ('FAMILY_BRAND_AUTHORIZATION','FAMILY_BRAND_CORRECTION') THEN
  RAISE EXCEPTION 'Family brand audit is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER family_brand_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_family_brand_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_verify_family_brand_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior jsonb; final_state jsonb; member jsonb; current_member jsonb; auth_event product_family_events%ROWTYPE; completion product_family_events%ROWTYPE;
BEGIN
 IF NEW.next->>'operation' NOT IN ('FAMILY_BRAND_AUTHORIZATION','FAMILY_BRAND_CORRECTION') OR NEW.next->>'operation' IS NULL THEN RETURN NEW; END IF;
 IF NEW.next->>'operation'='FAMILY_BRAND_CORRECTION' THEN
  SELECT * INTO auth_event FROM product_family_events WHERE id=(NEW.next->>'authorizationId')::integer
    AND next->>'operation'='FAMILY_BRAND_AUTHORIZATION';
 ELSE auth_event:=NEW; END IF;
 SELECT * INTO completion FROM product_family_events WHERE next->>'operation'='FAMILY_BRAND_CORRECTION'
   AND next->>'authorizationId'=auth_event.id::text;
 prior:=auth_event.previous->'state'; final_state:=fyf_dimension_state(auth_event.family_id);
 IF auth_event.id IS NULL OR completion.id IS NULL OR final_state IS NULL
 OR auth_event.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR completion.family_id IS DISTINCT FROM auth_event.family_id OR completion.product_id IS NOT NULL
 OR completion.user_id IS DISTINCT FROM auth_event.user_id OR completion.reason IS DISTINCT FROM auth_event.reason
 OR completion.next->>'operationKey' IS DISTINCT FROM auth_event.next->>'operationKey'
 OR completion.next->>'requestHash' IS DISTINCT FROM auth_event.next->>'requestHash'
 OR completion.next->>'brand' IS DISTINCT FROM auth_event.next->>'brand'
 OR completion.next->'previousBrand' IS DISTINCT FROM prior->'family'->'brand'
 OR completion.previous->>'revision' IS DISTINCT FROM auth_event.previous->>'revision'
 OR NOT coalesce(completion.next->>'revision' ~ '^[a-f0-9]{64}$',false)
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=auth_event.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR ((final_state->'family')-'brand'-'updated_at') IS DISTINCT FROM ((prior->'family')-'brand'-'updated_at')
 OR final_state->'family'->>'brand' IS DISTINCT FROM auth_event.next->>'brand'
 OR (final_state-'family'-'members') IS DISTINCT FROM (prior-'family'-'members')
 OR jsonb_array_length(final_state->'members')<>jsonb_array_length(prior->'members')
 OR completion.next->'productIds' IS DISTINCT FROM (SELECT jsonb_agg((value->'product'->>'id')::integer ORDER BY (value->'product'->>'id')::integer) FROM jsonb_array_elements(prior->'members'))
 THEN RAISE EXCEPTION 'Incomplete or inconsistent family brand correction audit' USING ERRCODE='23514'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(prior->'members') LOOP
  SELECT value INTO current_member FROM jsonb_array_elements(final_state->'members') WHERE value->'product'->>'id'=member->'product'->>'id';
  IF current_member IS NULL OR current_member->'values' IS DISTINCT FROM member->'values'
  OR ((current_member->'product')-'brand'-'updated_at') IS DISTINCT FROM ((member->'product')-'brand'-'updated_at')
  OR current_member->'product'->>'brand' IS DISTINCT FROM auth_event.next->>'brand'
  THEN RAISE EXCEPTION 'Brand correction must preserve every other SKU field' USING ERRCODE='23514'; END IF;
  PERFORM fyf_assert_product_name_ready((member->'product'->>'id')::integer);
  PERFORM fyf_verify_variant((member->'product'->>'id')::integer);
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER family_brand_audit_commit AFTER INSERT ON product_family_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fyf_verify_family_brand_audit();
