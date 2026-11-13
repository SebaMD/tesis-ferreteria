const OPERATIONAL_STATUSES = new Set([
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
]);

const PAYMENT_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_REVIEW"]);
const INCOMPLETE_STATUSES = new Set(["PAYMENT_FAILED", "CANCELLED", "EXPIRED"]);

export function isIncompleteOrder(order) {
  return INCOMPLETE_STATUSES.has(order?.status) && (!order.payment || ["FAILED", "CANCELLED", "EXPIRED"].includes(order.payment.status));
}

export function groupBuyerOrders(orders) {
  const recent = [...orders].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || (a.createdAt || b.createdAt ? b.id - a.id : 0));
  return {
    payments: recent.filter((order) => (PAYMENT_STATUSES.has(order.status) || INCOMPLETE_STATUSES.has(order.status) && ["CREATED", "PROCESSING"].includes(order.payment?.status)) && !(order.status === "PAYMENT_REVIEW" && order.payment?.status === "AUTHORIZED")),
    review: recent.filter((order) => order.status === "PAYMENT_REVIEW" && order.payment?.status === "AUTHORIZED"),
    active: recent.filter((order) => OPERATIONAL_STATUSES.has(order.status)),
    delivered: recent.filter((order) => order.status === "DELIVERED"),
    incomplete: recent.filter(isIncompleteOrder),
  };
}
