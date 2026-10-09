import type { Request, Response } from "express";
import {
  GUEST_ORDER_ACCESS_DAYS,
  IS_PRODUCTION,
} from "../../config/configEnv.js";
import { createGuestDeviceId, isValidGuestSecret } from "./guestOrderAccess.js";

const GUEST_DEVICE_COOKIE = "fyf_guest_device";
const GUEST_DEVICE_COOKIE_PATH = "/api/online-orders/guest";

function readCookie(req: Request, name: string) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function ensureGuestDeviceCookie(req: Request, res: Response) {
  const current = readCookie(req, GUEST_DEVICE_COOKIE);
  if (isValidGuestSecret(current)) return current;

  const created = createGuestDeviceId();
  res.cookie(GUEST_DEVICE_COOKIE, created, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: GUEST_DEVICE_COOKIE_PATH,
    maxAge: GUEST_ORDER_ACCESS_DAYS * 24 * 60 * 60_000,
  });
  return created;
}
