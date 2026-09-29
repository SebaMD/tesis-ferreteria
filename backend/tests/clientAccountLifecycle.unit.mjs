import assert from "node:assert/strict";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";

const {
  validateClientReactivationConfirmBody,
  validateClientReactivationRequestBody,
} = await import("../dist/modules/auth/auth.validation.js");
const { validateClientDeactivationBody } = await import("../dist/modules/users/users.validation.js");

assert.deepEqual(validateClientDeactivationBody({ password: "Actual-2026!" }), {
  success: true,
  value: { password: "Actual-2026!" },
});
assert.equal(validateClientDeactivationBody({ password: "", userId: 7 }).success, false);

assert.deepEqual(
  validateClientReactivationRequestBody({ identifier: "10.120.345-k", password: "Actual-2026!" }),
  {
    success: true,
    value: { identifier: "10120345-K", password: "Actual-2026!" },
  },
);
assert.deepEqual(
  validateClientReactivationConfirmBody({
    identifier: "CLIENTE@EXAMPLE.TEST",
    password: "Actual-2026!",
    challengeId: "8",
    pin: "004219",
  }),
  {
    success: true,
    value: {
      identifier: "cliente@example.test",
      password: "Actual-2026!",
      challengeId: 8,
      pin: "004219",
    },
  },
);
assert.equal(validateClientReactivationConfirmBody({
  identifier: "cliente@example.test",
  password: "Actual-2026!",
  challengeId: 8,
  pin: "12345",
}).success, false);
assert.equal(validateClientReactivationConfirmBody({
  identifier: "cliente@example.test",
  password: "Actual-2026!",
  challengeId: 8,
  pin: "123456",
  status: "ACTIVE",
}).success, false);

console.log("PASS client deactivation and reactivation request contracts");
