import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { getProductCartAvailability, validateCartQuantity } from "../src/helpers/cartQuantity.js";

const product = Object.freeze({ id: 12, familyId: 4, availableStock: 8, currentStock: 30 });
const line = (id, quantity) => ({ product: { id, familyId: 4 }, quantity });
const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("estimated availability follows cart add, increase, decrease and removal without changing stock", () => {
  for (const [quantity, expected] of [[0, 8], [2, 6], [7, 1], [3, 5], [0, 8]]) {
    const items = quantity ? [line("12", quantity)] : [];
    const before = JSON.stringify(items);
    const state = getProductCartAvailability(product, items);
    assert.equal(state.remaining, expected);
    assert.equal(state.quantityInCart, quantity);
    assert.equal(state.availableStock, 8); // Never use physical stock to bypass reservations.
    assert.equal(JSON.stringify(items), before);
  }
  assert.equal(product.availableStock, 8);
  assert.equal(product.currentStock, 30);
});

test("CLIENT and guest cart snapshots use concrete SKU IDs, not shared family IDs", () => {
  for (const items of [[line(12, 2), line(13, 7)], [line(12, 4), line(13, 1)]]) {
    assert.equal(getProductCartAvailability(product, items).remaining, 8 - items[0].quantity);
    assert.equal(getProductCartAvailability({ ...product, id: 13 }, items).remaining, 8 - items[1].quantity);
    assert.equal(getProductCartAvailability({ ...product, id: 14 }, items).remaining, 8);
  }
});

test("cart limit is distinct from no stock, clamps to zero and recovers after removal", () => {
  for (const quantity of [8, 10]) {
    const state = getProductCartAvailability(product, [line(12, quantity)]);
    assert.equal(state.remaining, 0);
    assert.equal(state.isCartLimitReached, true);
  }
  assert.equal(getProductCartAvailability({ ...product, availableStock: 0 }, [line(12, 1)]).isCartLimitReached, false);
  assert.equal(getProductCartAvailability(product, []).isCartLimitReached, false);
  assert.equal(getProductCartAvailability(null).remaining, 0);
});

test("cards, simple detail, selected variant and purchase controls share the cart estimate", async () => {
  const view = await read("components/ProductEstimatedAvailability.jsx");
  assert.match(view, /useCart\(\)/);
  assert.match(view, /getProductCartAvailability\(product, items\)/);
  assert.match(view, /Máximo disponible considerando tu carrito/);
  assert.match(view, /Disponible estimado para agregar/);
  assert.match(view, /product.status !== false && !product.inStoreOnly/);
  assert.match(view, /aria-live="polite"/);
  for (const file of ["components/ProductCard.jsx", "pages/ProductDetailPage.jsx", "pages/ProductFamilyPage.jsx"]) {
    assert.match(await read(file), /<ProductEstimatedAvailability product=\{/);
  }
  const controls = await read("components/ProductPurchaseControls.jsx");
  assert.match(controls, /getProductCartAvailability\(product, items\)/);
  assert.match(controls, /remaining < 1 \|\| quantity > remaining/);
  assert.match(controls, /addProduct\(product, quantity, options\)/);
  assert.match(controls, /createDirectPurchaseItem\(product, quantity\)/);
  assert.doesNotMatch(view, /api\.|fetch\(|reserve|localStorage|sessionStorage/);
});

test("quote errors use a scoped high-contrast alert and a centered responsive retry button", async () => {
  const page = await read("pages/CheckoutPage.jsx");
  assert.match(page, /role="alert" className="checkout-quote-alert grid min-w-0 gap-4/);
  assert.match(page, /w-full max-w-full justify-self-center px-5 sm:w-auto sm:min-w-56/);
  assert.match(page, /onClick=\{\(\) => setQuoteRefresh\(v => v \+ 1\)\}/);
  const css = await read("styles/styles.css");
  assert.match(css, /\.checkout-quote-alert\s*\{\s*border: 1px solid #dc2626;\s*background-color: #fef2f2;\s*color: #10151f;/);
});

test("cart displays additional capacity but validates the total against raw backend stock, even at the limit", async () => {
  const available = { id: 12, availableStock: 10, currentStock: 30 };
  for (const quantity of [3, 4, 2, 10]) {
    const persistedItems = JSON.parse(JSON.stringify([line(12, quantity)]));
    const state = getProductCartAvailability(available, persistedItems);
    assert.equal(state.remaining, 10 - quantity);
    assert.equal(validateCartQuantity(quantity, state.availableStock).valid, true);
    assert.equal(validateCartQuantity(11, state.availableStock).valid, false);
  }
  const page = await read("pages/ClientCartPage.jsx");
  assert.match(page, /<ProductEstimatedAvailability product=\{row.product\} compact inCart/);
  assert.match(page, /availableStock=\{row.availableStock\}/);
  assert.match(page, /updateQuantity\(row.product.id, quantity, row.availableStock\)/);
  assert.doesNotMatch(page, /getRemainingCartCapacity|availableStock=\{.*remaining/);
  const view = await read("components/ProductEstimatedAvailability.jsx");
  assert.match(view, /Disponibles para agregar/);
  assert.match(view, /isCartLimitReached && !inCart/);
});

test("dispatch settings share the fixed-width search/filter row, remain right-aligned for ADMIN/MANAGER", async () => {
  const page = await read("pages/OnlineOrdersManagementPage.jsx");
  const toolbar = page.slice(page.indexOf('aria-label="Buscar y filtrar pedidos"'), page.indexOf('<section className={tablePanelClass}>'));
  assert.equal((page.match(/<DeliverySettingsManager role=\{user\?\.role\}/g) || []).length, 1);
  assert.doesNotMatch(page.slice(page.indexOf("<header"), page.indexOf("</header>")), /<DeliverySettingsManager/);
  assert.match(toolbar, /Filtrar por estado/);
  assert.match(toolbar, /ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-3/);
  assert.match(toolbar, /<DeliverySettingsManager role=\{user\?\.role\}/);
  assert.match(toolbar, /max-w-\[670px\] flex-none grid-cols-\[minmax\(0,1fr\)_220px\]/);
  assert.match(toolbar, /max-\[720px\]:max-w-none max-\[720px\]:grid-cols-1/);
  assert.doesNotMatch(toolbar, /flex-\[1_1_28rem\]/);
  assert.match(await read("components/DeliverySettingsManager.jsx"), /\["ADMIN", "MANAGER"\]\.includes\(role\)/);
});
