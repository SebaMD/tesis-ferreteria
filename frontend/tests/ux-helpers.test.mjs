import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCartQuantity } from "../src/helpers/cartQuantity.js";
import { buildDeliveryDestination, buildDeliveryRouteUrl, normalizeDeliveryCoordinates, requestCurrentLocation } from "../src/helpers/delivery.js";

test("cart: accepts integers and rejects invalid drafts without coercing them to zero", () => {
  assert.deepEqual(validateCartQuantity("2", 5), { valid: true, quantity: 2 });
  assert.equal(validateCartQuantity(1, 5).valid, true);
  for (const input of [-1, 0, "", " ", ".", NaN, "NaN", "1.5", "1,5", "2.0", Infinity, null, undefined, true, "1e2", 6]) {
    const result = validateCartQuantity(input, 5);
    assert.equal(result.valid, false, String(input));
    assert.ok(result.message);
    assert.equal(result.quantity, undefined);
  }
  assert.equal(validateCartQuantity(1, 0).valid, false);
  assert.equal(validateCartQuantity(1, NaN).valid, false);
});

test("location: insecure context, absent API, denied, unavailable, timeout and invalid coordinates", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let calls = 0;
  const configure = (secure, geolocation) => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: secure } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation } });
  };
  try {
    configure(false, { getCurrentPosition() { calls += 1; } });
    await assert.rejects(requestCurrentLocation(), /HTTPS.*dirección manualmente/);
    assert.equal(calls, 0);
    configure(true, undefined);
    await assert.rejects(requestCurrentLocation(), /no está disponible en este navegador/);
    for (const [code, message] of [[1, /permiso.*denegado/], [2, /ubicación no está disponible/], [3, /tiempo de espera/], [99, /error al obtener/]]) {
      configure(true, { getCurrentPosition(_success, failure) { failure({ code }); } });
      await assert.rejects(requestCurrentLocation(), message);
    }
    for (const coords of [{ latitude: null, longitude: null }, { latitude: 100, longitude: 10 }, { latitude: NaN, longitude: 10 }, undefined]) {
      configure(true, { getCurrentPosition(success) { success({ coords }); } });
      await assert.rejects(requestCurrentLocation(), /coordenadas válidas/);
    }
    configure(true, { getCurrentPosition(success) { success({ coords: { latitude: -37.17, longitude: -72.94, accuracy: 10 } }); } });
    assert.deepEqual(await requestCurrentLocation(), { latitude: -37.17, longitude: -72.94, accuracy: 10 });
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test("delivery: null is not 0,0 and route keeps textual fallback", () => {
  for (const empty of [null, undefined, "", "  "]) {
    assert.equal(normalizeDeliveryCoordinates(empty, empty), null);
    const destination = { latitude: empty, longitude: empty, address: "Dirección de prueba", commune: "Santa Juana" };
    assert.equal(buildDeliveryDestination(destination), "Dirección de prueba, Santa Juana");
    assert.equal(new URL(buildDeliveryRouteUrl(destination)).searchParams.get("destination"), "Dirección de prueba, Santa Juana");
  }
});
