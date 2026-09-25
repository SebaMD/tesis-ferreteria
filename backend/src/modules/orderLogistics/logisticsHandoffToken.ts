import { createHmac, timingSafeEqual } from "node:crypto";
import { LOGISTICS_QR_SECRET } from "../../config/configEnv.js";
import type { LogisticsOrigin } from "./orderLogistics.repository.js";

const TOKEN_PURPOSE = "LOGISTICS_HANDOFF" as const;
const TOKEN_VERSION = 1 as const;
const MAX_TOKEN_LENGTH = 2_048;

export type LogisticsHandoffPayload = {
  v: typeof TOKEN_VERSION;
  p: typeof TOKEN_PURPOSE;
  o: LogisticsOrigin;
  i: number;
};

function signingSecret() {
  if (!LOGISTICS_QR_SECRET || LOGISTICS_QR_SECRET.length < 32) {
    throw new Error("LOGISTICS_QR_SECRET no esta configurado o es demasiado corto");
  }
  return LOGISTICS_QR_SECRET;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}

export function createLogisticsHandoffToken(origin: LogisticsOrigin, taskId: number) {
  const payload: LogisticsHandoffPayload = {
    v: TOKEN_VERSION,
    p: TOKEN_PURPOSE,
    o: origin,
    i: taskId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyLogisticsHandoffToken(token: unknown): LogisticsHandoffPayload | null {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expectedSignature = Buffer.from(sign(parts[0]), "utf8");
  const receivedSignature = Buffer.from(parts[1], "utf8");
  if (
    expectedSignature.length !== receivedSignature.length
    || !timingSafeEqual(expectedSignature, receivedSignature)
  ) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<LogisticsHandoffPayload>;
    if (
      payload.v !== TOKEN_VERSION
      || payload.p !== TOKEN_PURPOSE
      || (payload.o !== "ONLINE" && payload.o !== "POS")
      || !Number.isInteger(payload.i)
      || Number(payload.i) <= 0
    ) return null;
    return payload as LogisticsHandoffPayload;
  } catch {
    return null;
  }
}
