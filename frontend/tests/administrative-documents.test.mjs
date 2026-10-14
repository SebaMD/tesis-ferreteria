import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canViewAdministrativeOrder, formatAdministrativeOrderText, getAdministrativeOrderSections, printAdministrativeOrder } from "../src/helpers/administrativeOrder.js";

const model = {
  folio: "P-000012", createdAt: "2026-10-14T15:00:00Z", status: "PAID", paidAt: "2026-10-14T15:01:00Z", paymentConfirmed: true,
  notice: "Documento informativo interno. No constituye boleta ni factura.",
  buyer: { type: "GUEST", name: "María <script>alert(1)</script>", email: "maria@example.test", phone: "+56911111111", rut: null },
  items: [{ productName: "Producto histórico", quantity: 2, unitMeasure: "unidad", unitPrice: "1000.00", discountAmount: "200.00", subtotal: "1800.00", promotionType: "PERCENTAGE_DISCOUNT", promotionName: "Promo histórica", promotionValue: 10 }],
  baseSubtotal: "2000.00", totalDiscount: "200.00", total: "1800.00",
  delivery: { type: "DELIVERY", label: "Despacho a domicilio", recipientName: "María", phone: "+56922222222", address: "Calle <123>", commune: "Santa Juana", reference: "Portón azul" },
  authorizedPayment: { buyOrder: "AUTHORIZED", authorizationCode: "123456", amount: "1800.00", transactionDate: "2026-10-14T15:01:00Z", token: "DO-NOT-COPY" },
  token: "DO-NOT-COPY", sessionId: "DO-NOT-COPY", guestDeviceHash: "DO-NOT-COPY",
};
test("ficha/copia solo usa datos explícitos e históricos; nunca secretos", () => {
  const text = formatAdministrativeOrderText(model);
  for (const value of ["Invitado", "maria@example.test", "+56911111111", "+56922222222", "Promo histórica", "AUTHORIZED", "123456", "No constituye boleta ni factura"]) assert.ok(text.includes(value));
  assert.doesNotMatch(text, /DO-NOT-COPY|sessionId|guestDeviceHash/);
  for (const status of ["PENDING_PAYMENT", "PAYMENT_REVIEW"]) {
    const pending = formatAdministrativeOrderText({ ...model, status, paymentConfirmed: false });
    assert.match(pending, /No confirmado para registro de venta/);
    assert.doesNotMatch(pending, /Webpay buy_order|Código de autorización/);
  }
  for (const role of ["ADMIN", "MANAGER"]) assert.equal(canViewAdministrativeOrder(role), true);
  for (const role of ["WAREHOUSE", "CASHIER", "CLIENT", undefined]) assert.equal(canViewAdministrativeOrder(role), false);
});

test("CLIENT e Invitado conservan datos, secciones y saltos de línea reales al copiar", () => {
  for (const type of ["CLIENT", "GUEST"]) {
    const source = { ...model, buyer: { ...model.buyer, type, rut: type === "CLIENT" ? "10120345-K" : null } };
    const before = JSON.stringify(source);
    const text = formatAdministrativeOrderText(source);
    const sections = getAdministrativeOrderSections(source);
    assert.deepEqual(sections.map(s => s.title), ["Datos generales del pedido y comprador", "Entrega o retiro", "Resumen económico", "Información de pago Webpay"]);
    for (const heading of [...sections.map(s => s.title), "Productos comprados"]) assert.ok(text.includes(`\n\n${heading}\n`));
    assert.ok(text.split("\n").length > 25);
    assert.doesNotMatch(text, /\\n|\\$/m);
    assert.ok(text.includes(type === "CLIENT" ? "Cliente registrado" : "Invitado"));
    if (type === "CLIENT") assert.ok(text.includes("10120345-K"));
    assert.equal(JSON.stringify(source), before);
  }
  const pickup = getAdministrativeOrderSections({ ...model, delivery: { ...model.delivery, type: "PICKUP", label: "Retiro en tienda" } });
  assert.deepEqual(pickup[1].fields, [["Modalidad", "Retiro en tienda"]]);
});

function withPrintDocument(check) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  let printed = false, removed = false, afterPrint;
  const node = tag => ({ tag, children: [], textContent: "", appendChild(child) { this.children.push(child); return child; } });
  const head = node("head"), body = node("body");
  const frame = { style: {}, setAttribute() {}, remove() { removed = true; },
    contentDocument: { createElement: node, head, body },
    contentWindow: { focus() {}, print() { printed = true; }, addEventListener(event, fn) { assert.equal(event, "afterprint"); afterPrint = fn; } } };
  globalThis.document = { createElement: tag => { assert.equal(tag, "iframe"); return frame; }, body: { appendChild() {} } };
  globalThis.window = { setTimeout() {} };
  try {
    check({ frame, head, body, isPrinted: () => printed });
    if (afterPrint) { afterPrint(); assert.equal(removed, true); }
  } finally { globalThis.document = previousDocument; globalThis.window = previousWindow; }
}

const allNodes = node => [node, ...node.children.flatMap(allNodes)];

test("imprimir crea documento completo, tabla y secciones seguras sin depender del acordeón", () => {
  for (const type of ["CLIENT", "GUEST"]) withPrintDocument(({ head, body, isPrinted }) => {
    printAdministrativeOrder({ ...model, buyer: { ...model.buyer, type } });
    assert.equal(isPrinted(), true);
    assert.equal(body.children[0].tag, "article");
    const nodes = allNodes(body);
    const text = nodes.map(n => n.textContent).join("\n");
    assert.ok(nodes.some(n => n.tag === "table"));
    assert.ok(nodes.some(n => n.tag === "thead"));
    assert.deepEqual(nodes.filter(n => n.tag === "h2").map(n => n.textContent), ["Datos generales del pedido y comprador", "Productos comprados", "Resumen económico", "Entrega o retiro", "Información de pago Webpay"]);
    for (const value of ["FERRETERÍA FYF", model.folio, model.notice, "Producto histórico", "Promo histórica", "AUTHORIZED", "123456", "Calle <123>"]) assert.ok(text.includes(value));
    assert.ok(text.includes(type === "CLIENT" ? "Cliente registrado" : "Invitado"));
    assert.match(text, /<script>alert\(1\)<\/script>/);
    assert.ok(nodes.every(n => n.innerHTML === undefined));
    assert.doesNotMatch(text, /DO-NOT-COPY|sessionId|guestDeviceHash|Copiar datos|Imprimir ficha/);
    assert.ok(!nodes.some(n => ["nav", "button", "script"].includes(n.tag)));
    assert.match(head.children[0].textContent, /@page\{size:A4;margin:16mm\}/);
    assert.match(head.children[0].textContent, /table-header-group/);
    assert.match(head.children[0].textContent, /break-inside:avoid/);
  });
});

test("impresión conserva todos los productos y nunca imprime referencias de un pago no confirmado", () => {
  withPrintDocument(({ body }) => {
    const items = Array.from({ length: 120 }, (_, i) => ({ ...model.items[0], productName: `Producto extenso ${i} Ñandú` }));
    printAdministrativeOrder({ ...model, status: "PAYMENT_REVIEW", paymentConfirmed: false, items });
    const nodes = allNodes(body);
    assert.equal(nodes.find(n => n.tag === "tbody").children.length, 120);
    const text = nodes.map(n => n.textContent).join("\n");
    assert.match(text, /Producto extenso 119 Ñandú/);
    assert.match(text, /No confirmado para registro de venta/);
    assert.doesNotMatch(text, /Webpay buy_order|Código de autorización|AUTHORIZED|DO-NOT-COPY/);
  });
});

test("vista compartida protege ficha y conserva descargas con permisos de ventas", async () => {
  const read = p => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
  const [management, card, sales, service, button] = await Promise.all([
    read("pages/OnlineOrdersManagementPage.jsx"), read("components/orders/AdministrativeOrderCard.jsx"),
    read("pages/SalesPage.jsx"), read("services/sales.service.js"), read("components/orders/DownloadSaleSummaryButton.jsx"),
  ]);
  assert.match(management, /\["ADMIN", "MANAGER"\]\.includes\(user\?\.role\) && selectedOrder\.origin === "ONLINE"/);
  assert.match(card, /if \(!allowed\) return null/);
  assert.match(card, /if \(!allowed\) return;/);
  assert.match(card, /Copiar datos para registro manual/);
  assert.match(card, /Imprimir ficha/);
  assert.match(card, /\[expanded, setExpanded\] = useState\(false\)/);
  assert.match(card, /setExpanded\(current => !current\)/);
  assert.match(card, /aria-expanded=\{expanded\} aria-controls=\{contentId\}/);
  assert.match(card, /id=\{contentId\} hidden=\{!expanded\}/);
  assert.match(card, /<button type="button"/);
  assert.match(card, /useId\(\)/);
  assert.match(management, /AdministrativeOrderCard key=\{selectedOrder\.id\}/);
  assert.match(card, /\}, \[allowed, orderId\]\)/);
  assert.match(card, /<\/div>\s*<div[^>]+aria-label="Acciones de la ficha administrativa"/);
  assert.match(card, /max-\[620px\]:grid-cols-1/);
  assert.match(card, /getAdministrativeOrderSections\(model\)/);
  assert.match(sales, /DownloadSaleSummaryButton saleId=\{saleDetail\.id\}/);
  assert.match(sales, /no constituyen autorización legal ni comercial/);
  assert.match(button, /Descargar resumen de venta \(PDF\)/);
  assert.match(service, /sales\/\$\{id\}\/summary/);
  assert.match(service, /responseType: "blob"/);
});
