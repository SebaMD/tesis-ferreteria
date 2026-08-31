import { createHash, randomBytes } from "crypto";
import { FRONTEND_URL, GUEST_ORDER_ACCESS_DAYS } from "../../config/configEnv.js";

const GUEST_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isValidGuestSecret(value: unknown): value is string {
  return typeof value === "string" && GUEST_SECRET_PATTERN.test(value);
}

export function hashGuestSessionId(value: string) {
  if (!isValidGuestSecret(value)) throw new Error("La sesion de invitado no es valida");
  return hashSecret(value);
}

export function hashGuestOrderAccessToken(value: string) {
  if (!isValidGuestSecret(value)) throw new Error("El acceso al pedido no es valido");
  return hashSecret(value);
}

export function createGuestOrderAccessToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + GUEST_ORDER_ACCESS_DAYS * 24 * 60 * 60_000),
  };
}

export function guestOrderTrackingUrl(token: string, status?: string) {
  const url = new URL("/order-tracking", FRONTEND_URL);
  if (status) url.searchParams.set("status", status);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
