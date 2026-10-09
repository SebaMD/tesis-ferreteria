import { readDirectPurchaseItem } from "./directPurchase.js";

const CHECKOUT_INTENT_MAX_AGE_MS = 60 * 60_000;

export function readCheckoutIntent(state, now = Date.now()) {
  const intent = state?.checkoutIntent;
  if (
    !["DIRECT", "GUEST_CART"].includes(intent?.source)
    || !Number.isFinite(intent?.createdAt)
    || intent.createdAt > now
    || now - intent.createdAt > CHECKOUT_INTENT_MAX_AGE_MS
    || !Array.isArray(intent.items)
    || intent.items.length === 0
    || intent.items.length > 100
    || (intent.source === "DIRECT" && intent.items.length !== 1)
  ) return null;

  const items = intent.items.map((item) => ({ productId: item?.productId, quantity: item?.quantity }));
  if (items.some((item) => (
    !Number.isInteger(item.productId) || item.productId < 1
    || !Number.isInteger(item.quantity) || item.quantity < 1
  )) || new Set(items.map((item) => item.productId)).size !== items.length) return null;

  return { source: intent.source, createdAt: intent.createdAt, items };
}

export function createCheckoutIntent(source, selection, now = Date.now()) {
  return readCheckoutIntent({ checkoutIntent: {
    source,
    createdAt: now,
    items: (Array.isArray(selection) ? selection : []).map((item) => ({
      productId: Number(item?.product?.id),
      quantity: Number(item?.quantity),
    })),
  } }, now);
}

export function checkoutContinuationState(state) {
  if (!state?.checkoutIntent) return undefined;
  return { checkoutIntent: readCheckoutIntent(state) || { expired: true } };
}

export function shouldMergeGuestCartOnAuthentication(state) {
  return !state?.checkoutIntent;
}

export function resolveCheckoutItems(state, cartItems, now = Date.now()) {
  if (state?.checkoutIntent) {
    // An expired/invalid selection must never silently fall back to another cart.
    const intent = readCheckoutIntent(state, now);
    return intent?.items.map(({ productId, quantity }) => ({
      product: { id: productId },
      quantity,
    })) || [];
  }
  const directPurchase = readDirectPurchaseItem(state);
  return directPurchase ? [directPurchase] : cartItems;
}
