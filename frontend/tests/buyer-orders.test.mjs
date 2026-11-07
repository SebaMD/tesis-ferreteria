import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { groupBuyerOrders } from "../src/helpers/buyerOrderGroups.js";
import { getOnlineOrderStatus } from "../src/helpers/onlineOrders.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Mis pedidos respeta movimiento reducido al desplazarse al pedido sin cambiar el destino", async () => {
  const source = await read("src/pages/ClientOrdersPage.jsx");
  const effect = source.match(/useEffect\(\(\) => \{\s*(if \(loading \|\| !location\.hash\.startsWith\("#order-"\)[\s\S]*?)\}, \[loading, location\.hash, location\.key, orders\]\);/)?.[1];
  assert.ok(effect, "debe conservar el efecto de navegación al pedido");
  const runEffect = ({ reducedMotion = false, loading = false, hash = "#order-42", exists = true, scrolledLocation = {current:null} } = {}) => {
    const calls = [];
    const queries = [];
    const ids = [];
    runInNewContext(`(() => { ${effect} })()`, {
      loading,
      location: { hash, key: 'navigation-1' },
      scrolledLocation,
      window: { matchMedia: query => { queries.push(query); return { matches: reducedMotion }; } },
      document: { getElementById: id => {
        ids.push(id);
        return exists ? { scrollIntoView: options => calls.push({ ...options }) } : null;
      } },
    });
    return { calls, queries, ids };
  };
  for (const reducedMotion of [false, true]) {
    const result = runEffect({ reducedMotion });
    assert.deepEqual(result.queries, ["(prefers-reduced-motion: reduce)"]);
    assert.deepEqual(result.ids, ["order-42"]);
    assert.deepEqual(result.calls, [{ behavior: reducedMotion ? "instant" : "smooth", block: "center" }]);
  }
  for (const input of [{ loading: true }, { hash: "" }, { hash: "#other" }]) {
    assert.deepEqual(runEffect(input), { calls: [], queries: [], ids: [] });
  }
  assert.deepEqual(runEffect({ exists: false }).calls, []);
  const scrolledLocation = {current:null};
  assert.equal(runEffect({scrolledLocation}).calls.length,1);
  assert.equal(runEffect({scrolledLocation}).calls.length,0,'Refreshing the same order must not move the scroll again');
});

test("los intentos de pago no se clasifican como pedidos operativos", () => {
  const orders = [
    { id: 1, status: "PENDING_PAYMENT" },
    { id: 2, status: "PAYMENT_REVIEW" },
    { id: 3, status: "PAYMENT_FAILED" },
    { id: 4, status: "CANCELLED" },
    { id: 5, status: "EXPIRED" },
    { id: 6, status: "PAID" },
    { id: 7, status: "PREPARING" },
    { id: 8, status: "OUT_FOR_DELIVERY" },
    { id: 9, status: "DELIVERED" },
  ];

  const grouped = groupBuyerOrders(orders);
  assert.deepEqual(grouped.payments.map(({ id }) => id), [1, 2]);
  assert.deepEqual(grouped.active.map(({ id }) => id), [6, 7, 8]);
  assert.deepEqual(grouped.incomplete.map(({ id }) => id), [3, 4, 5]);
  assert.deepEqual(grouped.delivered.map(({ id }) => id), [9]);
});

test("las tarjetas normales no ofrecen ocultar; los modales y la restauración local lo conservan", async () => {
  const [client, guest, card] = await Promise.all([
    read("src/pages/ClientOrdersPage.jsx"), read("src/pages/GuestDeviceOrdersPage.jsx"), read("src/components/orders/OrderSummaryCard.jsx"),
  ]);
  assert.doesNotMatch(client, /afterDetailActions=/);
  assert.match(client, /actions=\{selectedOrder \? <>[\s\S]*?\{actionsFor\(selectedOrder\)\}/);
  const incompleteSection = guest.split('<OrdersSection title="No completados"')[1].split("/>")[0];
  assert.doesNotMatch(incompleteSection, /renderAfterDetail/);
  assert.match(guest, /title="Intentos ocultos"[^\n]*renderAfterDetail=\{visibilityActionFor\}/);
  assert.match(guest, /actions=\{selectedOrder \? <>[\s\S]*?\{actionsFor\(selectedOrder\)\}\{visibilityActionFor\(selectedOrder\)\}/);
  assert.match(card, /isOnlineOrderPaid\(order.status\) && order.status !== "DELIVERED"/);
  assert.match(card, /max-\[680px\]:row-start-1/);
});

test("cada intento no completado conserva un mensaje acorde a su estado real", () => {
  const cancelled = getOnlineOrderStatus("CANCELLED");
  const expired = getOnlineOrderStatus("EXPIRED");
  const failed = getOnlineOrderStatus("PAYMENT_FAILED");
  const pending = getOnlineOrderStatus("PENDING_PAYMENT");

  assert.equal(cancelled.label, "Compra cancelada");
  assert.match(cancelled.description, /no se realizó ningún cargo/i);
  assert.doesNotMatch(cancelled.description, /expir/);
  assert.equal(expired.label, "Reserva expirada");
  assert.match(expired.description, /venció.*reserva de stock fue liberada/i);
  assert.equal(failed.label, "Pago no completado");
  assert.doesNotMatch(failed.description, /expir/);
  assert.equal(pending.label, "Pendiente de pago");
});

test("cliente e invitado comparten la clasificación y no reciben navegación logística", async () => {
  const [clientOrders, guestOrders, guestTracking, paymentResult, buyerDetail, management, scan] = await Promise.all([
    read("src/pages/ClientOrdersPage.jsx"),
    read("src/pages/GuestDeviceOrdersPage.jsx"),
    read("src/pages/GuestOrderTrackingPage.jsx"),
    read("src/pages/PaymentResultPage.jsx"),
    read("src/components/orders/OrderDetailModal.jsx"),
    read("src/pages/OnlineOrdersManagementPage.jsx"),
    read("src/pages/LogisticsScanPage.jsx"),
  ]);

  for (const source of [clientOrders, guestOrders]) {
    assert.match(source, /groupBuyerOrders/);
    assert.match(source, /Pagos pendientes/);
    assert.match(source, /Pedidos en curso/);
  }
  assert.match(clientOrders, /Reintentar pago/);
  assert.match(clientOrders, /Ocultar/);
  assert.match(guestOrders, /retryGuestDeviceOrderPaymentRequest/);
  assert.match(guestOrders, /Reintentar pago/);
  assert.match(guestOrders, /Mostrar ocultos/);
  assert.match(guestOrders, /writeHiddenGuestOrderIds\(sessionStorage, next\)/);
  assert.doesNotMatch(guestOrders, /archiveOnlineOrderRequest|restoreArchivedOnlineOrderRequest/);
  assert.match(guestTracking, /isPaid && order\.buyerEmail/);
  assert.match(paymentResult, /retryOnlineOrderPaymentRequest/);
  assert.match(paymentResult, /Reintentar pago/);
  for (const source of [paymentResult, guestTracking]) {
    assert.match(source, /Reintentar pago/);
    assert.match(source, /Ver mis pedidos/);
    assert.match(source, /Volver al carrito/);
  }
  assert.match(paymentResult, /to=\{`\/orders#order-\$\{order\.id\}`\}/);
  assert.match(guestTracking, /to="\/guest-orders">Ver mis pedidos/);
  assert.match(guestTracking, /\{isPaid && \([\s\S]*purchase-receipt/);
  assert.doesNotMatch(buyerDetail, /buildDeliveryRouteUrl|Abrir en Google Maps/);
  for (const source of [management, scan]) {
    assert.match(source, /buildDeliveryRouteUrl/);
    assert.match(source, /Abrir en Google Maps/);
  }
});
