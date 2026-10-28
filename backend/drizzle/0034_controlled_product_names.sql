CREATE FUNCTION fyf_assert_product_name_ready(pid integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocking integer;
BEGIN
  SELECT q.id INTO blocking FROM delivery_quote_requests q JOIN delivery_quote_items i ON i.request_id=q.id
    WHERE i.product_id=pid AND q.status IN ('REQUESTED','ASSIGNED','PROPOSED','APPROVED') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'La solicitud de despacho #% sigue abierta; resuélvala antes de corregir el nombre',blocking USING ERRCODE='23514'; END IF;
  SELECT o.id INTO blocking FROM online_orders o JOIN online_order_items i ON i.order_id=o.id
    WHERE i.product_id=pid AND o.status<>'DELIVERED'
    AND NOT EXISTS(SELECT 1 FROM delivery_quote_requests q WHERE q.id=o.delivery_quote_request_id AND q.status='CLOSED_UNPAID') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'El pedido online #% sigue operativo o admite reintento de pago; cierre su proceso antes de corregir el nombre',blocking USING ERRCODE='23514'; END IF;
  SELECT d.sale_id INTO blocking FROM sale_deliveries d JOIN sale_details i ON i.sale_id=d.sale_id
    WHERE i.product_id=pid AND d.status<>'DELIVERED' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'El reparto de la venta #% está pendiente',blocking USING ERRCODE='23514'; END IF;
  SELECT r.id INTO blocking FROM sale_cancellation_requests r JOIN sale_details i ON i.sale_id=r.sale_id
    WHERE i.product_id=pid AND r.status='PENDING' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'La devolución #% está pendiente de revisión',blocking USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM sale_details i WHERE i.product_id=pid AND NOT EXISTS(SELECT 1 FROM commercial_identity_snapshots s WHERE s.sale_id=i.sale_id AND s.product_id=pid))
    OR EXISTS(SELECT 1 FROM online_order_items i WHERE i.product_id=pid AND NOT EXISTS(SELECT 1 FROM commercial_identity_snapshots s WHERE s.order_id=i.order_id AND s.product_id=pid))
    OR EXISTS(SELECT 1 FROM inventory_movements i WHERE i.product_id=pid AND NOT EXISTS(SELECT 1 FROM commercial_identity_snapshots s WHERE s.movement_id=i.id))
    OR EXISTS(SELECT 1 FROM delivery_quote_items i WHERE i.product_id=pid AND NOT EXISTS(SELECT 1 FROM commercial_identity_snapshots s WHERE s.delivery_quote_item_id=i.id)) THEN
    RAISE EXCEPTION 'Falta una captura histórica; no se autoriza corregir este nombre' USING ERRCODE='23514';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX product_name_correction_key ON product_family_events((next->>'operationKey')) WHERE next->>'operation'='PRODUCT_NAME_CORRECTION';
--> statement-breakpoint
CREATE FUNCTION fyf_check_product_name_correction(old_product products,new_product products) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(old_product)-'name'-'updated_at') IS DISTINCT FROM (to_jsonb(new_product)-'name'-'updated_at')
    OR lower(regexp_replace(btrim(old_product.name),'\s+',' ','g'))=lower(regexp_replace(btrim(new_product.name),'\s+',' ','g'))
    OR length(new_product.name) NOT BETWEEN 2 AND 150
    OR new_product.name<>regexp_replace(btrim(new_product.name),'\s+',' ','g') OR new_product.name ~ '[[:cntrl:]]'
    OR NOT EXISTS(SELECT 1 FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
      WHERE e.product_id=old_product.id AND e.family_id IS NOT DISTINCT FROM old_product.family_id AND r.name='ADMIN' AND u.status='ACTIVE'
      AND e.previous->>'transactionId'=pg_current_xact_id()::text AND e.previous->'product'=to_jsonb(old_product)
      AND e.next->>'operation'='PRODUCT_NAME_CORRECTION' AND e.next->>'name'=new_product.name
      AND (e.next->>'revision')::timestamp=new_product.updated_at
      AND e.next->>'operationKey' ~ '^[a-zA-Z0-9-]{20,80}$' AND e.next->>'requestHash' ~ '^[a-f0-9]{64}$'
      AND length(btrim(e.reason)) BETWEEN 8 AND 500) THEN
    RAISE EXCEPTION 'Name correction requires unchanged product and transactional ADMIN audit' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM products p WHERE p.id<>old_product.id AND p.category_id=old_product.category_id
    AND lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=lower(new_product.name)) THEN
    RAISE EXCEPTION 'Ya existe un producto con ese nombre en la categoría' USING ERRCODE='23514';
  END IF;
  PERFORM fyf_assert_product_name_ready(old_product.id);
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
CREATE FUNCTION fyf_guard_product_name_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='TRUNCATE' OR OLD.next->>'operation'='PRODUCT_NAME_CORRECTION' OR NEW.next->>'operation'='PRODUCT_NAME_CORRECTION' THEN
    RAISE EXCEPTION 'Product name correction audit is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_name_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_product_name_audit();
--> statement-breakpoint
CREATE TRIGGER product_name_audit_no_truncate BEFORE TRUNCATE ON product_family_events FOR EACH STATEMENT EXECUTE FUNCTION fyf_guard_product_name_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_verify_product_name_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_product jsonb;
BEGIN
  IF NEW.next->>'operation'='PRODUCT_NAME_CORRECTION' THEN
    SELECT to_jsonb(p) INTO current_product FROM products p WHERE id=NEW.product_id;
    IF NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
      OR current_product->>'name' IS DISTINCT FROM NEW.next->>'name'
      OR (current_product-'name'-'updated_at') IS DISTINCT FROM ((NEW.previous->'product')-'name'-'updated_at')
      OR (NEW.next->>'revision')::timestamp IS DISTINCT FROM (current_product->>'updated_at')::timestamp THEN
      RAISE EXCEPTION 'Name audit must commit with its exact product correction' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER product_name_audit_commit AFTER INSERT ON product_family_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fyf_verify_product_name_audit();
