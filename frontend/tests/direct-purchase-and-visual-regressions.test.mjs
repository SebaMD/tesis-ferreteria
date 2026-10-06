import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createDirectPurchaseItem,
  isDirectPurchaseOrder,
  markDirectPurchaseOrder,
  readDirectPurchaseItem,
} from "../src/helpers/directPurchase.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("compra directa conserva un único producto temporal sin mutar el carrito", async () => {
  const product = { id: 22, name: "Martillo", inStoreOnly: false };
  const directPurchase = createDirectPurchaseItem(product, 3);

  assert.deepEqual(directPurchase, { product, quantity: 3 });
  assert.deepEqual(readDirectPurchaseItem({ directPurchase }), directPurchase);
  assert.equal(createDirectPurchaseItem({ ...product, inStoreOnly: true }, 1), null);
  assert.equal(createDirectPurchaseItem(product, 0), null);

  const [controls, choice, checkout] = await Promise.all([
    read("src/components/ProductPurchaseControls.jsx"),
    read("src/pages/CheckoutChoicePage.jsx"),
    read("src/pages/CheckoutPage.jsx"),
  ]);
  assert.match(controls, /state: \{ directPurchase \}/);
  assert.doesNotMatch(controls, /const result = addSelectedQuantity\(\{ showSuccessToast: false \}\)/);
  assert.match(choice, /state=\{checkoutState\}/);
  assert.match(checkout, /directPurchase \? \[directPurchase\] : items/);
  assert.match(checkout, /items: rows\.map/);
});

test("un pedido de compra directa no descuenta productos del carrito al volver de Webpay", async () => {
  const storage = createMemoryStorage();
  assert.equal(isDirectPurchaseOrder(45, storage), false);
  assert.equal(markDirectPurchaseOrder(45, storage), true);
  assert.equal(isDirectPurchaseOrder(45, storage), true);
  assert.equal(isDirectPurchaseOrder(46, storage), false);

  const [result, guestTracking] = await Promise.all([
    read("src/pages/PaymentResultPage.jsx"),
    read("src/pages/GuestOrderTrackingPage.jsx"),
  ]);
  assert.match(result, /!isDirectPurchaseOrder\(data\.id\)/);
  assert.match(guestTracking, /!isDirectPurchaseOrder\(data\.id\)/);
});

test("las vistas de destino usan enlace externo y no renderizan mapas embebidos", async () => {
  const [management, orderDetail] = await Promise.all([
    read("src/pages/OnlineOrdersManagementPage.jsx"),
    read("src/components/orders/OrderDetailModal.jsx"),
  ]);

  for (const source of [management, orderDetail]) {
    assert.doesNotMatch(source, /DeliveryMap|MapContainer|react-leaflet/);
    assert.match(source, /buildDeliveryRouteUrl/);
    assert.match(source, /Abrir en Google Maps/);
  }
});

test("devoluciones e inventario tienen superficies oscuras específicas sin alterar light mode", async () => {
  const [sales, products, styles] = await Promise.all([
    read("src/pages/SalesPage.jsx"),
    read("src/pages/ProductsPage.jsx"),
    read("src/styles/styles.css"),
  ]);

  assert.match(sales, /sale-return-reason/);
  assert.match(sales, /sale-return-history-toggle/);
  assert.match(sales, /sale-return-history-item-toggle/);
  assert.match(products, /inventory-adjustment-note/);
  assert.match(styles, /\.dark \.sale-return-reason/);
  assert.match(styles, /\.dark \.sale-return-history-item-toggle:hover/);
  assert.match(styles, /\.dark \.inventory-adjustment-note/);
});
