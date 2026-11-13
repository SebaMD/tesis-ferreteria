-- Preserve the existing identity trigger; allow only an audited, classification-only detach.
-- No tables, columns, identifiers or existing rows are changed by this migration.
CREATE OR REPLACE FUNCTION fyf_preserve_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean; detached product_family_events%ROWTYPE;
BEGIN
  SELECT EXISTS(SELECT 1 FROM sale_details WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM online_order_items WHERE product_id=OLD.id)
    OR EXISTS(SELECT 1 FROM inventory_movements WHERE product_id=OLD.id) INTO has_history;

  IF has_history AND (OLD.name IS DISTINCT FROM NEW.name OR OLD.brand IS DISTINCT FROM NEW.brand
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
