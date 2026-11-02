import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { savedCheckoutAddressIsUsable, savedCheckoutDestination } from "../src/helpers/checkoutDestination.js";
import { createCheckoutDraftStore } from "../src/helpers/checkoutDraft.js";

const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const address = { recipientName: "Persona", phone: "+56912345678", address: "Calle 123", commune: "Santa Juana", reference: "Portón" };

test("only a complete covered saved address can replace the editable form", () => {
  assert.equal(savedCheckoutAddressIsUsable(address), true);
  assert.equal(savedCheckoutAddressIsUsable({ ...address, commune: " santa   juana " }), true);
  for (const invalid of [null, { ...address, commune: "Concepción" }, { ...address, recipientName: " " }, { ...address, address: " " }, { ...address, phone: "abc" }, { ...address, phone: "" }]) {
    assert.equal(savedCheckoutAddressIsUsable(invalid), false);
    if (invalid) assert.ok(savedCheckoutDestination(invalid).note);
  }
});

test("checkout draft preserves saved mode and alternative fields without persisting account data", () => {
  const store = createCheckoutDraftStore("CLIENT:1");
  const alternative = { deliveryRecipientName: "Otra persona", deliveryAddress: "Otra calle" };
  store.write("DIRECT:test", { addressMode: "SAVED", alternativeDestination: alternative });
  const restored = store.read("DIRECT:test");
  assert.equal(restored.addressMode, "SAVED");
  assert.deepEqual(restored.alternativeDestination, alternative);
  restored.alternativeDestination.deliveryAddress = "Mutación externa";
  assert.equal(store.read("DIRECT:test").alternativeDestination.deliveryAddress, "Otra calle");
  assert.equal(createCheckoutDraftStore("CLIENT:2").read("DIRECT:test"), null);
});

test("empty favorites and guest orders reuse one visual block and suppress redundant header return", async () => {
  const [favorites, guest, empty] = await Promise.all([read("pages/FavoritesPage.jsx"), read("pages/GuestDeviceOrdersPage.jsx"), read("components/CatalogEmptyState.jsx")]);
  assert.match(favorites, /products.length > 0\) && <InformationBackLink/);
  assert.match(guest, /orders.length > 0 && <InformationBackLink/);
  assert.match(favorites, /<CatalogEmptyState icon=\{Heart\}/);
  assert.match(guest, /<CatalogEmptyState icon=\{ClipboardList\}/);
  assert.match(guest, /enlace seguro enviado por correo/);
  assert.match(empty, /to="\/catalog">Explorar catálogo/);
});

test("quick-flow actions share dialog focus trap and remain outside the scrollable body", async () => {
  const [modal, products, editor, styles] = await Promise.all([read("components/AppModal.jsx"), read("pages/ProductsPage.jsx"), read("components/ProductBundleEditor.jsx"), read("styles/styles.css")]);
  assert.match(modal, /Math.min\(left, window.innerWidth - right\) >= 234/);
  assert.ok(modal.indexOf('{flowActions && <footer') > modal.indexOf('overscroll-contain p-5'));
  assert.match(modal, /observer.disconnect\(\); window.removeEventListener\("resize", measure\)/);
  assert.match(products, /simpleProductFormRef.current\?\.requestSubmit\(\)/);
  assert.match(products, /bundleReviewRef.current\?\.review\(\)/);
  assert.match(editor, /!externalActions && <button type="submit"/);
  assert.match(styles, /modal-flow-actions\[data-placement="side"\][^}]+position: absolute/);
  assert.match(styles, /modal-flow-action > button \{[^}]+min-height: 44px/);
});
