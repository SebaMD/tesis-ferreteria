import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getPendingReturnNoticeLabel } from "../src/helpers/labels.js";

const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("regreso informativo usa la restauración central sin reiniciar páginas durante POP", async () => {
  const [page, layout, app] = await Promise.all([read("pages/ReturnsInformationPage.jsx"), read("components/ClientLayout.jsx"), read("App.jsx")]);
  assert.doesNotMatch(page, /window.scrollTo/);
  const root = await read("pages/Root.jsx");
  assert.match(root, /<ClientScrollRestoration/);
  assert.doesNotMatch(layout, /overflow-y|scrollTo|scrollTop/);
  assert.doesNotMatch(app, /scrollTo|scrollRestoration/);
  assert.match(layout, /to="\/changes-and-returns"/);
});

test("cabecera conserva regreso contextual a la derecha y visible en móvil sin tocar navegación superior", async () => {
  const page = await read("pages/ReturnsInformationPage.jsx");
  const header = page.match(/<header[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  assert.ok(header.indexOf("<h1") < header.indexOf("<InformationBackLink"));
  assert.match(header, /public-page-header/);
  const navigation = await read("components/InformationNavigation.jsx");
  assert.match(navigation, /<CompactBackLink \{\.\.\.back\}/);
  const compact = await read("components/CompactBackLink.jsx");
  assert.match(compact, /aria-label=\{label\}/);
  assert.match(compact, /to=\{to\} state=\{state\}/);
  assert.doesNotMatch(navigation, /max-\[720px\]:hidden/);
  const navbar = await read("components/ClientNavbar.jsx");
  assert.match(navbar, /<NavLink className=\{navClass\} \{\.\.\.catalogReturn\}/);
});

test("aviso singular y plural comparte conteo sin Tienes en su versión móvil", async () => {
  assert.equal(getPendingReturnNoticeLabel(1), "1 solicitud de devolución pendiente");
  assert.equal(getPendingReturnNoticeLabel(2), "2 solicitudes de devolución pendientes");
  assert.equal(getPendingReturnNoticeLabel(25), "25 solicitudes de devolución pendientes");
  assert.equal(`Tienes ${getPendingReturnNoticeLabel(1)}`, "Tienes 1 solicitud de devolución pendiente");
  const sales = await read("pages/SalesPage.jsx");
  const notice = sales.match(/<div className="sale-return-pending-notice[\s\S]*?<\/div>/)?.[0];
  assert.ok(notice);
  assert.match(notice, /max-\[720px\]:hidden">Tienes <\/span>\{getPendingReturnNoticeLabel\(pendingCancellationSales\.length\)\}/);
  assert.match(notice, /min-w-0 flex-1 text-left text-sm font-bold/);
  assert.doesNotMatch(notice, /flex-wrap|truncate|line-clamp/);
  assert.match(notice, /shrink-0[^\n]+max-\[720px\]:size-11 max-\[720px\]:min-h-11 max-\[720px\]:p-0/);
});

test("Eye y EyeOff conservan acción, etiquetas accesibles y textos desktop en ambos estados", async () => {
  const sales = await read("pages/SalesPage.jsx");
  const notice = sales.match(/<div className="sale-return-pending-notice[\s\S]*?<\/div>/)?.[0];
  assert.ok(notice);
  const label = notice.match(/aria-label=\{([^}]+)\}/)?.[1];
  assert.equal(runInNewContext(label, { salesFilter: "current" }), "Ver solicitudes pendientes");
  assert.equal(runInNewContext(label, { salesFilter: "pending" }), "Volver a ventas vigentes");
  assert.match(notice, /salesFilter === "pending" \? <EyeOff size=\{20\} \/> : <Eye size=\{20\} \/>/);
  assert.match(notice, /hidden max-\[720px\]:inline-flex" aria-hidden="true"/);
  assert.match(notice, /max-\[720px\]:hidden">\{salesFilter === "pending" \? "Ver ventas vigentes" : "Ver solicitudes"\}/);
  assert.match(notice, /type="button"/);
  assert.match(notice, /setActiveView\("history"\);\s*applySalesFilter\(salesFilter === "pending" \? "current" : "pending"\)/);
  assert.match(sales, /canReviewCancellation && pendingCancellationSales\.length > 0/);
});
