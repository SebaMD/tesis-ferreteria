-- Explicit additive classification only; existing historical identity checks remain active.
CREATE FUNCTION fyf_dimension_state(fid integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object('family',to_jsonb(f),
 'attributes',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM family_attributes a WHERE family_id=fid),'[]'::jsonb),
 'options',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM family_attribute_options o JOIN family_attributes a ON a.id=o.attribute_id WHERE a.family_id=fid),'[]'::jsonb),
 'images',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM product_images i JOIN products p ON p.id=i.product_id WHERE p.family_id=fid),'[]'::jsonb),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('product',to_jsonb(p),'values',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY attribute_id) FROM product_variant_values v WHERE product_id=p.id),'[]'::jsonb)) ORDER BY p.id) FROM products p WHERE family_id=fid),'[]'::jsonb))
FROM product_families f WHERE f.id=fid;
$$;
--> statement-breakpoint
CREATE FUNCTION fyf_dimension_has_detached_history(fid integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM product_family_events e JOIN products p ON p.id=e.product_id
 WHERE e.next->>'operation'='DETACH' AND e.family_id=fid AND p.family_id IS DISTINCT FROM fid
 AND (EXISTS(SELECT 1 FROM sale_details WHERE product_id=p.id) OR EXISTS(SELECT 1 FROM online_order_items WHERE product_id=p.id) OR EXISTS(SELECT 1 FROM inventory_movements WHERE product_id=p.id)));
$$;
--> statement-breakpoint
CREATE FUNCTION fyf_authorized_dimension_extension(old_product products,new_product products) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE audit product_family_events%ROWTYPE; assignment jsonb; old_member jsonb; canonical text;
BEGIN
 SELECT e.* INTO audit FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
 WHERE e.family_id=old_product.family_id AND e.product_id IS NULL AND e.next->>'operation'='DIMENSION_ADD_AUTHORIZATION'
 AND e.previous->>'transactionId'=pg_current_xact_id()::text AND r.name='ADMIN' AND u.status='ACTIVE'
 AND length(btrim(e.reason)) BETWEEN 8 AND 500 ORDER BY e.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT value INTO old_member FROM jsonb_array_elements(audit.previous->'state'->'members') WHERE (value->'product'->>'id')::integer=old_product.id;
 SELECT value INTO assignment FROM jsonb_array_elements(audit.next->'assignments') WHERE (value->>'productId')::integer=old_product.id;
 SELECT string_agg(o.id::text,',' ORDER BY o.attribute_id) INTO canonical
 FROM family_attribute_options o WHERE o.id=ANY(string_to_array(old_product.variant_key,',')::integer[] || (assignment->>'optionId')::integer);
 IF old_member->'product' IS DISTINCT FROM to_jsonb(old_product) OR assignment IS NULL
 OR old_product.family_id IS DISTINCT FROM new_product.family_id
 OR (to_jsonb(old_product)-'variant_key'-'updated_at') IS DISTINCT FROM (to_jsonb(new_product)-'variant_key'-'updated_at')
 OR new_product.variant_key IS DISTINCT FROM canonical OR assignment->>'variantKey' IS DISTINCT FROM canonical
 OR NOT EXISTS(SELECT 1 FROM family_attribute_options WHERE id=(assignment->>'optionId')::integer AND attribute_id=(audit.next->'attribute'->>'id')::integer) THEN
   RAISE EXCEPTION 'Dimension extension must preserve every existing SKU field and option' USING ERRCODE='23514';
 END IF;
 PERFORM fyf_assert_product_name_ready(old_product.id);
 RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fyf_preserve_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean; detached product_family_events%ROWTYPE;
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN PERFORM fyf_check_product_name_correction(OLD,NEW); END IF;
  SELECT EXISTS(SELECT 1 FROM sale_details WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM online_order_items WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM inventory_movements WHERE product_id=OLD.id) INTO has_history;

  IF has_history AND (OLD.brand IS DISTINCT FROM NEW.brand
    OR OLD.unit_measure IS DISTINCT FROM NEW.unit_measure) THEN
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
CREATE UNIQUE INDEX dimension_operation_key ON product_family_events((next->>'operationKey'),(next->>'operation')) WHERE next->>'operation' IN ('DIMENSION_ADD_AUTHORIZATION','DIMENSION_ADD');
--> statement-breakpoint
CREATE FUNCTION fyf_guard_dimension_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.next->>'operation' IN ('DIMENSION_ADD_AUTHORIZATION','DIMENSION_ADD') OR NEW.next->>'operation' IN ('DIMENSION_ADD_AUTHORIZATION','DIMENSION_ADD') THEN
  RAISE EXCEPTION 'Dimension audit is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER dimension_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_dimension_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_start_dimension_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_state jsonb; prior jsonb; a jsonb; o jsonb; member jsonb;
BEGIN
 IF NEW.next->>'operation' IS DISTINCT FROM 'DIMENSION_ADD_AUTHORIZATION' THEN RETURN NEW; END IF;
 current_state:=fyf_dimension_state(NEW.family_id); prior:=NEW.previous->'state'; a:=NEW.next->'attribute'; o:=NEW.next->'options';
 IF NEW.product_id IS NOT NULL OR current_state IS NULL OR prior IS NULL
 OR NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR NOT coalesce(NEW.next->>'operationKey' ~ '^[a-zA-Z0-9-]{20,80}$',false)
 OR NOT coalesce(NEW.next->>'requestHash' ~ '^[a-f0-9]{64}$',false)
 OR NOT coalesce(NEW.previous->>'revision' ~ '^[a-f0-9]{64}$',false)
 OR length(btrim(NEW.reason)) NOT BETWEEN 8 AND 500
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=NEW.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR (current_state-'attributes'-'options') IS DISTINCT FROM (prior-'attributes'-'options')
 OR NOT coalesce((current_state->'attributes') @> (prior->'attributes'),false)
 OR NOT coalesce((current_state->'attributes') @> jsonb_build_array(a),false)
 OR jsonb_array_length(current_state->'attributes')<>jsonb_array_length(prior->'attributes')+1
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior->'attributes') x WHERE x->>'id'=a->>'id')
 OR (a->>'family_id')::integer IS DISTINCT FROM NEW.family_id
 OR NOT coalesce((current_state->'options') @> (prior->'options'),false)
 OR NOT coalesce((current_state->'options') @> o,false)
 OR jsonb_array_length(o) NOT BETWEEN 1 AND 100
 OR jsonb_array_length(current_state->'options')<>jsonb_array_length(prior->'options')+jsonb_array_length(o)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(o) x WHERE (x->>'attribute_id') IS DISTINCT FROM a->>'id')
 OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(o) x)<>jsonb_array_length(o)
 OR jsonb_array_length(prior->'members')<1
 OR jsonb_array_length(NEW.next->'assignments')<>jsonb_array_length(prior->'members')
 OR (SELECT count(DISTINCT x->>'productId') FROM jsonb_array_elements(NEW.next->'assignments') x)<>jsonb_array_length(prior->'members')
 OR fyf_dimension_has_detached_history(NEW.family_id) THEN
  RAISE EXCEPTION 'Dimension authorization must capture the exact unchanged family and members' USING ERRCODE='23514';
 END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(prior->'members') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.next->'assignments') x JOIN family_attribute_options opt ON opt.id=(x->>'optionId')::integer
    WHERE x->>'productId'=member->'product'->>'id' AND opt.attribute_id=(a->>'id')::integer) THEN
   RAISE EXCEPTION 'Every existing member requires one new option' USING ERRCODE='23514';
  END IF;
  PERFORM fyf_assert_product_name_ready((member->'product'->>'id')::integer);
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER dimension_audit_start BEFORE INSERT ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_start_dimension_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_verify_dimension_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE final_state jsonb; prior jsonb; member jsonb; current_member jsonb; assignment jsonb; new_value jsonb; a jsonb; o jsonb;
BEGIN
 IF NEW.next->>'operation'='DIMENSION_ADD' THEN
  IF NOT EXISTS(SELECT 1 FROM product_family_events e WHERE e.id=(NEW.next->>'authorizationId')::integer AND e.family_id=NEW.family_id AND e.user_id=NEW.user_id
    AND e.next->>'operation'='DIMENSION_ADD_AUTHORIZATION' AND e.previous->>'transactionId'=pg_current_xact_id()::text
    AND e.next->>'operationKey'=NEW.next->>'operationKey' AND e.next->>'requestHash'=NEW.next->>'requestHash') THEN
    RAISE EXCEPTION 'Missing dimension authorization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.next->>'operation' IS DISTINCT FROM 'DIMENSION_ADD_AUTHORIZATION' THEN RETURN NEW; END IF;
 prior:=NEW.previous->'state'; final_state:=fyf_dimension_state(NEW.family_id); a:=NEW.next->'attribute'; o:=NEW.next->'options';
 IF NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text OR final_state IS NULL
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=NEW.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR ((final_state->'family')-'updated_at') IS DISTINCT FROM ((prior->'family')-'updated_at')
 OR final_state->'images' IS DISTINCT FROM prior->'images'
 OR NOT ((final_state->'attributes') @> (prior->'attributes')) OR NOT ((final_state->'attributes') @> jsonb_build_array(a))
 OR jsonb_array_length(final_state->'attributes')<>jsonb_array_length(prior->'attributes')+1
 OR jsonb_array_length(final_state->'attributes')>8
 OR NOT ((final_state->'options') @> (prior->'options')) OR NOT ((final_state->'options') @> o)
 OR jsonb_array_length(final_state->'options')<>jsonb_array_length(prior->'options')+jsonb_array_length(o)
 OR jsonb_array_length(final_state->'members')<>jsonb_array_length(prior->'members')
 OR jsonb_array_length(NEW.next->'assignments')<>jsonb_array_length(prior->'members')
 OR fyf_dimension_has_detached_history(NEW.family_id)
 OR NOT EXISTS(SELECT 1 FROM product_family_events e WHERE e.family_id=NEW.family_id AND e.user_id=NEW.user_id
   AND e.next->>'operation'='DIMENSION_ADD' AND e.next->>'operationKey'=NEW.next->>'operationKey'
   AND e.next->>'requestHash'=NEW.next->>'requestHash' AND e.next->>'authorizationId'=NEW.id::text)
 THEN RAISE EXCEPTION 'Incomplete or unauthorized dimension expansion audit' USING ERRCODE='23514'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(prior->'members') LOOP
  SELECT value INTO current_member FROM jsonb_array_elements(final_state->'members') WHERE value->'product'->>'id'=member->'product'->>'id';
  SELECT value INTO assignment FROM jsonb_array_elements(NEW.next->'assignments') WHERE value->>'productId'=member->'product'->>'id';
  new_value:=jsonb_build_object('product_id',(member->'product'->>'id')::integer,'family_id',NEW.family_id,'attribute_id',(a->>'id')::integer,'option_id',(assignment->>'optionId')::integer);
  IF current_member IS NULL OR assignment IS NULL
   OR ((current_member->'product')-'variant_key'-'updated_at') IS DISTINCT FROM ((member->'product')-'variant_key'-'updated_at')
   OR current_member->'product'->>'variant_key' IS DISTINCT FROM assignment->>'variantKey'
   OR NOT ((current_member->'values') @> (member->'values')) OR NOT ((current_member->'values') @> jsonb_build_array(new_value))
   OR jsonb_array_length(current_member->'values')<>jsonb_array_length(member->'values')+1 THEN
    RAISE EXCEPTION 'Dimension expansion changed an existing classification or SKU' USING ERRCODE='23514';
  END IF;
  PERFORM fyf_verify_variant((member->'product'->>'id')::integer);
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dimension_audit_commit AFTER INSERT ON product_family_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fyf_verify_dimension_audit();

