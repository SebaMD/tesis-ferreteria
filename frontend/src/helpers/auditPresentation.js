const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : null;
export function auditReadableValue(value) {
  if (value === null || value === undefined || value === "") return "No registrado / no aplica";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  const item = object(value);
  if (item) {
    if (typeof item.name === "string" && item.name) return item.name;
    if (typeof item.label === "string" && item.label) return item.label;
    if (Number.isSafeInteger(item.id) && item.id > 0) return `#${item.id} (nombre no registrado)`;
  }
  return null;
}

const present = value => value !== null && value !== undefined && value !== "";
const productLabel = value => `Producto #${value.id}${value.name ? ` · ${value.name}` : ""}`;
const fields = { name: "Nombre", brand: "Marca", categoryId: "Categoría (ID registrado)", unit: "Unidad", price: "Precio CLP", minimumStock: "Stock mínimo", active: "Activo" };

export function auditLocalDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Fecha no registrada";
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

export const auditResponsible = event => event.actor?.name || "Responsable no registrado";

// Read-only presentation of the allowlisted DTO. Missing sides are NOT deletions.
// Original values and references remain untouched in the DTO; never render raw payloads.
export function auditReadableRows(event) {
  const changes = event.changes || [];
  if (event.operation === "FAMILY_DEACTIVATE") {
    const status = changes.find(c => c.field === "Disponibilidad de variantes");
    const previous = Array.isArray(status?.before) ? status.before : [];
    const family = changes.find(c => c.field === "Familia");
    return [
      ...(family?.after?.name ? [{ kind: "context", label: "Familia", after: family.after.name }] : []),
      ...(Array.isArray(status?.after) ? status.after.flatMap(p => previous.find(old => old.id === p.id)?.active === true && p.active === false
        ? [{ kind: "change", label: productLabel(p), before: "Activo", after: "Desactivado (no eliminado)" }] : []) : []),
    ];
  }
  if (event.operation === "DIMENSION_ADD") {
    const attribute = changes.find(c => c.field === "Atributo incorporado");
    const options = changes.find(c => c.field === "Opciones incorporadas");
    const rows = [];
    if (object(attribute?.after)?.name) rows.push({ kind: "addition", label: "Nuevo atributo", after: attribute.after.name });
    const unit = changes.find(c => c.field === "Unidad descriptiva del atributo");
    if (unit?.after) rows.push({kind:"addition",label:"Unidad descriptiva del atributo",after:unit.after});
    if (Array.isArray(options?.after)) {
      const labels = options.after.filter(o => typeof o?.label === "string" && o.label).map(o => o.label);
      rows.push({ kind: "addition", label: `Opciones agregadas (${options.after.length})`, after: labels.length ? `${labels.join(", ")}${labels.length < options.after.length ? " · Hay etiquetas no registradas" : ""}` : "No se registraron las etiquetas de estas opciones." });
    }
    const assignments = changes.find(c => c.field === "Asignaciones nuevas");
    if (Array.isArray(assignments?.after) && assignments.after.length) rows.push({ kind: "addition", label: "Nuevas asignaciones a variantes", after: `${assignments.after.length} asignaciones incorporadas.`, items: assignments.after.map(a => {
      const option = options?.after?.find(o => o.id === a.optionId);
      return `Producto #${a.productId ?? "no registrado"}: ${option?.label || "opción sin etiqueta registrada"}`;
    }) });
    return rows;
  }
  if (["SIMPLE_SAVE", "BUNDLE_SAVE"].includes(event.operation)) {
    const products = changes.find(c => c.field === "Artículos registrados");
    const previous = Array.isArray(products?.before) ? products.before : [];
    const definitions=changes.find(c=>c.field==="Definiciones de atributos");
    const contexts=(Array.isArray(definitions?.after)?definitions.after:[]).filter(a=>a.unitCode&&a.name).map(a=>({kind:"context",label:`Atributo ${a.name}`,after:`Unidad descriptiva: ${a.unitCode}. Opciones: ${a.options?.map(o=>o.label).filter(Boolean).join(", ")||"No registradas"}`}));
    return [...contexts,...(Array.isArray(products?.after) ? products.after : []).flatMap(item => {
      if (!item?.id) return [];
      const before = previous.find(p => p.id === item.id);
      if (!before) return [{ kind: "addition", label: "Producto agregado", after: productLabel(item) }];
      return Object.entries(fields).flatMap(([key, label]) => {
        if (before[key] === item[key]) return [];
        const title = `${productLabel(item)} · ${label}`;
        if (!present(before[key])) return [{ kind: "addition", label: title, after: auditReadableValue(item[key]) }];
        return [{ kind: "change", label: title, before: auditReadableValue(before[key]), after: present(item[key]) ? auditReadableValue(item[key]) : "Sin valor posterior registrado" }];
      });
    })];
  }
  if (event.operation === "CONVERT_SIMPLE") return changes.flatMap(change => {
    if (change.field === "Producto original") return [{ kind: "context", label: "Producto original conservado", after: auditReadableValue(change.before) }];
    if (change.field === "Atributos asignados" && Array.isArray(change.after)) return [{ kind: "addition", label: "Clasificación asignada", after: change.after.map(a => `${a.attribute || "Atributo no registrado"}: ${a.option || "Opción no registrada"}`).join(" · ") }];
    if (change.field === "Stock físico conservado") return [{ kind: "context", label: change.field, after: auditReadableValue(change.after) }];
    if (change.field === "Artículos guardados con la conversión" && Array.isArray(change.after)) return change.after.filter(p => p.id && p.id !== event.subject?.productId).map(p => ({ kind: "addition", label: "Producto agregado", after: productLabel(p) }));
    return [];
  });
  if (event.operation === "DETACH") return [{ kind: "context", label: "Producto desvinculado", after: "Se retiró la asociación familiar, no el producto ni su historial." }];
  if (["ARCHIVE", "REACTIVATE"].includes(event.operation)) return [{ kind: "context", label: "Estado de la familia", after: event.operation === "ARCHIVE" ? "Archivada (no eliminada)" : "Reactivada" }];
  return changes.flatMap(change => {
    if (Array.isArray(change.before) || Array.isArray(change.after)) {
      return [{ kind: "context", label: change.field, after: "Se registró información sin nombres o etiquetas suficientes para describirla. No se infieren eliminaciones." }];
    }
    const before = auditReadableValue(change.before), after = auditReadableValue(change.after);
    if (before === null || after === null) return [];
    const label = event.operation === "OPTION_LABEL_CORRECTION" ? "Etiqueta compartida" : event.operation === "ATTRIBUTE_RENAME" ? "Nombre del atributo" : change.field;
    if (!present(change.before) || !present(change.after)) return [{ kind: "context", label, after: present(change.after) ? after : `Valor previo registrado: ${before}. No consta un valor posterior.` }];
    return [{ kind: before === after ? "context" : "change", label, ...(before === after ? {} : { before }), after }];
  });
}
