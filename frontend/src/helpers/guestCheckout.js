const GUEST_SESSION_KEY = "fyf_guest_checkout_session";
const GUEST_ACCESS_TOKEN_KEY = "fyf_guest_order_access_token";
const GUEST_ORDER_TOKEN_PREFIX = "fyf_guest_order_token_";

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function getOrCreateGuestSessionId() {
  const current = localStorage.getItem(GUEST_SESSION_KEY);
  if (/^[A-Za-z0-9_-]{43}$/.test(current || "")) return current;
  const created = randomSecret();
  localStorage.setItem(GUEST_SESSION_KEY, created);
  return created;
}

export function saveGuestOrderAccessToken(orderId, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return;
  sessionStorage.setItem(GUEST_ACCESS_TOKEN_KEY, token);
  if (Number.isInteger(Number(orderId)) && Number(orderId) > 0) {
    sessionStorage.setItem(`${GUEST_ORDER_TOKEN_PREFIX}${Number(orderId)}`, token);
  }
}

export function readGuestOrderAccessToken(orderId) {
  if (Number.isInteger(Number(orderId)) && Number(orderId) > 0) {
    return sessionStorage.getItem(`${GUEST_ORDER_TOKEN_PREFIX}${Number(orderId)}`);
  }
  return sessionStorage.getItem(GUEST_ACCESS_TOKEN_KEY);
}

export function captureGuestAccessTokenFromHash() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(hash).get("token");
  if (/^[A-Za-z0-9_-]{43}$/.test(token || "")) {
    sessionStorage.setItem(GUEST_ACCESS_TOKEN_KEY, token);
  }
  if (window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return token || sessionStorage.getItem(GUEST_ACCESS_TOKEN_KEY);
}
