import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { selectExistingVariant, variantLabel, variantAvailability, variantOptionState, familyCardSummary, familyVariantDescription } from "../src/helpers/productVariants.js";
import { familyBody, familyDraft, isFamilyCompatible, familyAdminView, selectableProductFamilies } from "../src/helpers/productFamilyForm.js";

const sku = (id, color, size, extra = {}) => ({ id, status: true, availableStock: 10, variantValues: [
  { attributeId: 1, attribute: "Color", optionId: color, label: String(color) },
  { attributeId: 2, attribute: "Medida", optionId: size, label: String(size) },
], ...extra });
const variants = [sku(100, 10, 20), sku(101, 11, 21), sku(102, 11, 22, { status: false }), sku(103, 10, 22, { inStoreOnly: true })];

test("selection only returns existing concrete variants, including sparse combinations", () => {
  assert.equal(selectExistingVariant(variants, variants[0], 1, 11).id, 101);
  assert.equal(selectExistingVariant(variants, variants[3], 1, 11).id, 102);
  assert.equal(selectExistingVariant(variants, variants[1], 2, 20).id, 100);
  assert.equal(selectExistingVariant(variants, variants[0], 1, 999), null);
  assert.equal(variantLabel(variants[0]), "Color: 10 · Medida: 20");
});
test("availability distinguishes inactive, in-store, sold out and online SKUs", () => {
  assert.equal(variantAvailability(variants[0]), "Disponible online");
  assert.equal(variantAvailability(variants[2]), "Inactiva");
  assert.equal(variantAvailability(variants[3]), "Solo presencial");
  assert.equal(variantAvailability({ status: true, availableStock: 0, currentStock: 100 }), "Agotada");
});

test("demo detail keeps specifications without repeating its long disclaimer", () => {
  assert.deepEqual(familyVariantDescription("Descripción comercial existente."), { demo: false, text: "Descripción comercial existente." });
  const data = familyVariantDescription("DEMOSTRACIÓN: precio, existencias y disponibilidad ficticios; no representan datos comerciales reales de Comercializadora FYF SpA. Ancho 2 pulgadas. Modelo/referencia: X. Fuente: catálogo.");
  assert.equal(data.demo, true); assert.equal(data.text, "Ancho 2 pulgadas.");
});
test("family cards cannot be purchased or favorited as if they were a SKU", async () => {
  const card = await readFile(new URL("../src/components/ProductFamilyCard.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(card, /ProductPurchaseControls|FavoriteButton/);
  assert.match(card, /Ver opciones/);
  const detail = await readFile(new URL("../src/pages/ProductFamilyPage.jsx", import.meta.url), "utf8");
  assert.match(detail, /selected.status && <ProductPurchaseControls key=\{selected.id\} product=\{selected\}/);
  assert.match(detail, /<fieldset key=\{attribute.id\}/);
  assert.doesNotMatch(detail, /<select|Ver todas las combinaciones|<details/);
  assert.match(detail, /disabled=\{!option.available\}/);
  assert.match(detail, /option.reason/);
  assert.match(detail, /aria-live="polite"/);
  assert.match(detail, /aria-pressed/);
  assert.match(detail, /max-\[860px\]:grid-cols-1/);
});

test("chips distinguish unavailable real combinations and adjust sparse selections explicitly", () => {
  const color = variantOptionState(variants, variants[0], 1, 11);
  assert.equal(color.variant.id, 101); assert.equal(color.adjusted, true); assert.equal(color.available, true);
  const unavailable = variantOptionState(variants, variants[3], 1, 11);
  assert.equal(unavailable.variant.id, 101); assert.equal(unavailable.available, true); assert.equal(unavailable.adjusted, true);
  const inactiveOnly = variantOptionState([variants[2]], variants[2], 1, 11);
  assert.equal(inactiveOnly.available, false); assert.equal(inactiveOnly.reason, "Inactiva");
  const store = variantOptionState(variants, variants[0], 2, 22);
  assert.equal(store.available, false); assert.equal(store.reason, "Solo presencial");
  assert.equal(variantOptionState(variants, variants[0], 2, 999), null);
  const soldOut = sku(104, 10, 23, { availableStock: 0 });
  assert.equal(variantOptionState([...variants, soldOut], variants[0], 2, 23).reason, "Agotada");
  // Switching a single-attribute family also resolves a concrete product ID.
  assert.equal(variantOptionState(variants.map((v) => ({ ...v, variantValues: v.variantValues.slice(0, 1) })), variants[0], 1, 11).variant.id, 101);
});

test("sold-out intersections cannot prevent reaching another available combination", () => {
  const grid = [sku(1, 10, 20), sku(2, 10, 21, { availableStock: 0 }), sku(3, 11, 20, { inStoreOnly: true }), sku(4, 11, 21)];
  const color = variantOptionState(grid, grid[0], 1, 11);
  assert.equal(color.available, true); assert.equal(color.variant.id, 4); assert.equal(color.adjusted, true);
  const size = variantOptionState(grid, grid[0], 2, 21);
  assert.equal(size.available, true); assert.equal(size.variant.id, 4); assert.equal(size.adjusted, true);
});

test("family card price uses eligible online SKUs only and never advertises unavailable options", () => {
  const card = { onlineVariantCount: 2, onlineFromPrice: "5990.00", onlineMaxPrice: "5990.00", fromPrice: "100.00", attributeNames: ["Medida"] };
  assert.deepEqual(familyCardSummary(card), { count: 2, from: false, price: "5990.00", availability: "2 medidas disponibles" });
  assert.equal(familyCardSummary({ ...card, onlineMaxPrice: "6990.00" }).from, true);
  assert.equal(familyCardSummary({ ...card, onlineVariantCount: 0 }).price, null);
  assert.equal(familyCardSummary({ ...card, onlineVariantCount: 0, allInStoreOnly: true }).availability, "Solo presencial");
  assert.equal(familyCardSummary({ ...card, onlineVariantCount: 1, attributeNames: ["Color", "Medida"] }).availability, "1 opción disponible");
});

test("integrated form inherits category/brand, preserves identifiers and supports generic attributes", async () => {
  const family = { id: 4, name: "Brochas", categoryId: 2, brand: "Lizcal", attributes: [{ id: 8, name: "Ancho", options: [{ id: 9, label: '2 pulgadas' }] }] };
  assert.equal(isFamilyCompatible(family, { categoryId: "2", brand: " lizcal " }), true);
  assert.equal(isFamilyCompatible(family, { categoryId: 3, brand: "Lizcal" }), false);
  assert.equal(isFamilyCompatible(family, { categoryId: 2, brand: "Otra" }), false);
  const draft = familyDraft(family);
  assert.equal(draft.attributes[0].optionsText, "2 pulgadas");
  draft.attributes[0].optionsText += "\n3 pulgadas";
  const updated = familyBody(draft, family, { categoryId: 99, brand: "No sustituir" });
  assert.equal(updated.categoryId, 2); assert.equal(updated.brand, "Lizcal");
  assert.equal(updated.attributes[0].id, 8); assert.equal(updated.attributes[0].options[0].id, 9);
  assert.equal(updated.attributes[0].options[1].id, undefined);
  const created = familyBody({ ...familyDraft(), name: "Mallas", attributes: [{ name: "Color", options: [], optionsText: "Verde\nNegro" }, { name: "Medida", options: [], optionsText: "5 m\n10 m" }] }, null, { categoryId: "3", brand: "" });
  assert.equal(created.categoryId, 3); assert.equal(created.brand, null); assert.equal(created.attributes.length, 2);
  const page = await readFile(new URL("../src/pages/ProductsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<ProductFamilyManager/);
  assert.match(page, /Solo presencial[\s\S]*<ProductVariantFields/);
  assert.match(page, /familyId: product.familyId \?\? null/);
  assert.match(page, /variantOptionIds: product.variantOptionIds \|\| \[\]/);
  const admin = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.match(admin, /Producto simple \(sin familia\)/);
  assert.match(admin, /event.stopPropagation\(\)/);
  assert.match(admin, /selectableProductFamilies\(families, form\)/);
  assert.match(admin, /form.variantOptionIds\?\.includes\(o.id\)/);
  assert.match(admin, /Crear nueva familia/);
  assert.match(admin, /Administrar familias y atributos/);
});
test("new families do not count simple products as their members; theme reuses project styles", async () => {
  const admin = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.match(admin, /const members = editingId \? products.filter/);
  for (const file of ["components/ProductFamilyManager.jsx", "components/ProductFamilyCard.jsx", "pages/ProductFamilyPage.jsx"]) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /dark:bg-/); // existing app uses .dark overrides, not OS media theme
  }
});

test("family editor keeps headings inside borders, visible textareas and responsive member actions", async () => {
  const source = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<legend/);
  assert.match(source, /aria-label="Familia y variantes">\s*<h3/);
  assert.match(source, /aria-label=\{"Atributo " \+ \(i \+ 1\)\}><h3/);
  assert.match(source, /const textAreaClass = "[^"]*resize-y[^"]*border border-slate-300[^"]*bg-white[^"]*focus-visible:outline/);
  assert.equal((source.match(/<textarea className=\{textAreaClass\}/g) || []).length, 3);
  assert.match(source, /placeholder=\{"Rojo\\nAzul\\nVerde"\} value=\{a.optionsText\}/);
  assert.match(source, /flex-\[1_1_12rem\] break-words">#\{p.id\} · \{p.name\}<\/span><div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2"/);
  assert.match(source, /\{p.status \? "Activo" : "Inactivo"\}/);
  const draft = familyDraft();
  assert.equal(draft.description, "");
  assert.equal(draft.attributes[0].optionsText, "");
  assert.deepEqual(familyBody(draft, null, { categoryId: 1 }).attributes[0].options, []);
});

test("one exclusive administrative state and active compatible product choices, including empty historical families", async () => {
  const active = { id: 1, categoryId: 2, brand: "Lizcal", archivedAt: null, management: { memberCount: 2 } };
  const empty = { ...active, id: 2, management: { memberCount: 0, hasProductHistory: true } };
  const archived = { ...empty, id: 3, archivedAt: "2026-10-20T12:00:00Z" };
  assert.equal(familyAdminView(active), "IN_USE"); assert.equal(familyAdminView(empty), "EMPTY"); assert.equal(familyAdminView(archived), "ARCHIVED");
  assert.deepEqual(selectableProductFamilies([active, empty, archived], { categoryId: 2, brand: "Lizcal" }).map((f) => f.id), [1, 2]);
  assert.deepEqual(selectableProductFamilies([archived], { categoryId: 2, brand: "Lizcal", familyId: 3 }), []);
  assert.deepEqual(selectableProductFamilies([active, empty], { categoryId: 9, brand: "Otra" }), []);
  const source = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.match(source, /\[view, setView\] = useState\("IN_USE"\)/);
  assert.equal((source.match(/aria-label="Estado de familias"/g) || []).length, 1);
  assert.match(source, /<option value="IN_USE">En uso<\/option><option value="EMPTY">Sin productos<\/option><option value="ARCHIVED">Archivadas<\/option>/);
  assert.match(source, /families.filter\(\(f\) => familyAdminView\(f\) === view\)/);
  assert.doesNotMatch(source, /Mostrar familias vacías|showHistoricalFamilies|type="checkbox"/);
  assert.match(source, /disabled=\{archived \|\| busy\}/);
});

test("detaching is separate from commercial saving, requires reason/confirmation and preserves other form drafts", async () => {
  const source = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.match(source, /nextId === null && editingProduct\?\.familyId/);
  assert.match(source, /setPendingDetach\(\{ id: editingProduct.id/);
  assert.match(source, /<AppModal open=\{Boolean\(pendingDetach\)\} title="Desvincular producto de su familia"/);
  assert.match(source, /Motivo de desvinculación/);
  assert.match(source, /onClick=\{confirmDetach\}/);
  assert.match(source, /reason: detachReason.trim\(\), confirmed: true/);
  assert.match(source, /onChange\(\{ \.\.\.form, familyId: null, variantOptionIds: \[\], associationReason: "" \}\)/);
  const service = await readFile(new URL("../src/services/productFamilies.service.js", import.meta.url), "utf8");
  assert.match(service, /api.post\(`\/product-families\/variants\/\$\{id\}\/detach`, body\)/);
  assert.doesNotMatch(source.slice(source.indexOf("async function confirmDetach"), source.indexOf("const openCreate")), /saveProduct|updateProduct|price:|stock:|name:/);
});

test("family actions keep order and touch targets; members start collapsed and current SKU is not reopened", async () => {
  const source = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.match(source, /min-h-11[\s\S]*grid-cols-3[\s\S]*aria-label="Agregar atributo"[\s\S]*aria-label="Archivar familia"[\s\S]*aria-label="Guardar familia"/);
  assert.equal((source.match(/max-\[480px\]:sr-only/g) || []).length, 3);
  assert.match(source, /\[membersExpanded, setMembersExpanded\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{membersExpanded\} aria-controls=\{membersPanelId\}/);
  assert.match(source, /id=\{membersPanelId\} hidden=\{!membersExpanded\}/);
  assert.match(source, /Variantes de esta familia \(\{existing.management.memberCount\}\)/);
  assert.match(source, /La lista incluye el producto actual/);
  assert.match(source, /p.id === currentProductId && <span[^>]+>Actual<\/span>/);
  assert.match(source, /p.id !== currentProductId && <button/);
  assert.match(source, /initialId: Number\(form.familyId\) \|\| null/);
  assert.match(source, /disabled=\{Boolean\(form.familyId\) && !family\}/);
});

test("archive/reactivate are explicit confirmed actions and physical deletion has no frontend entry point", async () => {
  const source = await readFile(new URL("../src/components/ProductFamilyManager.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Eliminar familia|deleteProductFamily|onDeleted|Trash2|pendingDeletion/);
  assert.match(source, /canArchive && <button/);
  assert.match(source, /canReactivate && <button/);
  assert.match(source, /setPendingState\(\{ family: existing, archived: true \}\)/);
  assert.match(source, /onClick=\{confirmStateChange\}/);
  assert.match(source, /Confirmar archivado/); assert.match(source, /Confirmar reactivación/);
  assert.match(source, /procedimiento seguro, incluidos los inactivos/);
  assert.match(source, /!archived && <button type="submit"/);
  const service = await readFile(new URL("../src/services/productFamilies.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(service, /api.delete|deleteProductFamily/);
  assert.match(service, /archived \? "archive" : "reactivate"/);
  assert.match(service, /confirmed: true, expectedUpdatedAt: family.updatedAt/);
  assert.doesNotMatch(source.slice(source.indexOf("useEffect(() =>"), source.indexOf("const family =")), /setProductFamilyArchivedRequest/);
});
