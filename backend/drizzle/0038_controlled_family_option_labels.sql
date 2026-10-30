-- No label backfill or new normalized-label index: legacy labels remain untouched.
CREATE UNIQUE INDEX option_label_operation_key ON product_family_events((next->>'operationKey'),(next->>'operation')) WHERE next->>'operation' IN ('OPTION_LABEL_AUTHORIZATION','OPTION_LABEL_CORRECTION');
--> statement-breakpoint
CREATE FUNCTION fyf_option_label_members(fid integer,aid integer,oid integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(product_id ORDER BY product_id),'[]'::jsonb) FROM product_variant_values WHERE family_id=fid AND attribute_id=aid AND option_id=oid;
$$;
--> statement-breakpoint
CREATE FUNCTION fyf_start_option_label_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior jsonb; target jsonb; pid jsonb;
BEGIN
 IF NEW.next->>'operation' IS DISTINCT FROM 'OPTION_LABEL_AUTHORIZATION' THEN RETURN NEW; END IF;
 prior:=fyf_dimension_state(NEW.family_id);
 SELECT value INTO target FROM jsonb_array_elements(prior->'options') WHERE value->>'id'=NEW.next->>'optionId' AND value->>'attribute_id'=NEW.next->>'attributeId';
 IF NEW.product_id IS NOT NULL OR prior IS NULL OR target IS NULL OR prior IS DISTINCT FROM NEW.previous->'state'
 OR NEW.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR NOT coalesce(NEW.next->>'operationKey' ~ '^[a-zA-Z0-9-]{20,80}$',false)
 OR NOT coalesce(NEW.next->>'requestHash' ~ '^[a-f0-9]{64}$',false)
 OR NOT coalesce(NEW.previous->>'revision' ~ '^[a-f0-9]{64}$',false)
 OR length(btrim(NEW.reason)) NOT BETWEEN 8 AND 500
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=NEW.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR prior->'family'->>'archived_at' IS NOT NULL
 OR jsonb_typeof(NEW.next->'label') IS DISTINCT FROM 'string'
 OR length(NEW.next->>'label') NOT BETWEEN 1 AND 100 OR NEW.next->>'label' ~ '[[:cntrl:]]'
 OR NEW.next->>'label' IS DISTINCT FROM regexp_replace(btrim(NEW.next->>'label'),'\s+',' ','g')
 OR lower(regexp_replace(btrim(target->>'label'),'\s+',' ','g'))=lower(NEW.next->>'label')
 OR EXISTS(SELECT 1 FROM family_attribute_options o WHERE o.attribute_id=(NEW.next->>'attributeId')::integer AND o.id<>(NEW.next->>'optionId')::integer AND lower(regexp_replace(btrim(o.label),'\s+',' ','g'))=lower(NEW.next->>'label'))
 OR NEW.next->'productIds' IS DISTINCT FROM fyf_option_label_members(NEW.family_id,(NEW.next->>'attributeId')::integer,(NEW.next->>'optionId')::integer)
 THEN RAISE EXCEPTION 'Invalid transactional ADMIN option label authorization' USING ERRCODE='23514'; END IF;
 FOR pid IN SELECT value FROM jsonb_array_elements(NEW.next->'productIds') LOOP PERFORM fyf_assert_product_name_ready(pid::text::integer); END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER option_label_audit_start BEFORE INSERT ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_start_option_label_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_check_option_label(old_option family_attribute_options,new_option family_attribute_options) RETURNS void LANGUAGE plpgsql AS $$
DECLARE audit product_family_events%ROWTYPE; prior_option jsonb;
BEGIN
 SELECT e.* INTO audit FROM product_family_events e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id
 WHERE e.product_id IS NULL AND e.next->>'operation'='OPTION_LABEL_AUTHORIZATION'
 AND e.next->>'optionId'=old_option.id::text AND e.next->>'attributeId'=old_option.attribute_id::text
 AND e.previous->>'transactionId'=pg_current_xact_id()::text AND r.name='ADMIN' AND u.status='ACTIVE' ORDER BY e.id DESC LIMIT 1;
 SELECT value INTO prior_option FROM jsonb_array_elements(audit.previous->'state'->'options') WHERE value->>'id'=old_option.id::text;
 IF audit.id IS NULL OR prior_option IS DISTINCT FROM to_jsonb(old_option)
 OR (to_jsonb(old_option)-'label') IS DISTINCT FROM (to_jsonb(new_option)-'label')
 OR new_option.label IS DISTINCT FROM audit.next->>'label' THEN
  RAISE EXCEPTION 'Option label requires exact unchanged option and transactional ADMIN audit' USING ERRCODE='23514';
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fyf_preserve_used_option() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.label IS DISTINCT FROM NEW.label THEN PERFORM fyf_check_option_label(OLD,NEW);
 ELSIF OLD.attribute_id IS DISTINCT FROM NEW.attribute_id AND EXISTS(SELECT 1 FROM product_variant_values WHERE option_id=OLD.id) THEN
  RAISE EXCEPTION 'Used option identity cannot change' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION fyf_guard_option_label_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.next->>'operation' IN ('OPTION_LABEL_AUTHORIZATION','OPTION_LABEL_CORRECTION') OR NEW.next->>'operation' IN ('OPTION_LABEL_AUTHORIZATION','OPTION_LABEL_CORRECTION') THEN
  RAISE EXCEPTION 'Option label audit is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER option_label_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_option_label_audit();
--> statement-breakpoint
CREATE FUNCTION fyf_verify_option_label_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE auth_event product_family_events%ROWTYPE; completion product_family_events%ROWTYPE; prior jsonb; final_state jsonb; old_option jsonb; current_option jsonb; target jsonb; pid jsonb;
BEGIN
 IF NEW.next->>'operation' NOT IN ('OPTION_LABEL_AUTHORIZATION','OPTION_LABEL_CORRECTION') OR NEW.next->>'operation' IS NULL THEN RETURN NEW; END IF;
 IF NEW.next->>'operation'='OPTION_LABEL_CORRECTION' THEN
  SELECT * INTO auth_event FROM product_family_events WHERE id=(NEW.next->>'authorizationId')::integer AND next->>'operation'='OPTION_LABEL_AUTHORIZATION';
 ELSE auth_event:=NEW; END IF;
 SELECT * INTO completion FROM product_family_events WHERE next->>'operation'='OPTION_LABEL_CORRECTION' AND next->>'authorizationId'=auth_event.id::text;
 prior:=auth_event.previous->'state'; final_state:=fyf_dimension_state(auth_event.family_id);
 SELECT value INTO target FROM jsonb_array_elements(prior->'options') WHERE value->>'id'=auth_event.next->>'optionId';
 IF auth_event.id IS NULL OR completion.id IS NULL OR final_state IS NULL OR target IS NULL
 OR auth_event.previous->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR completion.product_id IS NOT NULL OR completion.family_id IS DISTINCT FROM auth_event.family_id
 OR completion.user_id IS DISTINCT FROM auth_event.user_id OR completion.reason IS DISTINCT FROM auth_event.reason
 OR completion.next->>'operationKey' IS DISTINCT FROM auth_event.next->>'operationKey'
 OR completion.next->>'requestHash' IS DISTINCT FROM auth_event.next->>'requestHash'
 OR completion.next->>'attributeId' IS DISTINCT FROM auth_event.next->>'attributeId'
 OR completion.next->>'optionId' IS DISTINCT FROM auth_event.next->>'optionId'
 OR completion.next->'productIds' IS DISTINCT FROM auth_event.next->'productIds'
 OR completion.next->>'label' IS DISTINCT FROM auth_event.next->>'label'
 OR completion.next->>'previousLabel' IS DISTINCT FROM target->>'label'
 OR completion.previous->>'revision' IS DISTINCT FROM auth_event.previous->>'revision'
 OR NOT coalesce(completion.next->>'revision' ~ '^[a-f0-9]{64}$',false)
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=auth_event.user_id AND r.name='ADMIN' AND u.status='ACTIVE')
 OR (final_state-'family'-'options') IS DISTINCT FROM (prior-'family'-'options')
 OR ((final_state->'family')-'updated_at') IS DISTINCT FROM ((prior->'family')-'updated_at')
 OR jsonb_array_length(final_state->'options')<>jsonb_array_length(prior->'options')
 OR auth_event.next->'productIds' IS DISTINCT FROM fyf_option_label_members(auth_event.family_id,(auth_event.next->>'attributeId')::integer,(auth_event.next->>'optionId')::integer)
 THEN RAISE EXCEPTION 'Incomplete or inconsistent option label audit' USING ERRCODE='23514'; END IF;
 FOR old_option IN SELECT value FROM jsonb_array_elements(prior->'options') LOOP
  SELECT value INTO current_option FROM jsonb_array_elements(final_state->'options') WHERE value->>'id'=old_option->>'id';
  IF old_option->>'id'=auth_event.next->>'optionId' THEN old_option:=jsonb_set(old_option,'{label}',auth_event.next->'label'); END IF;
  IF current_option IS DISTINCT FROM old_option THEN RAISE EXCEPTION 'Only the authorized option label may change' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR pid IN SELECT value FROM jsonb_array_elements(auth_event.next->'productIds') LOOP PERFORM fyf_assert_product_name_ready(pid::text::integer); END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER option_label_audit_commit AFTER INSERT ON product_family_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fyf_verify_option_label_audit();
