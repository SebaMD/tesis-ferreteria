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
  assert.ok([FYF_CONTACT.phone, FYF_CONTACT.whatsapp, FYF_CONTACT.email].every(v => v === null));
  assert.equal(FYF_CONTACT.address, "Cañete & Pedro Aguirre Cerda, Santa Juana, Bío Bío, Chile");
  assert.ok(Object.values(FYF_CONTACT.confirmed).every(v => v === false));
  assert.deepEqual(getStoreContactDetails(), []);
  const confirmed = { phone: true, whatsapp: true, email: true, address: true };
  assert.deepEqual(getStoreContactDetails({ phone: "javascript:alert(1)", whatsapp: "not-confirmed", email: "missing", address: "", confirmed }), []);
  const contacts = getStoreContactDetails({ phone: "+56912345678", whatsapp: "+56912345678", email: "contact@example.test", address: "Dirección de prueba", confirmed });
  assert.deepEqual(contacts.slice(0, 3).map(c => c.href), ["tel:+56912345678", "https://wa.me/56912345678", "mailto:contact@example.test"]);
  assert.equal(contacts[0].action, "Llamar");
  assert.equal(contacts[1].action, "WhatsApp");
  assert.ok(contacts.every(c => c.href && c.text && c.action));
});

test("cada contacto exige confirmación explícita y datos válidos; los campos ausentes no generan botones", () => {
  const values = { phone: "+56912345678", whatsapp: "+56912345678", email: "contact@example.test", address: FYF_CONTACT.address };
  assert.deepEqual(getStoreContactDetails(values), []);
  assert.deepEqual(getStoreContactDetails({ ...values, confirmed: { phone: "true", whatsapp: 1, email: false } }), []);
  const telephone = getStoreContactDetails({ ...values, confirmed: { phone: true } });
  assert.deepEqual(telephone.map(c => c.kind), ["phone"]);
  const email = getStoreContactDetails({ email: " contact@example.test ", confirmed: { email: true } });
  assert.equal(email[0].href, "mailto:contact@example.test");
  assert.deepEqual(getStoreContactDetails({ phone: "", whatsapp: "   ", email: "", address: "  ", confirmed: { phone: true, whatsapp: true, email: true, address: true } }), []);
});

test("Maps busca únicamente la dirección confirmada y conserva ampersand, acentos y comuna en query", () => {
  const [location] = getStoreContactDetails({ ...FYF_CONTACT, confirmed: { address: true } });
  assert.equal(location.kind, "address");
  assert.equal(location.action, "Abrir en Google Maps");
  assert.equal(location.external, true);
  const url = new URL(location.href);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), FYF_CONTACT.address);
  assert.deepEqual([...url.searchParams.keys()], ["api", "query"]);
  assert.match(location.href, /%26/);
});

test("página permanente enlazada desde el footer reutiliza layout y no llama endpoints comerciales", async () => {
  const read = p => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
  const [app, layout, page, catalog] = await Promise.all([read("App.jsx"), read("components/ClientLayout.jsx"), read("pages/ReturnsInformationPage.jsx"), read("pages/CatalogPage.jsx")]);
  assert.match(app, /path="\/changes-and-returns" element=\{<StorePage><ReturnsInformationPage/);
  assert.match(layout, /to="\/changes-and-returns"/);
  assert.doesNotMatch(catalog, /to="\/changes-and-returns"/);
  assert.match(page, /contacts\.length > 0 && <section[^>]+aria-label="Contacto y ubicación"/);
  assert.match(page, /href=\{contact\.href\}/);
  assert.match(page, /contact\.external \? "noopener noreferrer"/);
  assert.match(page, /no identifica necesariamente la entrada exacta del local/);
  assert.doesNotMatch(page, /<iframe|maps\/embed/);
  assert.doesNotMatch(page, /se publicarán|pendientes|confirmación y autorización por FYF/);
  assert.match(page, /https:\/\/www\.sernac\.cl\/portal\/618\/articles-84009_archivo_01\.pdf/);
  assert.match(layout, /text-rust-600/);
  assert.match(page, /text-rust-600/);
  assert.doesNotMatch(page + layout, /text-rust-700/);
  assert.doesNotMatch(page, /api\.|axios|fetch\(|post\(|stock|refund\(/);
});
