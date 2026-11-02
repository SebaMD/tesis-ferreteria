import { createId } from "./createId.js";
import { familyBody, familyDraft } from "./productFamilyForm.js";
import { normalizeAttributeNumber, attributeOptionLabel } from "./attributeMeasurements.js";

export function reconcileAttributeOptions(attribute, optionsText) {
  const pool = [...(attribute.optionPool || attribute.draftOptions || []), ...(attribute.options || []).map(o => ({ ...o, key: `option-${o.id}` }))];
  const draftOptions = optionsText.split("\n").map(s => s.trim()).filter(Boolean).map(label => {
    const old = pool.find(o => o.label.toLocaleLowerCase("es") === label.toLocaleLowerCase("es"));
    const option = { ...(old || {}), label, key: old?.key || createId() };
    pool.push(option); return option;
  });
  return { ...attribute, key: attribute.key || createId(), optionsText, draftOptions, optionPool: pool };
}
export const newBundleAttribute = () => reconcileAttributeOptions({ name: "", options: [] }, "");
export const newBundleRow = (attributeCount = 1, common = {}) => ({ key: createId(), selections: Array(attributeCount).fill(""), name: "", nameCustomized: false,
  price: common.price ?? "", barcode: "", minimumStock: common.minimumStock ?? 0, initialStock: 0, status: true,
  unitMeasure: common.unitMeasure ?? "unidad", inStoreOnly: Boolean(common.inStoreOnly), files: [], useCommon: false });

export const SINGLE_VARIANT_MESSAGE = "Has configurado una sola variante. Agrega otra o guarda este artículo como producto simple";
export function resumeBundleDraft(draft, base) {
  return { ...draft, name: base.name, description: base.description, categoryId: base.categoryId, brand: base.brand, unitMeasure: base.unitMeasure,
    rows: draft.rows.map((row, index) => index ? row : { ...row, price: base.price, barcode: base.barcode || "", minimumStock: base.minimumStock,
      initialStock: base.initialStock ?? row.initialStock, status: base.status, inStoreOnly: base.inStoreOnly,
      ...(row.description !== undefined ? { description: base.description } : {}), ...(row.unitMeasure !== undefined ? { unitMeasure: base.unitMeasure } : {}) }) };
}
export function simpleDraftFromBundle(draft, commonFiles) {
  const row = draft.rows[0];
  return { fields: { name: bundleRowName(draft, row), description: row.description === undefined ? draft.description : row.description || "", categoryId: draft.categoryId, brand: draft.brand,
    unitMeasure: row.unitMeasure ?? draft.unitMeasure, price: row.price, minimumStock: row.minimumStock, initialStock: row.initialStock, barcode: row.barcode || "",
    status: row.status, inStoreOnly: row.inStoreOnly }, files: [...new Set([...(row.useCommon ? commonFiles : []), ...row.files])] };
}
export function simpleProductPayload(base, operationKey, files) {
  return { simple: true, operationKey, family: { name: base.name, description: base.description, categoryId: Number(base.categoryId), brand: base.brand || null, attributes: [] },
    unitMeasure: base.unitMeasure, variants: [{ name: base.name, selections: [], price: Number(base.price), barcode: base.barcode || null,
      minimumStock: Number(base.minimumStock), initialStock: Number(base.initialStock || 0), status: base.status, inStoreOnly: base.inStoreOnly,
      imageIndexes: files.map((_, index) => index) }] };
}
export function editBundleImages(images, action) {
  let next = images.map(image => ({ ...image }));
  if (action.type === "remove") next = next.filter(image => image.id !== action.id);
  if (action.type === "move") {
    const target = action.index + action.direction;
    if (action.index >= 0 && target >= 0 && target < next.length) [next[action.index], next[target]] = [next[target], next[action.index]];
  }
  const primary = action.type === "primary" ? action.id : next.find(image => image.isPrimary)?.id ?? next[0]?.id;
  return next.map((image, position) => ({ ...image, position, isPrimary: image.id === primary }));
}
// Values are entered on concrete rows. Preserve existing option IDs and stable
// draft keys; editing one row must never rename an option used by another row.
export function setBundleRowOption(draft, rowKey, index, value) {
  const attribute = draft.attributes[index];
  const row = draft.rows.find(r => r.key === rowKey);
  let label = value.trim();
  if (attribute.unitCode && label) { try { label = normalizeAttributeNumber(label); } catch { label = ""; } }
  const normalize = text => text.trim().toLocaleLowerCase("es");
  const usedElsewhere = new Set(draft.rows.filter(r => r.key !== rowKey).map(r => r.selections[index]));
  const current = attribute.draftOptions.find(o => o.key === row.selections[index]);
  const matching = attribute.draftOptions.find(o => normalize(o.label) === normalize(label));
  const option = label ? matching || { label, key: current && !current.id && !usedElsewhere.has(current.key) ? current.key : createId() } : null;
  const rows = draft.rows.map(r => r.key === rowKey ? { ...r,
    optionTexts: draft.attributes.map((a, i) => i === index ? value : r.optionTexts?.[i] ?? bundleRowValues(draft, r)[i]),
    selections: r.selections.map((s, i) => i === index ? option?.key || "" : s) } : r);
  const used = new Set(rows.map(r => r.selections[index]));
  const options = attribute.draftOptions.filter(o => o.id || used.has(o.key)).filter(o => o.key !== option?.key);
  if (option) options.push(option);
  return { ...draft, rows, attributes: draft.attributes.map((a, i) => i === index ? { ...a, draftOptions: options, optionsText: options.map(o => o.label).join("\n") } : a) };
}
const conversionDetails = pending => Object.fromEntries(["price", "barcode", "minimumStock", "description", "inStoreOnly"].filter(key => pending[key] !== undefined).map(key => [key, pending[key]]));
export function resumeConversionDraft(draft, pending) {
  return draft.conversion ? { ...draft, rows: draft.rows.map(row => row.isOriginal ? { ...row, ...conversionDetails(pending) } : row) } : draft;
}
export function conversionDraft(snapshot, pending = {}) {
  const original = snapshot.product, draft = bundleDraft(null, original);
  return { ...draft, description: pending.description ?? draft.description, original, conversion: { productId: original.id, expectedRevision: snapshot.revision, reason: "" },
    rows: [{ ...newBundleRow(), ...original, ...conversionDetails(pending),
      isOriginal: true, hasHistory: original.hasHistory, nameCustomized: true, useCommon: true, key: `product-${original.id}` }] };
}
export function bundleDraft(snapshot, initial = {}) {
  if (!snapshot) return { familyId: null, revision: null, ...familyDraft(), name: initial.name || "", description: initial.description || "",
    attributes: [newBundleAttribute()], categoryId: initial.categoryId || "", brand: initial.brand || "", unitMeasure: initial.unitMeasure || "unidad",
    rows: [{ ...newBundleRow(1, initial), barcode: initial.barcode || "", useCommon: true }] };
  const { family, variants, revision } = snapshot;
  const attributes = familyDraft(family).attributes.map(a => reconcileAttributeOptions(a, a.optionsText));
  return { ...familyDraft(family), attributes, familyId: family.id, revision, categoryId: family.categoryId, brand: family.brand || "", unitMeasure: variants[0]?.unitMeasure || "unidad",
    rows: variants.map(v => ({ ...newBundleRow(), ...v, originalImageIds: (v.images || []).map(image => image.id), nameCustomized: true, key: `product-${v.id}`,
      selections: attributes.map(a => a.draftOptions.find(o => v.variantOptionIds.includes(o.id))?.key || "") })) };
}
export function bundleRowValues(draft, row) {
  return draft.attributes.map((a, i) => a.draftOptions?.find(o => o.key === row.selections[i])?.label
    || (typeof row.selections[i] === "number" ? a.optionsText.split("\n").map(s => s.trim()).filter(Boolean)[row.selections[i]] : "") || "");
}
export function bundleRowLabels(draft, row) {
  return bundleRowValues(draft, row).map((label, i) => attributeOptionLabel(label, draft.attributes[i].unitCode));
}
// Conversion and removal of saved photos need confirmation; ordinary edits save directly.
export const bundleRequiresConfirmation = draft => Boolean(draft.conversion || draft.rows?.some(row => row.originalImageIds?.some(id => !row.images?.some(image => image.id === id))));
export function bundleRowName(draft, row) {
  const labels = bundleRowLabels(draft, row).filter(Boolean);
  let base = draft.name.trim();
  for (const label of [...bundleRowLabels(draft, draft.rows[0])].reverse().filter(Boolean)) {
    const suffix = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    base = base.replace(new RegExp(`\\s+(?:de\\s+)?${suffix}$`, "i"), "");
  }
  return row.id || row.nameCustomized || row.name ? row.name : `${base}${labels.length ? ` de ${labels.join(" · ")}` : ""}`;
}
export function bundleDraftSignature(draft) {
  // PostgreSQL prices and input values can encode the same integer differently.
  // Keep invalid/empty drafts distinct, but do not invent pending commercial edits.
  const integer = value => value !== "" && value != null && Number.isSafeInteger(Number(value)) ? Number(value) : value;
  return JSON.stringify({ ...draft, revision: undefined, rows: draft.rows.map(row => ({ ...row,
    price: integer(row.price), minimumStock: integer(row.minimumStock), initialStock: integer(row.initialStock) })) });
}
export function bundlePayload(draft, operationKey, files, commonFiles) {
  if (!draft.familyId && !draft.conversion && draft.rows.length < 2) throw new Error(SINGLE_VARIANT_MESSAGE);
  if (draft.conversion && (draft.conversion.reason.trim().length < 8 || draft.conversion.reason.trim().length > 500
    || draft.rows.filter(r => r.id === draft.conversion.productId).length !== 1 || !draft.rows.some(r => !r.id))) throw Object.assign(new Error("Indica el motivo de conversión, conserva el original y agrega al menos una variante nueva."), { section: draft.conversion.reason.trim().length < 8 || draft.conversion.reason.trim().length > 500 ? "prepare" : "variants" });
  const family = familyBody(draft, { categoryId: Number(draft.categoryId), brand: draft.brand || null }, {});
  if (!family.attributes.length || family.attributes.some(a => !a.name.trim() || a.name.length > 60 || !a.options.length || a.options.some(o => !o.label.trim() || o.label.length > 100))) throw Object.assign(new Error("Completa el nombre de cada atributo y sus opciones."), { section: "attributes" });
  const combinations = new Map();
  const names = new Set(), barcodes = new Set();
  const variants = draft.rows.map(row => {
    const invalid = (message, field) => { throw Object.assign(new Error(message), { variantKey: row.key, field }); };
    draft.attributes.forEach((a,i) => { if (a.unitCode && row.optionTexts?.[i]) { try { normalizeAttributeNumber(row.optionTexts[i]); } catch(e) { invalid(e.message, "selections"); } } });
    const selections = row.selections.map((selection, i) => typeof selection === "number" ? selection : draft.attributes[i]?.draftOptions?.findIndex(o => o.key === selection));
    if (selections.length !== family.attributes.length || selections.some((s, i) => !Number.isInteger(s) || s < 0 || !family.attributes[i].options[s])) invalid("Completa los atributos de cada variante; una opción seleccionada pudo haberse quitado.", "selections");
    const key = selections.join(",");
    if (combinations.has(key)) throw Object.assign(new Error("Hay combinaciones de atributos repetidas."), { variantKey: row.key, variantKeys: [combinations.get(key), row.key], section: "variants", field: "selections" });
    combinations.set(key, row.key);
    const name = bundleRowName(draft, row).trim();
    if (name.length < 2 || name.length > 150 || row.price === "" || !Number.isSafeInteger(Number(row.price)) || Number(row.price) < 0 || Number(row.price) > 9999999999
      || !Number.isSafeInteger(Number(row.minimumStock)) || Number(row.minimumStock) < 0 || Number(row.minimumStock) > 2147483647
      || (!row.id && (!Number.isSafeInteger(Number(row.initialStock)) || Number(row.initialStock) < 0 || Number(row.initialStock) > 2147483647))
      || (row.barcode && !/^\d{1,64}$/.test(row.barcode))) invalid("Revisa nombre, precio, stock y código de barras de cada variante.");
    const normalizedName = name.toLocaleLowerCase("es");
    if (names.has(normalizedName)) invalid("Hay nombres de variante repetidos.", "name"); names.add(normalizedName);
    if (row.barcode && barcodes.has(row.barcode)) invalid("Hay códigos de barras repetidos.", "barcode"); if (row.barcode) barcodes.add(row.barcode);
    return { ...(row.id ? { id: row.id } : {}), name, selections,
      price: Number(row.price), barcode: row.barcode || null, minimumStock: Number(row.minimumStock), status: row.status, inStoreOnly: row.inStoreOnly,
      ...(row.description !== undefined ? { description: row.description } : {}), ...(row.unitMeasure !== undefined ? { unitMeasure: row.unitMeasure } : {}),
      ...(row.id ? { existingImages: { imageIds: (row.images || []).map(image => image.id), primaryImageId: row.images?.find(image => image.isPrimary)?.id ?? row.images?.[0]?.id ?? null } } : {}),
      ...(!row.id ? { initialStock: Number(row.initialStock) } : {}),
      imageIndexes: [...new Set([...(row.useCommon ? commonFiles : []), ...row.files].map(file => files.indexOf(file)))] };
  });
  return { operationKey, ...(draft.familyId ? { familyId: draft.familyId, expectedRevision: draft.revision } : {}),
    ...(draft.conversion ? { conversion: { ...draft.conversion, confirmed: true } } : {}), family, unitMeasure: draft.unitMeasure, variants };
}
export function bundleCardChoice(family, selectedId) {
  const options = (family.variants || []).filter(v => v.status !== false);
  return options.find(v => v.id === selectedId) || options.find(v => v.id === family.representativeProductId) || options[0] || null;
}
