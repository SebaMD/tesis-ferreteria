import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";

const {
  createVerificationPin,
  hashVerificationPin,
  verificationPinMatches,
} = await import("../dist/modules/emailVerification/emailVerification.security.js");
const {
  validateEmailRequestBody,
  validatePinBody,
} = await import("../dist/modules/emailVerification/emailVerification.validation.js");
const { buildEmailVerificationMail } = await import("../dist/modules/notifications/emailVerificationMail.js");

let sawLeadingZero = false;
for (let index = 0; index < 10_000; index += 1) {
  const pin = createVerificationPin();
  assert.match(pin, /^\d{6}$/);
  if (pin.startsWith("0")) sawLeadingZero = true;
}
assert.equal(sawLeadingZero, true);

const input = {
  challengeId: 42,
  email: "cliente@example.test",
  purpose: "CLIENT_REGISTRATION",
  pin: "042718",
};
const hash = hashVerificationPin(input);
assert.match(hash, /^[a-f0-9]{64}$/);
assert.notEqual(hash, input.pin);
assert.equal(verificationPinMatches(hash, hashVerificationPin(input)), true);
assert.equal(verificationPinMatches(hash, hashVerificationPin({ ...input, challengeId: 43 })), false);
assert.equal(verificationPinMatches(hash, hashVerificationPin({ ...input, email: "otro@example.test" })), false);
assert.equal(verificationPinMatches(hash, hashVerificationPin({ ...input, purpose: "CLIENT_EMAIL_CHANGE" })), false);
assert.equal(verificationPinMatches(hash, hashVerificationPin({ ...input, pin: "142718" })), false);

assert.deepEqual(validateEmailRequestBody({ email: "  USER@Example.COM " }), {
  success: true,
  value: { email: "user@example.com" },
});
assert.equal(validateEmailRequestBody({ email: "invalido" }).success, false);
assert.deepEqual(validatePinBody({ challengeId: 7, pin: "000042" }), {
  success: true,
  value: { challengeId: 7, pin: "000042" },
});
for (const pin of ["42", "1234567", "12.345", 123456, "abcdef"]) {
  assert.equal(validatePinBody({ challengeId: 7, pin }).success, false);
}

const mail = buildEmailVerificationMail("042718", 10);
assert.match(mail.subject, /verifica/i);
assert.match(mail.text, /042718/);
assert.match(mail.text, /10 minutos/);
assert.match(mail.html, /042718/);
assert.doesNotMatch(mail.html, /<script/i);

console.log("PASS PIN cryptographic format/leading zeros, contextual HMAC, timing-safe comparison contract");
console.log("PASS normalized email, strict six-digit validation, accessible plain/HTML verification mail content");
