ALTER TABLE "delivery_quote_events" DROP CONSTRAINT "delivery_quote_event_check";--> statement-breakpoint
ALTER TABLE "delivery_quote_requests" DROP CONSTRAINT "delivery_quote_state_check";--> statement-breakpoint
ALTER TABLE "delivery_quote_events" ADD CONSTRAINT "delivery_quote_event_check" CHECK ("delivery_quote_events"."actor_kind" in ('USER','GUEST','SYSTEM') and (("delivery_quote_events"."actor_kind"='USER' and "delivery_quote_events"."actor_id" is not null) or ("delivery_quote_events"."actor_kind"<>'USER' and "delivery_quote_events"."actor_id" is null)) and "delivery_quote_events"."type" in ('REQUESTED','ASSIGNED','PROPOSED','APPROVED','CORRECTIONS','REJECTED','CANCELLED','EXPIRED','ACCESS_RECOVERED','ACCESS_REVOKED','ACCEPTED','ORDER_CREATED','PAYMENT_CLOSED') and (("delivery_quote_events"."command_key" is null and "delivery_quote_events"."command_hash" is null) or ("delivery_quote_events"."command_key" is not null and "delivery_quote_events"."command_hash" is not null and length("delivery_quote_events"."command_hash")=64)));--> statement-breakpoint
ALTER TABLE "delivery_quote_requests" ADD CONSTRAINT "delivery_quote_state_check" CHECK ("delivery_quote_requests"."status" in ('REQUESTED','ASSIGNED','PROPOSED','APPROVED','REJECTED','CANCELLED','EXPIRED','ORDER_CREATED','CLOSED_UNPAID') and "delivery_quote_requests"."version">0 and ("delivery_quote_requests"."status" not in ('ASSIGNED','PROPOSED') or "delivery_quote_requests"."assigned_to" is not null));
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
    OR NOT EXISTS(SELECT 1 FROM delivery_settings s JOIN delivery_policy_revisions p ON p.id=s.current_revision_id WHERE s.id=1 AND p.pricing_mode='MANUAL_QUOTE' AND p.delivery_enabled) THEN
    RAISE EXCEPTION 'Manual delivery requires its current approval and buyer acceptance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
