import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildOrderCommercialModel,
  formatOrderMoney,
  isReceiptEligibleStatus,
} from "../dist/modules/onlineOrders/orderCommercialModel.js";
import { renderOrderReceiptPdf } from "../dist/modules/onlineOrders/orderReceiptPdf.js";
import { renderPurchaseConfirmedMail } from "../dist/modules/notifications/purchaseConfirmedMail.js";

function source(itemCount = 1) {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    productId: index + 1,
    productName: index === 0
      ? "Taladro inalámbrico para reparación y construcción — edición Ñandú"
      : `Producto de prueba con nombre extenso número ${index + 1}`,
    unitMeasure: index % 2 ? "caja" : "unidad",
    quantity: index % 3 + 1,
    unitPrice: "12990.00",
    subtotal: String(12990 * (index % 3 + 1)),
  }));
  return {
    id: 123,
    status: "PAID",
    buyerType: "GUEST",
    buyerName: "María O'Connor <script>alert(1)</script>",
    buyerEmail: "maria@example.test",
    total: String(items.reduce((sum, item) => sum + Number(item.subtotal), 0)),
    deliveryType: "DELIVERY",
    deliveryRecipientName: "María O'Connor",
    deliveryPhone: "+56912345678",
    deliveryAddress: "Avenida Ñuble <123>",
    deliveryCommune: "Santa Juana",
    deliveryReference: "Portón café",
    paidAt: new Date("2026-09-03T15:30:00.000Z"),
    createdAt: new Date("2026-09-03T15:20:00.000Z"),
    items,
  };
}

for (const status of ["PAID", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"]) {
  assert.equal(isReceiptEligibleStatus(status), true, `${status} debe permitir comprobante`);
}
for (const status of ["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED", "EXPIRED", "PAYMENT_REVIEW"]) {
  assert.equal(isReceiptEligibleStatus(status), false, `${status} no debe permitir comprobante`);
}

const model = buildOrderCommercialModel(source());
assert.equal(model.folio, "P-000123");
assert.equal(model.total, source().total);
assert.equal(model.items[0].unitPrice, "12990.00");
assert.equal(model.items[0].subtotal, "12990");
assert.equal(model.delivery.address, "Avenida Ñuble <123>");
assert.equal(formatOrderMoney("12990.00"), "$12.990");
console.log("PASS modelo comercial conserva folio, snapshot de entrega y valores monetarios persistidos");

const onePagePdf = await renderOrderReceiptPdf(model);
assert.equal(onePagePdf.subarray(0, 5).toString(), "%PDF-");
assert.ok(onePagePdf.length > 2_000);

const multiPagePdf = await renderOrderReceiptPdf(buildOrderCommercialModel(source(65)));
const pageObjects = multiPagePdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || [];
assert.ok(pageObjects.length >= 2, `se esperaban al menos 2 páginas y se obtuvieron ${pageObjects.length}`);
if (process.env.BLOCK4A_PDF_OUTPUT) {
  await mkdir(dirname(process.env.BLOCK4A_PDF_OUTPUT), { recursive: true });
  await writeFile(process.env.BLOCK4A_PDF_OUTPUT, multiPagePdf);
}
console.log("PASS PDF real, acentos/nombres largos y salto automático a varias páginas");

const trackingUrl = "https://fyf.example.test/order-tracking#token=seguro&estado=PAID";
const mail = renderPurchaseConfirmedMail(model, trackingUrl);
assert.match(mail.subject, /Compra confirmada.*P-000123/);
assert.match(mail.text, /Gracias por tu compra/);
assert.match(mail.text, /\$12\.990/);
assert.match(mail.html, /María O&#39;Connor &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(mail.html, /Avenida Ñuble &lt;123&gt;/);
assert.doesNotMatch(mail.html, /<script>alert\(1\)<\/script>/);
assert.match(mail.html, /token=seguro&amp;estado=PAID/);
assert.doesNotMatch(mail.html, /guest_session|guest_device|Transbank|authorization/i);
console.log("PASS email HTML/text, resumen comercial, enlace guest y escape contra inyección HTML");
