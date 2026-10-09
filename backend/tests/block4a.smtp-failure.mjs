import assert from "node:assert/strict";

process.env.MAIL_ENABLED = "true";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "1";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "smtp-test-user";
process.env.SMTP_PASS = "smtp-test-secret";
process.env.MAIL_FROM = "Ferretería FYF <no-reply@example.test>";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";

const capturedErrors = [];
const originalError = console.error;
console.error = (...values) => capturedErrors.push(values.map(String).join(" "));
try {
  const { notifyClientOrderBestEffort } = await import("../dist/modules/notifications/notifications.service.js");
  await notifyClientOrderBestEffort({
    email: "buyer@example.test",
    folio: "P-000123",
    event: "PURCHASE_CONFIRMED",
    recipientType: "CLIENT",
    commercialModel: {
      orderId: 123,
      folio: "P-000123",
      status: "PAID",
      purchaseDate: new Date("2026-09-03T15:30:00.000Z"),
      buyer: { type: "CLIENT", name: "Cliente prueba", email: "buyer@example.test" },
      items: [{ productId: 1, productName: "Martillo", unitMeasure: "unidad", quantity: 1, unitPrice: "1000.00", subtotal: "1000.00" }],
      total: "1000.00",
      delivery: { type: "PICKUP", label: "Retiro en tienda", recipientName: null, phone: null, address: null, commune: null, reference: null },
    },
  });
} finally {
  console.error = originalError;
}

assert.ok(capturedErrors.some((entry) => entry.includes("No se pudo enviar el correo")));
assert.ok(capturedErrors.every((entry) => !entry.includes("smtp-test-secret")));
console.log("PASS fallo SMTP se absorbe y no registra la contraseña");
