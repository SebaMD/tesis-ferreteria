import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildSaleSummaryModel, renderSaleSummaryPdf } from "../dist/modules/sales/saleSummaryPdf.js";
import { buildAdministrativeOrderModel } from "../dist/modules/orderLogistics/administrativeOrderModel.js";

const date = new Date("2026-10-14T15:00:00Z");
const sale = {
  id: 7, date, paymentMethod: "efectivo", status: "PARTIALLY_RETURNED",
  total: "4000.00", returnedTotal: "1000.00", netTotal: "3000.00",
  details: [{ productName: "Taladro Ñandú", quantity: 4, returnedQuantity: 1, unitPrice: "1000.00", subtotal: "4000.00" }],
  cancellationRequests: ["PENDING", "APPROVED", "REJECTED", "REVERSED"].map((status, id) => ({
    id, status, requestedAt: date, reviewedAt: status === "PENDING" ? null : date,
    reversedAt: status === "REVERSED" ? date : null, reason: "Revisión informativa de producto",
    adminResponse: "Respuesta registrada", details: [{ productName: "Taladro Ñandú", requestedQuantity: 1 }],
  })),
};
const before = JSON.stringify(sale);
const summary = buildSaleSummaryModel(sale);
assert.equal(summary.items[0].remainingQuantity, 3);
assert.equal(summary.returnedTotal, sale.returnedTotal);
assert.equal(summary.netTotal, sale.netTotal);
assert.deepEqual(summary.returns.map(r => r.status), ["Pendiente", "Aprobada", "Rechazada", "Revertida"]);
assert.match(summary.notice, /No constituye boleta ni factura/);
assert.equal(JSON.stringify(sale), before);
for (const status of ["ACTIVE", "PARTIALLY_RETURNED", "CANCELLED"]) {
  const pdf = await renderSaleSummaryPdf(buildSaleSummaryModel({ ...sale, status }));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
}
const large = buildSaleSummaryModel({ ...sale, details: Array.from({ length: 70 }, (_, i) => ({
  ...sale.details[0], productName: `Herramienta de reparación número ${i + 1} con nombre extenso, acentos y descripción Ñandú`,
})) });
const pdf = await renderSaleSummaryPdf(large);
assert.ok((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length >= 3);
if (process.env.SALE_SUMMARY_PDF_OUTPUT) {
  await mkdir(dirname(process.env.SALE_SUMMARY_PDF_OUTPUT), { recursive: true });
  await writeFile(process.env.SALE_SUMMARY_PDF_OUTPUT, pdf);
}
console.log("PASS resumen de ventas conserva importes existentes, cantidades, cuatro estados de devolución y PDF multipágina");

const source = {
  id: 12, status: "PAID", total: "1800.00", createdAt: date, paidAt: date,
  customerType: "GUEST", customerName: "Persona Invitada", customerEmail: "guest@example.test", customerPhone: "+56911111111", customerRut: null,
  deliveryType: "PICKUP", deliveryRecipientName: null, deliveryPhone: null, deliveryAddress: null, deliveryCommune: null, deliveryReference: null,
  authorizedPayment: { buyOrder: "AUTHORIZED-NEW", authorizationCode: "123456", amount: "1800.00", transactionDate: date,
    token: "SECRET-PAYMENT-TOKEN", sessionId: "SECRET-SESSION" },
  token: "SECRET-TOKEN", guestSessionHash: "SECRET-HASH", guestDeviceHash: "SECRET-DEVICE",
  items: [{ productId: 1, productName: "Producto histórico", unitMeasure: "unidad", quantity: 2, unitPrice: "1000.00",
    subtotal: "1800.00", discountAmount: "200.00", promotionId: 1, promotionTypeSnapshot: "PERCENTAGE_DISCOUNT",
    promotionNameSnapshot: "Descuento histórico", promotionValueSnapshot: 10 }],
};
const adminModel = buildAdministrativeOrderModel(source);
assert.equal(adminModel.paymentConfirmed, true);
assert.equal(adminModel.authorizedPayment.buyOrder, "AUTHORIZED-NEW");
assert.equal(adminModel.items[0].unitPrice, "1000.00");
assert.equal(adminModel.totalDiscount, "200.00");
assert.equal(adminModel.buyer.type, "GUEST");
assert.doesNotMatch(JSON.stringify(adminModel), /SECRET|sessionId|guestSessionHash|guestDeviceHash|redirectUrl/);
for (const status of ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAYMENT_FAILED", "CANCELLED", "EXPIRED"]) {
  const model = buildAdministrativeOrderModel({ ...source, status });
  assert.equal(model.paymentConfirmed, false);
  assert.equal(model.authorizedPayment, null);
}
assert.equal(buildAdministrativeOrderModel({ ...source, paidAt: null }).paymentConfirmed, false);
assert.equal(buildAdministrativeOrderModel({ ...source, authorizedPayment: { ...source.authorizedPayment, amount: "99" } }).paymentConfirmed, false);
const clientModel = buildAdministrativeOrderModel({ ...source, customerType: "CLIENT", customerRut: "10120345-K" });
assert.equal(clientModel.buyer.type, "CLIENT");
assert.equal(clientModel.buyer.rut, "10120345-K");
const deliveryModel = buildAdministrativeOrderModel({ ...source, deliveryType: "DELIVERY",
  deliveryRecipientName: "Destinatario de prueba", deliveryPhone: "+56922222222",
  deliveryAddress: "Dirección de prueba", deliveryCommune: "Comuna de prueba", deliveryReference: "Referencia de prueba" });
assert.equal(deliveryModel.delivery.type, "DELIVERY");
assert.equal(deliveryModel.delivery.recipientName, "Destinatario de prueba");
assert.equal(deliveryModel.delivery.phone, "+56922222222");
assert.equal(deliveryModel.delivery.address, "Dirección de prueba");
assert.equal(deliveryModel.delivery.commune, "Comuna de prueba");
assert.equal(deliveryModel.delivery.reference, "Referencia de prueba");

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.MAIL_ENABLED = "false";
const { getAdministrativeOrderSummaryService } = await import("../dist/modules/orderLogistics/orderLogistics.service.js");
for (const role of ["WAREHOUSE", "CASHIER", "CLIENT", "GUEST"]) {
  await assert.rejects(getAdministrativeOrderSummaryService(12, { role }), error => error.statusCode === 403);
}
await (await import("../dist/db/index.js")).db.$client.end();
console.log("PASS ficha administrativa: snapshots, confirmación estricta, exclusión de secretos y denegación antes de consultar BD");
