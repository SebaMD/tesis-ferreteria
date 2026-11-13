// Explicit display projection. Never serialize the original audit JSON.
export const auditOperations = {
  PRODUCT_NAME_CORRECTION: "Corrección de nombre individual",
  PRODUCT_CLASSIFICATION_CORRECTION: "Corrección de marca o categoría de producto simple",
  FAMILY_BRAND_CORRECTION: "Corrección de marca familiar",
  FAMILY_CATEGORY_CHANGE: "Reclasificación de categoría familiar",
  FAMILY_DEACTIVATE: "Desactivación de variantes de la familia",
  FAMILY_ACTIVATE: "Activación selectiva de variantes de la familia",
  ATTRIBUTE_RENAME: "Renombrado de atributo",
  OPTION_LABEL_CORRECTION: "Corrección de etiqueta compartida",
  DIMENSION_ADD: "Incorporación de dimensión",
  CONVERT_SIMPLE: "Conversión a familia con variantes",
  BUNDLE_SAVE: "Guardado de familia y variantes",
  SIMPLE_SAVE: "Alta de producto simple",
  DETACH: "Desvinculación controlada",
  ARCHIVE: "Archivado de familia",
  REACTIVATE: "Reactivación de familia",
  ASSOCIATION: "Asociación o clasificación de variante",
  OTHER: "Otro evento registrado",
} as const;
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 ? Number(v) : null;
export function auditText(v: unknown, max = 500): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(?:bearer\s+)[\w.+/=-]+/gi, "[credencial omitida]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[token omitido]")
    .replace(/(?:password|contrase[nñ]a|token|secret|api[_ -]?key)\s*[:=]\s*\S+/gi, "[credencial omitida]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo omitido]")
    .replace(/\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g, "[identificador personal omitido]")
    .replace(/(?:\+56[ -]*)?\b[2-9](?:[ -]*\d){8}\b/g, "[teléfono omitido]")
    .replace(/https?:\/\/[^\s]+/gi, "[enlace omitido]").trim().slice(0, max);
}
const product = (v: unknown) => {
  const p = obj(v);
  return { id: id(p.id), name: auditText(p.name, 150), brand: auditText(p.brand, 100),
    categoryId: id(p.categoryId ?? p.category_id), unit: auditText(p.unitMeasure ?? p.unit_measure, 50),
    price: (typeof p.price === "number" || typeof p.price === "string") && /^\d{1,20}(?:\.\d{1,6})?$/.test(String(p.price)) ? String(p.price) : null,
    minimumStock: typeof (p.minimumStock ?? p.minimum_stock) === "number" ? p.minimumStock ?? p.minimum_stock : null,
    active: typeof p.status === "boolean" ? p.status : null };
};
const attribute = (v: unknown) => { const a = obj(v); return { id: id(a.id ?? a.attributeId), name: auditText(a.name ?? a.attribute, 60) }; };
const category = (v: unknown) => { const c = obj(v); return { id: id(c.id), name: auditText(c.name, 100) }; };
export type AuditRow = { id: number; product_id: number | null; family_id: number | null; user_id: number | null;
  created_at: string; operation: string; previous: unknown; next: unknown; reason: string | null;
  actor_name: string | null; authorization?: unknown; companion?: unknown; related?: unknown };
export function auditDTO(row: AuditRow) {
  const prev = obj(row.previous), next = obj(row.next), auth = obj(row.authorization);
  const authPrev = obj(auth.previous), authNext = obj(auth.next), state = obj(authPrev.state);
  const operation = Object.hasOwn(auditOperations, row.operation) ? row.operation as keyof typeof auditOperations : "OTHER";
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  const add = (field: string, before: unknown, after: unknown) => changes.push({ field, before: before ?? null, after: after ?? null });
  switch (operation) {
    case "PRODUCT_CLASSIFICATION_CORRECTION":
      if(next.field==="brand")add("Marca",auditText(next.previousValue,100),auditText(next.value,100));
      else if(next.field==="category")add("Categoría",category(prev.category),category(next.category));
      break;
    case "PRODUCT_NAME_CORRECTION": add("Nombre identificable", auditText(obj(prev.product).name, 150), auditText(next.name, 150)); break;
    case "ATTRIBUTE_RENAME": add(`Atributo #${id(next.attributeId) ?? "—"}`, auditText(prev.name, 60), auditText(next.name, 60)); break;
    case "FAMILY_BRAND_CORRECTION": add("Marca", auditText(next.previousBrand, 100), auditText(next.brand, 100)); break;
    case "FAMILY_CATEGORY_CHANGE": add("Categoría", category(prev.category), category(next.category)); break;
    case "OPTION_LABEL_CORRECTION": add(`Etiqueta · atributo #${id(next.attributeId) ?? "—"} · opción #${id(next.optionId) ?? "—"}`, auditText(next.previousLabel, 100), auditText(next.label, 100)); break;
    case "DIMENSION_ADD":
      add("Atributo incorporado", null, attribute(authNext.attribute));
      if (obj(authNext.attribute).unit_code) add("Unidad descriptiva del atributo", null, auditText(obj(authNext.attribute).unit_code,4));
      add("Opciones incorporadas", null, array(authNext.options).map(v => { const o = obj(v), unit = auditText(obj(authNext.attribute).unit_code,4), label=auditText(o.label,100); return { id: id(o.id), label: label&&unit?`${label} ${unit}`:label }; }));
      add("Clasificación anterior", array(state.members).flatMap(v => { const m = obj(v); return array(m.values).map(value => { const o = obj(value); return { productId: id(o.product_id), attributeId: id(o.attribute_id), optionId: id(o.option_id) }; }); }), null);
      add("Asignaciones nuevas", null, array(authNext.assignments).map(v => { const a = obj(v); return { productId: id(a.productId), optionId: id(a.optionId) }; }));
      break;
    case "CONVERT_SIMPLE":
      add("Producto original", product(prev.product), { id: row.product_id, familyId: row.family_id });
      add("Atributos asignados", null, array(next.attributes).map(v => { const a = obj(v); return { attribute: auditText(a.attribute, 60), option: auditText(a.option, 100) }; }));
      add("Stock físico conservado", Number.isFinite(obj(prev.product).currentStock) ? obj(prev.product).currentStock : null, Number.isFinite(next.stockPreserved) ? next.stockPreserved : null);
      if (row.companion) add("Artículos guardados con la conversión", null, array(obj(row.companion).variants).map(product));
      break;
    case "BUNDLE_SAVE": case "SIMPLE_SAVE":
      add("Artículos registrados", array(prev.variants).map(product), array(next.variants).map(product));
      if (Array.isArray(next.attributeDefinitions)) add("Definiciones de atributos", null, next.attributeDefinitions.map(v => {
        const a=obj(v), unit=auditText(a.unitCode,4);
        return { ...attribute(a), unitCode:unit, options:array(a.options).map(v=>{const o=obj(v),label=auditText(o.label,100);return { id:id(o.id),label:label&&unit?`${label} ${unit}`:label };}) };
      }));
      if (prev.family) { const f = obj(prev.family); add("Metadatos familiares anteriores", { id: id(f.id), name: auditText(f.name, 150), brand: auditText(f.brand, 100), categoryId: id(f.categoryId) }, null); }
      break;
    case "FAMILY_ACTIVATE":
      add("Desactivación de origen", null, id(next.sourceEventId));
    // Both operations expose availability only, never raw command/revision payloads.
    case "FAMILY_DEACTIVATE":
      add("Disponibilidad de variantes", array(prev.variants).map(product), array(next.variants).map(product));
      add("Familia", null, { id: row.family_id, name: auditText(next.familyName, 150) });
      break;
    case "DETACH": case "ASSOCIATION":
      add("Familia asociada", { id: id(prev.familyId), name: auditText(prev.familyName, 150) }, id(next.familyId));
      if (operation === "DETACH") add("Clasificación desvinculada", array(prev.attributes).map(v => { const a = obj(v); return { attributeId: id(a.attributeId), attribute: auditText(a.attribute, 60), optionId: id(a.optionId), label: auditText(a.label, 100) }; }), []);
      break;
    case "ARCHIVE": case "REACTIVATE": add("Fecha de archivado", auditText(prev.archivedAt, 40), auditText(next.archivedAt, 40)); break;
  }
  const limits = ["Solo se muestran campos comerciales permitidos; no es un historial de movimientos de stock."];
  if (!row.user_id) limits.push("El evento no registra un usuario responsable.");
  if (!auditText(row.reason)) limits.push("El evento no registra un motivo.");
  if (["SIMPLE_SAVE", "BUNDLE_SAVE", "ASSOCIATION", "ARCHIVE", "REACTIVATE"].includes(operation)) limits.push("El motivo puede ser automático; no implica una justificación escrita por el administrador.");
  if (["BUNDLE_SAVE", "SIMPLE_SAVE"].includes(operation)) limits.push("El evento no conserva todos los metadatos familiares posteriores ni un motivo individual por campo.");
  if (operation === "OTHER") limits.push("El formato del evento no dispone de un proyector de diferencias; no se expone su payload interno.");
  if (row.operation.endsWith("_AUTHORIZATION")) limits.push("Autorización sin resultado vinculado en la consulta: por sí sola no demuestra que se aplicó el cambio.");
  if (operation === "ASSOCIATION" && !next.operation) limits.push("El registro original no incluía un tipo de operación; se muestra como asociación por su estructura, sin atribuirle un comando no registrado.");
  if (operation === "DIMENSION_ADD" && !auth.next) limits.push("No se encontró la autorización vinculada con el detalle de la dimensión.");
  return { id: row.id, at: row.created_at, operation, label: auditOperations[operation],
    subject: { productId: row.product_id, familyId: row.family_id },
    actor: row.user_id ? { id: row.user_id, name: auditText(row.actor_name, 200) } : null,
    reason: auditText(row.reason), affectedProductIds: array(next.productIds).filter(v => id(v) !== null),
    source: { table: "product_family_events", originalType: auditText(next.operation, 80),
      records: [{ id: row.id, type: auditText(row.operation, 80) }, ...array(row.related).map(v => { const r = obj(v); return { id: id(r.id), type: auditText(r.type, 80) }; })] },
    result: "Evento registrado", changes, limits };
}
