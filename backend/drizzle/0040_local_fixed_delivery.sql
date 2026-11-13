-- Adds a distinct mode; never rewrites existing revisions, requests or orders.
ALTER TABLE "delivery_policy_revisions" DROP CONSTRAINT "delivery_manual_policy_check";--> statement-breakpoint
ALTER TABLE "delivery_policy_revisions" ADD CONSTRAINT "delivery_manual_policy_check" CHECK (("delivery_policy_revisions"."pricing_mode" is null and "delivery_policy_revisions"."conditional_free_enabled" is null and "delivery_policy_revisions"."conditional_free_from" is null and "delivery_policy_revisions"."approval_validity_hours" is null and "delivery_policy_revisions"."evaluation_validity_hours" is null) or ("delivery_policy_revisions"."pricing_mode" is not null and "delivery_policy_revisions"."pricing_mode"='MANUAL_QUOTE' and "delivery_policy_revisions"."conditional_free_enabled" is not null and "delivery_policy_revisions"."conditional_free_from" is not null and "delivery_policy_revisions"."conditional_free_from">0 and "delivery_policy_revisions"."conditional_free_from"=trunc("delivery_policy_revisions"."conditional_free_from") and "delivery_policy_revisions"."approval_validity_hours" is not null and "delivery_policy_revisions"."evaluation_validity_hours" is not null and "delivery_policy_revisions"."approval_validity_hours" between 1 and 168 and "delivery_policy_revisions"."evaluation_validity_hours" between 1 and 720 and "delivery_policy_revisions"."pickup_enabled"=true and "delivery_policy_revisions"."flat_fee"=0 and "delivery_policy_revisions"."free_shipping_from" is null and "delivery_policy_revisions"."minimum_products_total" is null and "delivery_policy_revisions"."is_demo"=false) or ("delivery_policy_revisions"."pricing_mode"='LOCAL_FIXED' and "delivery_policy_revisions"."conditional_free_enabled" is null and "delivery_policy_revisions"."conditional_free_from" is null and "delivery_policy_revisions"."approval_validity_hours" is null and "delivery_policy_revisions"."evaluation_validity_hours" is null and "delivery_policy_revisions"."minimum_products_total" is null and "delivery_policy_revisions"."pickup_enabled"=true and "delivery_policy_revisions"."is_demo"=false));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fyf_online_order_manual_quote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acceptance delivery_quote_events%ROWTYPE; approval delivery_quote_revisions%ROWTYPE; request delivery_quote_requests%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.delivery_quote_request_id,NEW.delivery_quote_acceptance_id) IS DISTINCT FROM (OLD.delivery_quote_request_id,OLD.delivery_quote_acceptance_id) THEN
      RAISE EXCEPTION 'Historical quotation references cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.delivery_quote_request_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO request FROM delivery_quote_requests WHERE id=NEW.delivery_quote_request_id;
  SELECT * INTO acceptance FROM delivery_quote_events WHERE id=NEW.delivery_quote_acceptance_id AND request_id=request.id AND type='ACCEPTED';
  SELECT * INTO approval FROM delivery_quote_revisions WHERE id=acceptance.revision_id AND request_id=request.id AND kind='APPROVED';
  IF request.status IS DISTINCT FROM 'APPROVED' OR acceptance.id IS NULL OR approval.id IS NULL OR approval.valid_until<=now()
    OR acceptance.payload->>'approvedRequestVersion' IS DISTINCT FROM request.version::text
    OR acceptance.payload->>'approvedRevisionId' IS DISTINCT FROM approval.id::text
    OR acceptance.payload->>'total' IS DISTINCT FROM NEW.total::text
    OR length(coalesce(acceptance.payload->>'quoteFingerprint',''))<>64 OR length(coalesce(acceptance.payload->>'commercialSignature',''))<>64
    OR NEW.delivery_fee IS DISTINCT FROM approval.amount
    OR NEW.client_id IS DISTINCT FROM request.client_id
    OR (NEW.client_id IS NOT NULL AND (acceptance.actor_kind<>'USER' OR acceptance.actor_id IS DISTINCT FROM NEW.client_id))
    OR (NEW.client_id IS NULL AND (acceptance.actor_kind<>'GUEST' OR NEW.guest_email IS DISTINCT FROM request.guest_email OR NEW.guest_session_hash IS DISTINCT FROM request.guest_session_hash))
    OR (NEW.delivery_recipient_name,NEW.delivery_phone,NEW.delivery_address,NEW.delivery_commune,NEW.delivery_reference)
       IS DISTINCT FROM (request.recipient_name,request.phone,request.address,request.commune,request.reference)
    OR approval.id IS DISTINCT FROM (SELECT id FROM delivery_quote_revisions WHERE request_id=request.id ORDER BY version DESC LIMIT 1)
    OR NEW.delivery_fee_reason IS DISTINCT FROM (CASE approval.reason WHEN 'PAID_FREIGHT' THEN 'MANUAL_APPROVED' WHEN 'FREE_RADIUS' THEN 'MANUAL_FREE_RADIUS' WHEN 'FREE_CONDITIONAL' THEN 'MANUAL_FREE_CONDITIONAL' WHEN 'FREE_EXCEPTION' THEN 'MANUAL_FREE_EXCEPTION' END)
    OR NOT EXISTS(SELECT 1 FROM delivery_settings s JOIN delivery_policy_revisions p ON p.id=s.current_revision_id WHERE s.id=1 AND p.pricing_mode IN ('MANUAL_QUOTE','LOCAL_FIXED') AND p.delivery_enabled)
    OR NOT EXISTS(SELECT 1 FROM delivery_policy_revisions p WHERE p.id=approval.policy_revision_id AND p.pricing_mode='MANUAL_QUOTE' AND p.delivery_enabled) THEN
    RAISE EXCEPTION 'Manual delivery requires its current approval and buyer acceptance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION fyf_local_fixed_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy delivery_policy_revisions%ROWTYPE; expected_fee numeric; expected_reason text;
BEGIN
  SELECT * INTO policy FROM delivery_policy_revisions WHERE id=NEW.delivery_policy_revision_id;
  IF policy.pricing_mode IS DISTINCT FROM 'LOCAL_FIXED' OR NEW.delivery_type<>'DELIVERY' THEN RETURN NEW; END IF;
  expected_fee:=CASE WHEN policy.free_shipping_from IS NOT NULL AND NEW.products_subtotal-NEW.products_discount_total>policy.free_shipping_from THEN 0 ELSE policy.flat_fee END;
  expected_reason:=CASE WHEN policy.free_shipping_from IS NOT NULL AND NEW.products_subtotal-NEW.products_discount_total>policy.free_shipping_from THEN 'FREE_THRESHOLD' ELSE 'FLAT' END;
  IF NEW.delivery_quote_request_id IS NOT NULL OR NOT policy.delivery_enabled
    OR NOT EXISTS(SELECT 1 FROM delivery_settings WHERE id=1 AND current_revision_id=policy.id)
    OR lower(regexp_replace(btrim(coalesce(NEW.delivery_commune,'')),'\s+',' ','g'))<>'santa juana'
    OR NEW.delivery_fee IS DISTINCT FROM expected_fee OR NEW.delivery_fee_reason IS DISTINCT FROM expected_reason THEN
    RAISE EXCEPTION 'Local delivery requires Santa Juana and its server-calculated current tariff' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER local_fixed_order_guard BEFORE INSERT ON online_orders FOR EACH ROW EXECUTE FUNCTION fyf_local_fixed_order_guard();
--> statement-breakpoint
-- Once activated, manual compatibility can only refer to requests already stored.
-- Same policy lock/order as application request creation and policy activation.
CREATE FUNCTION fyf_preserve_legacy_delivery_request_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtext('fyf-delivery-policy'));
  IF EXISTS(SELECT 1 FROM delivery_settings s JOIN delivery_policy_revisions p ON p.id=s.current_revision_id WHERE s.id=1 AND p.pricing_mode='LOCAL_FIXED') THEN
    RAISE EXCEPTION 'New purchases use local delivery checkout, not manual quotation requests' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legacy_delivery_request_scope BEFORE INSERT ON delivery_quote_requests FOR EACH ROW EXECUTE FUNCTION fyf_preserve_legacy_delivery_request_scope();
