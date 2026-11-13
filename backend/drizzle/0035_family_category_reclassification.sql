-- No source rows, snapshots or previous guards are changed.
CREATE UNIQUE INDEX family_category_change_key ON product_family_events((next->>'operationKey')) WHERE next->>'operation'='FAMILY_CATEGORY_CHANGE';
--> statement-breakpoint
CREATE FUNCTION fyf_guard_family_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.next->>'operation'='FAMILY_CATEGORY_CHANGE' OR NEW.next->>'operation'='FAMILY_CATEGORY_CHANGE' THEN
    RAISE EXCEPTION 'Family category audit is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER family_category_audit_guard BEFORE UPDATE OR DELETE ON product_family_events FOR EACH ROW EXECUTE FUNCTION fyf_guard_family_category_audit();
-- TRUNCATE is already prohibited by 0034; category/brand coherence remains deferred to COMMIT by 0027.
