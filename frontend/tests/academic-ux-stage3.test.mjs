import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { creationStockAction } from "../src/helpers/creationStock.js";
import { routeScrollAction, readRouteScrollEntries, persistRouteScrollEntries } from "../src/helpers/routeScroll.js";
import { simpleProductPayload, bundleDraft, newBundleRow } from "../src/helpers/productBundleForm.js";
import { rememberCatalogEntry, readCatalogEntry } from "../src/helpers/catalogNavigation.js";
import { informationNavigationState, informationReturn } from "../src/helpers/informationNavigation.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("initial stock actions distinguish empty, explicit zero, positives and per-SKU mixtures", () => {
  assert.equal(creationStockAction([""]).label, "Guardar y registrar entrada");
  assert.equal(creationStockAction([0]).label, "Guardar y revisar existencias");
  assert.equal(creationStockAction(["5"]).label, "Guardar y revisar entrada");
  assert.equal(creationStockAction(["", ""]).label, "Guardar y registrar entradas");
  assert.equal(creationStockAction([0, ""]).label, "Guardar y revisar existencias");
  assert.equal(creationStockAction(["", 8, 0]).label, "Guardar y revisar entradas");
  for (const value of [-1, 1.5, "NaN", "abc", 2147483648]) assert.equal(creationStockAction([value]).valid, false);
  assert.equal(creationStockAction([2147483647]).valid, true);
});

test("empty and zero persist as zero through the existing payload; new rows do not copy stock", () => {
  const base = { name: "Producto", categoryId: 1, unitMeasure: "unidad", price: 1000, minimumStock: 0 };
  assert.equal(simpleProductPayload({ ...base, initialStock: "" }, "key", []).variants[0].initialStock, 0);
  assert.equal(simpleProductPayload({ ...base, initialStock: 0 }, "key", []).variants[0].initialStock, 0);
  assert.equal(simpleProductPayload({ ...base, initialStock: 6 }, "key", []).variants[0].initialStock, 6);
  assert.equal(newBundleRow(1, { initialStock: 25 }).initialStock, "");
  assert.equal(bundleDraft(null, base).rows[0].initialStock, "");
});

test("navigation resets new pages, restores POP and contextual catalog, but not renders/filters/variant selection", () => {
  const old = { key: "a", pathname: "/catalog", search: "" };
  const next = { key: "b", pathname: "/catalog/products/99", search: "" };
  assert.deepEqual(routeScrollAction(old, next, "PUSH"), { x: 0, y: 0 });
  assert.equal(routeScrollAction(old, old, "PUSH"), null);
  assert.equal(routeScrollAction(old, { ...old, key: "b", search: "?search=algo" }, "REPLACE"), null);
  assert.equal(routeScrollAction(next, { ...next, key: "c", search: "?variant=3" }, "REPLACE"), null);
  const saved = { pathname: "/catalog", position: { x: 0, y: 750 } };
  assert.deepEqual(routeScrollAction(next, old, "POP", saved), saved.position);
  assert.deepEqual(routeScrollAction(next, { ...old, state: { restoreCatalog: { scrollY: 600 } } }, "PUSH"), { x: 0, y: 600 });
  assert.equal(routeScrollAction(old, { ...next, pathname: "/products" }, "PUSH"), null);
  assert.deepEqual(routeScrollAction(null, old, "POP", saved), saved.position);
  const origin = informationNavigationState({ ...old, state: {} }, "/favorites");
  const back = informationReturn(origin, "/favorites");
  assert.equal(back.state.restoreClientScrollKey, "a");
  assert.deepEqual(routeScrollAction(next, { ...old, state: back.state }, "PUSH", saved), saved.position);
  assert.equal(informationNavigationState({ ...old, state: origin }, "/catalog"), origin);
  assert.equal(informationReturn(origin, "/catalog").to.pathname, "/catalog");
});

test("scroll persistence is bounded and excludes search/hash/token data; storage failure is safe", () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  const entries = new Map(Array.from({ length: 90 }, (_, index) => [String(index), { pathname: "/catalog", position: { x: 0, y: index } }]));
  persistRouteScrollEntries(entries, storage);
  assert.equal(readRouteScrollEntries(storage).size, 60);
  assert.doesNotMatch(value, /token|search|hash/);
  assert.equal(readRouteScrollEntries({ getItem() { throw Error("blocked"); } }).size, 0);
  assert.doesNotThrow(() => persistRouteScrollEntries(entries, { setItem() { throw Error("blocked"); } }));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  try {
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw Error("storage denied"); } });
    assert.equal(readRouteScrollEntries().size, 0);
    assert.doesNotThrow(() => persistRouteScrollEntries(entries));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor); else delete globalThis.sessionStorage;
  }
  rememberCatalogEntry("ux3-test", { snapshot: { filters: { categoryId: "2" }, page: 3, pageSize: 20, order: "price-desc" }, scrollY: 750 });
  assert.equal(readCatalogEntry("ux3-test").snapshot.filters.categoryId, "2");
  assert.equal(readCatalogEntry("ux3-test").snapshot.page, 3);
});

test("category return stays outside fields and captures draft; conversion title takes priority", async () => {
  const [page, editor, styles] = await Promise.all([read("pages/ProductsPage.jsx"), read("components/ProductBundleEditor.jsx"), read("styles/styles.css")]);
  assert.match(page, /className="linked-flow-back"/);
  assert.match(styles, /\.linked-flow-back \{\s*position: static/);
  assert.match(page, /flowActions=\{linkedRegistration\?\.step === "product"/);
  assert.match(page, /title=\{editingProductId && variantsEnabled \? "Convertir producto en variantes"/);
  assert.match(page, /productDraft = \{ form, unitSearch, files: pendingProductImages/);
  assert.match(editor, /saved\?\.conversion\?\.expectedRevision===data.revision/);
  assert.match(editor, /onCreated\?\.\(result, creation\)/);
  assert.match(page, /setCreationReview\(\{ familyId: result.familyId, items, category \}\)/);
  assert.doesNotMatch(page.match(/const finishNewBundle =[\s\S]*?const returnFromConversion/)[0], /createInventoryMovementRequest/);
});

test("guest empty state has catalog action, real headers preserve contextual return and symmetric mobile centering", async () => {
  const [guest, styles, navbar, empty] = await Promise.all([read("pages/GuestDeviceOrdersPage.jsx"), read("styles/styles.css"), read("components/ClientNavbar.jsx"), read("components/CatalogEmptyState.jsx")]);
  assert.match(guest, /<CatalogEmptyState icon=\{ClipboardList\}/);
  assert.match(empty, /Explorar catálogo<\/Link>/);
  assert.match(guest, /orders.length > 0 && <InformationBackLink/);
  assert.match(styles, /grid-template-columns: 44px minmax\(0, 1fr\) 44px/);
  assert.match(styles, /\.compact-back-link \{[^}]*width: 44px;[^}]*background: transparent; color: var\(--color-rust-600\)/s);
  assert.match(navbar, /to="\/account" state=\{informationNavigationState\(location, "\/account"\)\}/);
});
