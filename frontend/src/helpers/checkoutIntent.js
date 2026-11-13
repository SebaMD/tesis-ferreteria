import { readDirectPurchaseItem } from "./directPurchase.js";
import { createId } from "./createId.js";

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
    || (intent.checkoutKey !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent.checkoutKey))
  ) return null;

  const items = intent.items.map((item) => ({ productId: item?.productId, quantity: item?.quantity }));
  if (items.some((item) => (
    !Number.isInteger(item.productId) || item.productId < 1
    || !Number.isInteger(item.quantity) || item.quantity < 1
  )) || new Set(items.map((item) => item.productId)).size !== items.length) return null;

  return { source: intent.source, createdAt: intent.createdAt, items, ...(intent.checkoutKey ? { checkoutKey: intent.checkoutKey } : {}) };
}

export function createCheckoutIntent(source, selection, now = Date.now()) {
  return readCheckoutIntent({ checkoutIntent: {
    source,
    createdAt: now,
    checkoutKey: createId(),
    items: (Array.isArray(selection) ? selection : []).map((item) => ({
      productId: Number(item?.product?.id),
      quantity: Number(item?.quantity),
    })),
  } }, now);
}

export function checkoutContinuationState(state) {
  if (!state?.checkoutIntent) return undefined;
  return { checkoutIntent: readCheckoutIntent(state) || { expired: true, source: state.checkoutIntent?.source === "DIRECT" ? "DIRECT" : undefined }, checkoutReturn: checkoutReturn(state) };
}

export function checkoutReturn(state) {
  const intent = readCheckoutIntent(state);
  const direct = state?.checkoutIntent?.source === "DIRECT" || readDirectPurchaseItem(state);
  const origin = state?.checkoutReturn;
  if (direct && /^\/catalog\/(products|families)\/[1-9]\d*$/.test(origin?.to?.pathname || "")) {
    return { to: { pathname: origin.to.pathname, search: typeof origin.to.search === "string" && origin.to.search.startsWith("?") ? origin.to.search : "" }, state: origin.state, label: "Volver al producto" };
  }
  if (direct) {
    const id = intent?.items[0]?.productId || direct.product?.id;
    return id ? { to: `/catalog/products/${id}`, label: "Volver al producto" } : { to: "/catalog", label: "Volver al catálogo" };
  }
  return { to: "/cart", label: "Volver al carrito" };
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
