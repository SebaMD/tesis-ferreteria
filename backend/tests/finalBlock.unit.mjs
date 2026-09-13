import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";

const { validateCustomerNotice } = await import("../dist/modules/customerNotice/customerNotice.validation.js");
const { hashVerificationPin, verificationPinMatches } = await import("../dist/modules/emailVerification/emailVerification.security.js");

assert.deepEqual(validateCustomerNotice({ title: " Horario   especial ", message: "Hoy cerramos a las 17:00.\nGracias.", active: true }), {
  success: true,
  value: { title: "Horario especial", message: "Hoy cerramos a las 17:00.\nGracias.", active: true },
});
assert.equal(validateCustomerNotice({ title: "", message: "", active: true }).success, false);
assert.equal(validateCustomerNotice({ title: "Aviso", message: "Texto", active: false, userId: 7 }).success, false);

const base = { challengeId: 9, email: "worker@example.test", pin: "004219" };
const internalHash = hashVerificationPin({ ...base, purpose: "INTERNAL_USER_REGISTRATION" });
assert.match(internalHash, /^[a-f0-9]{64}$/);
assert.equal(verificationPinMatches(internalHash, hashVerificationPin({ ...base, purpose: "INTERNAL_USER_REGISTRATION" })), true);
assert.equal(verificationPinMatches(internalHash, hashVerificationPin({ ...base, purpose: "CLIENT_REGISTRATION" })), false);

console.log("PASS customer notice validation, field allowlist and active content contract");
console.log("PASS internal worker PIN remains purpose-bound and HMAC protected");
