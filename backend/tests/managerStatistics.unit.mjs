import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:55442/postgres";

const { buildManagerStatistics } = await import("../dist/modules/reports/managerStatistics.service.js");
const { validateManagerStatisticsQuery } = await import("../dist/modules/reports/reports.validation.js");

const filters = {
  from: new Date(2026, 8, 1),
  toExclusive: new Date(2026, 8, 4),
  fromLabel: "2026-09-01",
  toLabel: "2026-09-03",
};

const pointOfSaleRows = [
  { saleId: 1, date: new Date(2026, 8, 1, 10), paymentMethod: "efectivo", saleTotal: "10000", saleStatus: "ACTIVE", productId: 1, productName: "Martillo", quantity: 2, returnedQuantity: 0, unitPrice: "5000" },
  { saleId: 2, date: new Date(2026, 8, 2, 10), paymentMethod: "debito", saleTotal: "20000", saleStatus: "PARTIALLY_RETURNED", productId: 1, productName: "Martillo", quantity: 2, returnedQuantity: 1, unitPrice: "5000" },
  { saleId: 2, date: new Date(2026, 8, 2, 10), paymentMethod: "debito", saleTotal: "20000", saleStatus: "PARTIALLY_RETURNED", productId: 2, productName: "Taladro", quantity: 1, returnedQuantity: 0, unitPrice: "10000" },
  { saleId: 3, date: new Date(2026, 8, 3, 10), paymentMethod: "credito", saleTotal: "8000", saleStatus: "CANCELLED", productId: 3, productName: "Broca", quantity: 2, returnedQuantity: 2, unitPrice: "4000" },
];

const onlineRows = [
  { orderId: 10, commercialDate: new Date(2026, 8, 2, 15), orderTotal: "15000", orderStatus: "PAID", productId: 1, productName: "Martillo", quantity: 3, unitPrice: "5000", subtotal: "15000" },
  { orderId: 11, commercialDate: new Date(2026, 8, 3, 15), orderTotal: "7000", orderStatus: "DELIVERED", productId: 2, productName: "Taladro", quantity: 1, unitPrice: "7000", subtotal: "7000" },
];

const statistics = buildManagerStatistics({
  pointOfSaleRows,
  onlineRows,
  lowStockProducts: [
    { id: 1, name: "Martillo", currentStock: 2, minimumStock: 5, unitMeasure: "unidad" },
  ],
}, filters);

assert.deepEqual(statistics.kpis, {
  netSales: 47000,
  originalSales: 60000,
  returnedAmount: 13000,
  returnPercentage: 21.67,
  transactions: 5,
  averageTicket: 9400,
  unitsSold: 8,
  productsSold: 2,
});
assert.deepEqual(statistics.channels.map(({ channel, amount, transactions }) => ({ channel, amount, transactions })), [
  { channel: "IN_STORE", amount: 25000, transactions: 3 },
  { channel: "ONLINE", amount: 22000, transactions: 2 },
]);
assert.equal(statistics.evolution.length, 3);
assert.equal(statistics.evolution[1].netSales, 30000);
assert.equal(statistics.evolution[2].returnedAmount, 8000);
assert.deepEqual(statistics.topProducts.map(({ productName, units }) => ({ productName, units })), [
  { productName: "Martillo", units: 6 },
  { productName: "Taladro", units: 2 },
]);
assert.equal(statistics.lowStock.products[0].deficit, 3);

assert.equal(validateManagerStatisticsQuery(
  { from: "2026-09-01", to: "2026-09-03" },
  new Date(2026, 8, 24),
).success, true);
assert.equal(validateManagerStatisticsQuery(
  { from: "2026-09-04", to: "2026-09-03" },
  new Date(2026, 8, 24),
).success, false);
assert.equal(validateManagerStatisticsQuery(
  { from: "2026-09-01", to: "2026-09-25" },
  new Date(2026, 8, 24),
).success, false);
assert.equal(validateManagerStatisticsQuery(
  { from: "2025-01-01", to: "2026-09-03" },
  new Date(2026, 8, 24),
).success, false);

console.log("PASS estadísticas MANAGER: períodos, ventas netas, devoluciones, canales, ticket, productos y stock");
