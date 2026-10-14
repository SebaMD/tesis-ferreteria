import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FYF_CONTACT, getStoreContactDetails, RETURNS_INFORMATION } from "../src/helpers/storeInformation.js";

test("información separa garantía, retracto, cambios voluntarios y atención externa", () => {
  assert.deepEqual(RETURNS_INFORMATION.map(s => s.title), ["Garantía legal", "Retracto en compras online", "Cambios voluntarios por preferencia", "Cómo solicitar atención"]);
  const legal = RETURNS_INFORMATION[0].paragraphs.join(" ");
  assert.match(legal, /seis meses desde la recepción/);
  assert.match(legal, /no dependen/);
  const retract = RETURNS_INFORMATION[1].paragraphs.join(" ");
  assert.match(retract, /diez días corridos/);
  assert.match(retract, /no envía la confirmación escrita del contrato/);
  assert.match(retract, /noventa días corridos desde la recepción/);
  assert.match(retract, /mismos medios que utilizaste para celebrar el contrato/);
  assert.match(retract, /sin necesidad de expresar un motivo/);
  assert.match(retract, /No se exige acudir al local/);
  assert.match(RETURNS_INFORMATION[2].paragraphs.join(" "), /no limita los derechos legales/);
  assert.match(RETURNS_INFORMATION[3].paragraphs.join(" "), /no inicia una devolución ni realiza un reembolso automático/);
  assert.match(RETURNS_INFORMATION[3].paragraphs.join(" "), /no limita los medios legales/);
});

test("contactos pendientes no producen números, direcciones ni enlaces ficticios", () => {
  assert.ok(Object.values(FYF_CONTACT).every(v => v === null));
  assert.deepEqual(getStoreContactDetails(), []);
  assert.deepEqual(getStoreContactDetails({ phone: "javascript:alert(1)", whatsapp: "not-confirmed", email: "missing", address: "" }), []);
  const contacts = getStoreContactDetails({ phone: "+56912345678", whatsapp: "+56912345678", email: "contact@example.test", address: "Dirección de prueba" });
  assert.deepEqual(contacts.map(c => c.href), ["tel:+56912345678", "https://wa.me/56912345678", "mailto:contact@example.test", null]);
});

test("página permanente enlazada desde el footer reutiliza layout y no llama endpoints comerciales", async () => {
  const read = p => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
  const [app, layout, page, catalog] = await Promise.all([read("App.jsx"), read("components/ClientLayout.jsx"), read("pages/ReturnsInformationPage.jsx"), read("pages/CatalogPage.jsx")]);
  assert.match(app, /path="\/changes-and-returns" element=\{<StorePage><ReturnsInformationPage/);
  assert.match(layout, /to="\/changes-and-returns"/);
  assert.match(catalog, /<Link[^>]+to="\/changes-and-returns">Cambios y devoluciones<\/Link>/);
  assert.ok(catalog.indexOf('to="/changes-and-returns"') < catalog.indexOf("<CatalogNoticeCarousel />"));
  assert.match(page, /contacts\.length > 0 && <section[^>]+aria-label="Contacto de FYF"/);
  assert.doesNotMatch(page, /se publicarán|pendientes|confirmación y autorización por FYF/);
  assert.match(page, /https:\/\/www\.sernac\.cl\/portal\/618\/articles-84009_archivo_01\.pdf/);
  assert.match(layout, /text-rust-600/);
  assert.match(page, /text-rust-600/);
  assert.doesNotMatch(page + layout, /text-rust-700/);
  assert.doesNotMatch(page, /api\.|axios|fetch\(|post\(|stock|refund\(/);
});
