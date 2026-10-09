const OPERATIONAL_STATUSES = new Set([
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
]);

const PAYMENT_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_REVIEW"]);
const INCOMPLETE_STATUSES = new Set(["PAYMENT_FAILED", "CANCELLED", "EXPIRED"]);

export function groupBuyerOrders(orders) {
  return {
    payments: orders.filter((order) => PAYMENT_STATUSES.has(order.status)),
    active: orders.filter((order) => OPERATIONAL_STATUSES.has(order.status)),
    delivered: orders.filter((order) => order.status === "DELIVERED"),
    incomplete: orders.filter((order) => INCOMPLETE_STATUSES.has(order.status)),
  };
}
