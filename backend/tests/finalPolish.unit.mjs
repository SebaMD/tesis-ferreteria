import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.FRONTEND_URL = "https://fyf.example.test/base";

const {
  createPasswordResetSecret,
  hashPasswordResetSecret,
} = await import("../dist/modules/auth/passwordReset.service.js");
const {
  validatePasswordResetConfirmBody,
  validatePasswordResetRequestBody,
} = await import("../dist/modules/auth/auth.validation.js");
const { buildPasswordResetMail } = await import("../dist/modules/notifications/passwordResetMail.js");
const { buildClientOrderMailContent } = await import("../dist/modules/notifications/notifications.service.js");

const token = createPasswordResetSecret();
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
const hash = hashPasswordResetSecret(token);
assert.match(hash, /^[a-f0-9]{64}$/);
assert.notEqual(hash, token);
assert.notEqual(hash, hashPasswordResetSecret(randomBytes(32).toString("base64url")));

assert.deepEqual(validatePasswordResetRequestBody({ email: " USER@Example.COM " }), {
  success: true,
  value: { email: "user@example.com" },
});
assert.equal(validatePasswordResetRequestBody({ email: "invalid" }).success, false);
assert.equal(validatePasswordResetRequestBody({ email: "user@example.com", userId: 2 }).success, false);
assert.equal(validatePasswordResetConfirmBody({ token, password: "Nueva-Clave-2026!" }).success, true);
for (const invalid of ["short", "without-special-2026", "SIN-NUMERO!", "lowercase-2026!"]) {
  assert.equal(validatePasswordResetConfirmBody({ token, password: invalid }).success, false);
}
assert.equal(validatePasswordResetConfirmBody({ token: `${token}extra`, password: "Nueva-Clave-2026!" }).success, false);

const resetMail = buildPasswordResetMail(token, 30);
assert.match(resetMail.subject, /Restablece tu contraseña/);
assert.match(resetMail.text, new RegExp(token));
assert.match(resetMail.html, new RegExp(token));
assert.doesNotMatch(resetMail.html, /<script/i);

const model = {
  orderId: 7,
  folio: "P-000007",
  status: "OUT_FOR_DELIVERY",
  purchaseDate: new Date("2026-09-10T12:00:00Z"),
  buyer: { type: "CLIENT", name: "Ana <script>alert(1)</script>", email: "ana@example.test" },
  items: [
    { productId: 1, productName: "Martillo & acero", unitMeasure: "unidad", quantity: 2, unitPrice: "5990", subtotal: "11980" },
    { productId: 2, productName: "Clavos", unitMeasure: "caja", quantity: 1, unitPrice: "2990", subtotal: "2990" },
  ],
  total: "14970",
  delivery: { type: "DELIVERY", label: "Despacho a domicilio", recipientName: "Ana", phone: null, address: null, commune: null, reference: null },
};
const statusMail = buildClientOrderMailContent(
  model.folio,
  "OUT_FOR_DELIVERY",
  "https://fyf.example.test/orders#order-7",
  "CLIENT",
  model,
);
assert.match(statusMail.subject, /En reparto.*P-000007/);
assert.match(statusMail.text, /Despacho a domicilio/);
assert.match(statusMail.text, /Martillo & acero/);
assert.match(statusMail.html, /Martillo &amp; acero/);
assert.doesNotMatch(statusMail.html, /<script>alert/);
assert.doesNotMatch(statusMail.html, /\bETA\b|llega antes|ubicación en vivo/i);
assert.match(statusMail.html, /Ver mis compras/);

const logisticsSource = await readFile(new URL("../src/modules/orderLogistics/orderLogistics.service.ts", import.meta.url), "utf8");
assert.doesNotMatch(logisticsSource, /nextStatus === "READY_FOR_DELIVERY"\) return "READY_FOR_DELIVERY"/);
assert.doesNotMatch(logisticsSource, /event:\s*"READY_FOR_DELIVERY"/);

console.log("PASS password reset token format, hashing and strict request/confirm validation");
console.log("PASS password reset email and logistics status HTML/text rendering are escaped and useful");
