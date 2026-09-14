import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";

const { validateCustomerNotice } = await import("../dist/modules/customerNotice/customerNotice.validation.js");
const { hashVerificationPin, verificationPinMatches } = await import("../dist/modules/emailVerification/emailVerification.security.js");
const { validateLoginBody } = await import("../dist/modules/auth/auth.validation.js");
const { validateClientProfileBody } = await import("../dist/modules/users/users.validation.js");
const { validateClientDeliveryAddressBody } = await import("../dist/modules/onlineOrders/onlineOrders.validation.js");
const { isValidRut, normalizeRut } = await import("../dist/utils/rut.js");

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

for (const variant of ["10.120.345-k", "10120345k", "10120345-K", "10 120 345 K"]) {
  assert.equal(normalizeRut(variant), "10120345-K");
  assert.equal(isValidRut(variant), true);
}
assert.equal(isValidRut("10120345-1"), false);
assert.deepEqual(validateLoginBody({ identifier: " 10.120.345-k ", password: "secret" }), {
  success: true,
  value: { identifier: "10120345-K", password: "secret" },
});
assert.equal(validateClientProfileBody({ phone: "9 1234 5678" }).success, true);
assert.equal(validateClientProfileBody({ phone: "123", clientId: 7 }).success, false);
assert.equal(validateClientDeliveryAddressBody({
  recipientName: "Persona Prueba",
  phone: "+56912345678",
  address: "Avenida Prueba 123",
  commune: "Santa Juana",
  reference: null,
  latitude: null,
  longitude: null,
}).success, true);
assert.equal(validateClientDeliveryAddressBody({
  recipientName: "Persona Prueba",
  phone: "+56912345678",
  address: "Avenida Prueba 123",
  commune: "Santa Juana",
  reference: null,
  latitude: null,
  longitude: null,
  clientId: 9,
}).success, false);

console.log("PASS customer notice validation, field allowlist and active content contract");
console.log("PASS internal worker PIN remains purpose-bound and HMAC protected");
console.log("PASS canonical Chilean RUT, client profile and shared address validation contracts");
