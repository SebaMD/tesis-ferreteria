import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateCartQuantity } from "../src/helpers/cartQuantity.js";
import { buildDeliveryDestination, buildDeliveryRouteUrl, normalizeDeliveryCoordinates } from "../src/helpers/delivery.js";

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

test("delivery routes preserve historical coordinates and use the textual destination otherwise", () => {
  const historical = {
    latitude: -37.17,
    longitude: -72.94,
    address: "Dirección histórica",
    commune: "Santa Juana",
  };
  assert.equal(buildDeliveryDestination(historical), "-37.17,-72.94");
  assert.equal(new URL(buildDeliveryRouteUrl(historical)).searchParams.get("destination"), "-37.17,-72.94");

  const textualRoute = buildDeliveryRouteUrl({
    latitude: null,
    longitude: null,
    address: "Avenida Ñuble 123",
    commune: "Santa Juana",
  });
  assert.equal(new URL(textualRoute).searchParams.get("destination"), "Avenida Ñuble 123, Santa Juana");
  assert.match(textualRoute, /Avenida\+%C3%91uble\+123%2C\+Santa\+Juana/);

  for (const empty of [null, undefined, "", "  "]) {
    assert.equal(normalizeDeliveryCoordinates(empty, empty), null);
    const destination = { latitude: empty, longitude: empty, address: "Dirección de prueba", commune: "Santa Juana" };
    assert.equal(buildDeliveryDestination(destination), "Dirección de prueba, Santa Juana");
    assert.equal(new URL(buildDeliveryRouteUrl(destination)).searchParams.get("destination"), "Dirección de prueba, Santa Juana");
  }
});

test("buyer delivery forms use textual addresses and always clear stale coordinates", async () => {
  const [checkout, account, deliveryHelper] = await Promise.all([
    readFile(new URL("../src/pages/CheckoutPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ClientAccountPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/helpers/delivery.js", import.meta.url), "utf8"),
  ]);

  for (const source of [checkout, account]) {
    assert.doesNotMatch(source, /DeliveryLocationPicker|Usar mi ubicación|navigator\.geolocation/);
  }
  assert.doesNotMatch(checkout, /savedAddress\.latitude|savedAddress\.longitude/);
  assert.match(checkout, /deliveryLatitude: null/);
  assert.match(checkout, /deliveryLongitude: null/);
  assert.match(account, /latitude: null/);
  assert.match(account, /longitude: null/);
  assert.doesNotMatch(deliveryHelper, /requestCurrentLocation|navigator\.geolocation|isSecureContext/);
});
