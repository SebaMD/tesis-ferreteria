import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [controller, service, routes] = await Promise.all([
  read("src/modules/onlineOrders/onlineOrders.controller.ts"),
  read("src/modules/onlineOrders/onlineOrders.service.ts"),
  read("src/modules/onlineOrders/onlineOrders.routes.ts"),
]);

assert.match(controller, /tbkToken \|\| \(!tokenWs && buyOrder && sessionId\)/);
assert.match(controller, /req\.method === "GET" \? "expired" : tokenWs \? "failed" : "cancelled"/);
assert.match(service, /data\.outcome === "expired"[\s\S]*\? "EXPIRED"[\s\S]*data\.outcome === "failed" \? "FAILED" : "CANCELLED"/);
assert.match(service, /data\.outcome === "expired"[\s\S]*\? "EXPIRED"[\s\S]*data\.outcome === "failed" \? "PAYMENT_FAILED" : "CANCELLED"/);
assert.match(service, /retryOnlineOrderPaymentService[\s\S]*preparePaymentAttempt/);
assert.match(service, /retryGuestOrderPayment[\s\S]*preparePaymentAttempt/);
assert.match(service, /retryGuestOnlineOrderPaymentService[\s\S]*retryGuestOrderPayment/);
assert.match(service, /retryGuestDeviceOnlineOrderPaymentService[\s\S]*guestDeviceHash[\s\S]*retryGuestOrderPayment/);
assert.match(routes, /guest\/device-orders\/:id\/retry-payment/);
assert.match(service, /if \(payment\.status === "AUTHORIZED" \|\| hasSettledPayment\(order\.status\)\)/);
assert.match(service, /if \(result\.becamePaid\)[\s\S]*notifyClientOrderBestEffort/);

console.log("PASS retorno Webpay distingue cancelación, timeout y fallo; reintentos preparan una transacción nueva");
