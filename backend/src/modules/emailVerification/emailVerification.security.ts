import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { EMAIL_VERIFICATION_SECRET } from "../../config/configEnv.js";
import type { EmailVerificationPurpose } from "../../db/schema/index.js";

function secret() {
  if (!EMAIL_VERIFICATION_SECRET || EMAIL_VERIFICATION_SECRET.length < 32) {
    throw new Error("EMAIL_VERIFICATION_SECRET no esta configurado o es demasiado corto");
  }
  return EMAIL_VERIFICATION_SECRET;
}

export function createVerificationPin() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashVerificationPin(input: {
  challengeId: number;
  email: string;
  purpose: EmailVerificationPurpose;
  pin: string;
}) {
  const context = `${input.challengeId}:${input.email}:${input.purpose}:${input.pin}`;
  return createHmac("sha256", secret()).update(context, "utf8").digest("hex");
}

export function verificationPinMatches(expectedHash: string, actualHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !/^[a-f0-9]{64}$/.test(actualHash)) return false;
  return timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}
