import { isIncompleteOrder } from "./buyerOrderGroups.js";

const STORAGE_KEY = "fyf_hidden_guest_order_ids";
const FINAL_PAYMENT_STATUSES = new Set(["FAILED", "CANCELLED", "EXPIRED"]);

export function canHideGuestOrder(order) {
  return isIncompleteOrder(order) && (!order.payment || FINAL_PAYMENT_STATUSES.has(order.payment.status));
}

// A tab-local display preference, never a token or a server-side archive operation.
// Only apply these IDs to orders returned by the device-authorized API.
export function readHiddenGuestOrderIds(storage) {
  try {
    const ids = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter(id => Number.isSafeInteger(id) && id > 0) : []);
  } catch {
    return new Set();
  }
}

export function writeHiddenGuestOrderIds(storage, ids) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}
