import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:55440/postgres";

const {
  allowedDocuments,
  presentLogisticsTask,
} = await import("../dist/modules/orderLogistics/orderLogistics.service.js");
const {
  buildDispatchLabelModel,
  buildPreparationLabelModel,
} = await import("../dist/modules/orderLogistics/logisticsLabelModels.js");
const { renderPreparationLabelPdf } = await import("../dist/modules/orderLogistics/preparationLabelPdf.js");
const { renderDispatchLabelPdf } = await import("../dist/modules/orderLogistics/dispatchLabelPdf.js");

const warehouseA = { id: 101, role: "WAREHOUSE" };
const warehouseB = { id: 202, role: "WAREHOUSE" };
const admin = { id: 301, role: "ADMIN" };
const manager = { id: 302, role: "MANAGER" };

function task(overrides = {}) {
  return {
    id: 12,
    origin: "ONLINE",
    folio: "P-000012",
    status: "PAID",
    total: "39980.00",
    deliveryType: "DELIVERY",
    customerType: "GUEST",
    customerName: "Compradora Privada",
    customerRut: "11111111-1",
    customerEmail: "privado@example.test",
    customerPhone: "+56911111111",
    deliveryRecipientName: "Receptora Ñandú",
    deliveryRecipientRut: "22222222-2",
    deliveryPhone: "+56922222222",
    deliveryAddress: "Calle Privada 123",
    deliveryCommune: "Santa Juana",
    deliveryReference: "Portón café",
    deliveryLatitude: -37.17,
    deliveryLongitude: -72.94,
    paidAt: new Date("2026-09-04T14:00:00.000Z"),
    paymentMethod: "WEBPAY_PLUS",
    cashierName: null,
    preparationStartedBy: null,
    preparationStartedAt: null,
    preparedBy: null,
    preparedAt: null,
    deliveryStartedBy: null,
    deliveryStartedAt: null,
    deliveredBy: null,
    deliveredAt: null,
    receivedByName: null,
    receivedByRut: null,
    proofAvailable: true,
    createdAt: new Date("2026-09-04T13:55:00.000Z"),
    updatedAt: new Date("2026-09-04T14:00:00.000Z"),
    items: [
      { productId: 1, productName: "Taladro inalámbrico Ñandú", unitMeasure: "unidad", quantity: 1, unitPrice: "29990.00", subtotal: "29990.00" },
      { productId: 2, productName: "Tornillos de prueba", unitMeasure: "caja", quantity: 2, unitPrice: "4995.00", subtotal: "9990.00" },
    ],
    productCount: 2,
    totalUnits: 3,
    preparationStartedByUser: null,
    preparedByUser: null,
    deliveryStartedByUser: null,
    deliveredByUser: null,
    ...overrides,
  };
}

function assertNoBuyerPrivateData(value) {
  for (const field of [
    "customerName", "customerRut", "customerEmail", "customerPhone",
    "deliveryRecipientName", "deliveryRecipientRut", "deliveryPhone",
    "deliveryAddress", "deliveryCommune", "deliveryReference",
    "deliveryLatitude", "deliveryLongitude", "receivedByName", "receivedByRut",
  ]) {
    assert.equal(Object.hasOwn(value, field), false, `${field} no debe exponerse`);
  }
}

const paid = task();
const paidForWarehouse = presentLogisticsTask(paid, warehouseA);
assertNoBuyerPrivateData(paidForWarehouse);
assert.deepEqual(paidForWarehouse.availableDocuments, ["PREPARATION_LABEL"]);

const preparing = task({ status: "PREPARING", preparationStartedBy: warehouseA.id });
assertNoBuyerPrivateData(presentLogisticsTask(preparing, warehouseA));
assert.deepEqual(allowedDocuments(preparing, warehouseA), ["PREPARATION_LABEL"]);
assert.deepEqual(allowedDocuments(preparing, warehouseB), []);

const readyForDelivery = task({ status: "READY_FOR_DELIVERY" });
assertNoBuyerPrivateData(presentLogisticsTask(readyForDelivery, warehouseA));
assert.deepEqual(allowedDocuments(readyForDelivery, warehouseA), []);

const assignedDelivery = task({
  status: "OUT_FOR_DELIVERY",
  deliveryStartedBy: warehouseB.id,
  deliveryStartedAt: new Date("2026-09-04T15:00:00.000Z"),
});
const assignedView = presentLogisticsTask(assignedDelivery, warehouseB);
assert.equal(assignedView.deliveryAddress, "Calle Privada 123");
assert.equal(assignedView.deliveryPhone, "+56922222222");
assert.equal(Object.hasOwn(assignedView, "customerEmail"), false);
assert.deepEqual(assignedView.availableDocuments, ["DISPATCH_LABEL"]);
assertNoBuyerPrivateData(presentLogisticsTask(assignedDelivery, warehouseA));
assert.deepEqual(allowedDocuments(assignedDelivery, warehouseA), []);

const pickup = task({ status: "READY_FOR_PICKUP", deliveryType: "PICKUP" });
const pickupView = presentLogisticsTask(pickup, warehouseA);
assert.equal(pickupView.customerName, "Compradora Privada");
assert.equal(Object.hasOwn(pickupView, "customerRut"), false);
assert.equal(Object.hasOwn(pickupView, "customerEmail"), false);

const delivered = task({ status: "DELIVERED", deliveredAt: new Date() });
assertNoBuyerPrivateData(presentLogisticsTask(delivered, warehouseB));
assert.equal(presentLogisticsTask(delivered, warehouseB).proofAvailable, false);

for (const administrativeUser of [admin, manager]) {
  const view = presentLogisticsTask(delivered, administrativeUser);
  assert.equal(view.customerEmail, "privado@example.test");
  assert.equal(view.deliveryAddress, "Calle Privada 123");
  assert.equal(view.proofAvailable, true);
}
console.log("PASS privacidad por estado, rol y responsable del reparto");

const preparationModel = buildPreparationLabelModel({
  ...paid,
  items: Array.from({ length: 70 }, (_, index) => ({
    productId: index + 1,
    productName: `Producto operacional largo número ${index + 1} Ñandú`,
    unitMeasure: index % 2 ? "caja" : "unidad",
    quantity: index % 3 + 1,
    unitPrice: "1.00",
    subtotal: "1.00",
  })),
});
assert.doesNotMatch(JSON.stringify(preparationModel), /Privada 123|\+569|example\.test|Portón/);
assert.match(preparationModel.items[1].quantityLabel, /cajas/);

const dispatchModel = buildDispatchLabelModel(assignedDelivery);
assert.equal(dispatchModel.address, "Calle Privada 123");
assert.doesNotMatch(JSON.stringify(dispatchModel), /example\.test|WEBPAY|11111111/);

const preparationPdf = await renderPreparationLabelPdf(preparationModel);
const dispatchPdf = await renderDispatchLabelPdf(dispatchModel);
assert.equal(preparationPdf.subarray(0, 5).toString(), "%PDF-");
assert.equal(dispatchPdf.subarray(0, 5).toString(), "%PDF-");
assert.ok((preparationPdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length >= 2);

if (process.env.BLOCK4B_PDF_OUTPUT_DIR) {
  await mkdir(process.env.BLOCK4B_PDF_OUTPUT_DIR, { recursive: true });
  await writeFile(join(process.env.BLOCK4B_PDF_OUTPUT_DIR, "etiqueta-preparacion.pdf"), preparationPdf);
  await writeFile(join(process.env.BLOCK4B_PDF_OUTPUT_DIR, "etiqueta-despacho.pdf"), dispatchPdf);
}
console.log("PASS etiquetas PDF separadas, multipágina y sin datos ajenos a su finalidad");
