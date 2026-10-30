ALTER TABLE "family_attributes" ADD COLUMN "measurement_kind" varchar(12);--> statement-breakpoint
ALTER TABLE "family_attributes" ADD COLUMN "unit_code" varchar(4);--> statement-breakpoint
ALTER TABLE "family_attributes" ADD CONSTRAINT "family_attribute_measurement_check" CHECK (coalesce(("family_attributes"."measurement_kind" is null and "family_attributes"."unit_code" is null) or ("family_attributes"."measurement_kind"='length' and "family_attributes"."unit_code" in ('mm','cm','m')) or ("family_attributes"."measurement_kind"='mass' and "family_attributes"."unit_code" in ('g','kg')) or ("family_attributes"."measurement_kind"='volume' and "family_attributes"."unit_code" in ('mL','L')),false));
--> statement-breakpoint
-- Existing definitions stay text (both columns NULL). No backfill or label rewrite.
-- Persisted magnitudes cannot be converted, including an existing text attribute.
CREATE FUNCTION fyf_preserve_attribute_measurement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.measurement_kind IS DISTINCT FROM NEW.measurement_kind OR OLD.unit_code IS DISTINCT FROM NEW.unit_code THEN
  RAISE EXCEPTION 'Persisted attribute type and unit are immutable; controlled legacy conversion is not enabled' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attribute_measurement_guard BEFORE UPDATE ON family_attributes FOR EACH ROW EXECUTE FUNCTION fyf_preserve_attribute_measurement();
--> statement-breakpoint
CREATE FUNCTION fyf_validate_quantitative_option() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE unit text; old_unit text;
BEGIN
 SELECT unit_code INTO unit FROM family_attributes WHERE id=NEW.attribute_id;
 IF TG_OP='UPDATE' THEN
  SELECT unit_code INTO old_unit FROM family_attributes WHERE id=OLD.attribute_id;
  IF (unit IS NOT NULL OR old_unit IS NOT NULL) AND
    (OLD.label IS DISTINCT FROM NEW.label OR OLD.id IS DISTINCT FROM NEW.id OR OLD.attribute_id IS DISTINCT FROM NEW.attribute_id) THEN
   RAISE EXCEPTION 'A quantitative option value and identity are immutable, not a descriptive label correction' USING ERRCODE='23514';
  END IF;
 END IF;
 IF unit IS NOT NULL THEN
  IF NEW.label !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{0,5}[1-9])?$' THEN
   RAISE EXCEPTION 'Quantitative option must be a canonical positive decimal without unit' USING ERRCODE='23514';
  END IF;
  IF NEW.label::numeric <= 0 THEN RAISE EXCEPTION 'Quantitative option must be positive' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quantitative_option_guard BEFORE INSERT OR UPDATE ON family_attribute_options FOR EACH ROW EXECUTE FUNCTION fyf_validate_quantitative_option();
--> statement-breakpoint
-- Only FUTURE captures use this presentation. Existing immutable captures are untouched.
-- Legacy text attributes retain exactly the former snapshot shape and label.
CREATE OR REPLACE FUNCTION fyf_capture_commercial_identity(pid integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('name',p.name,'barcode',p.barcode,'brand',p.brand,'unitMeasure',p.unit_measure,'variantKey',p.variant_key,
   'category',jsonb_build_object('id',c.id,'name',c.name),
   'family',CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('id',f.id,'name',f.name,
     'attributes',coalesce((SELECT jsonb_agg(
       jsonb_build_object('attributeId',a.id,'name',a.name,'optionId',o.id,'label',
         CASE WHEN a.unit_code IS NULL THEN o.label ELSE o.label || ' ' || a.unit_code END)
       || CASE WHEN a.unit_code IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('measurementKind',a.measurement_kind,'unitCode',a.unit_code,'value',o.label) END
       ORDER BY a.position,a.id)
       FROM product_variant_values v JOIN family_attributes a ON a.id=v.attribute_id JOIN family_attribute_options o ON o.id=v.option_id
       WHERE v.product_id=p.id),'[]'::jsonb)) END)
 FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN product_families f ON f.id=p.family_id WHERE p.id=pid;
$$;
