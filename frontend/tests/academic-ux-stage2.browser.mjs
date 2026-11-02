// Run with FYF_PLAYWRIGHT_MODULE pointing to an existing Playwright installation.
// APIs are intercepted; no backend, account, payment or database is contacted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FYF_PLAYWRIGHT_MODULE || "playwright");
const bundle = await build({ root: fileURLToPath(new URL("..", import.meta.url)), define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL("./fixtures/academic-ux-stage2.jsx", import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ["/" + file.fileName, file]));
const entry = bundle.output.find(file => file.type === "chunk" && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith(".css")).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join("");
let browser;
const errors = [];
const requests = [];
const product = { id: 99, name: "Producto de prueba", price: 5990, currentStock: 20, availableStock: 20, status: true, unitMeasure: "unidad", images: [] };
const saved = { recipientName: "Persona guardada", phone: "+56912345678", address: "Calle guardada 123", commune: "Santa Juana", reference: "Portón verde" };
const shots = pathToFileURL(await mkdtemp(path.join(tmpdir(), "fyf-academic-ux2-")) + path.sep);
try {
  browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  async function pageFor(mode, width, theme = "light", extra = "") {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => { if (errors.length < 20) errors.push(error.stack); });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      const endpoint = url.pathname;
      if (endpoint.startsWith("/api/")) {
        let data;
        if (endpoint.endsWith("/catalog/products/99")) data = product;
        else if (endpoint.endsWith("/online-orders/delivery-address")) data = extra.includes("no-address") ? null : saved;
        else if (endpoint.endsWith("/online-orders/guest/pending")) data = null;
        else if (endpoint.endsWith("/online-orders")) data = [];
        else if (endpoint.endsWith("/online-orders/quote")) {
          const body = route.request().postDataJSON();
          data = { productsSubtotal: 5990, productsDiscountTotal: 0, productsNet: 5990, deliveryFee: body.deliveryType === "DELIVERY" ? 3000 : 0, total: body.deliveryType === "DELIVERY" ? 8990 : 5990, commercialSignature: body.deliveryType, quoteFingerprint: "test-" + body.deliveryType };
        } else if (endpoint.endsWith("/online-orders/checkout")) {
          requests.push(route.request().postDataJSON());
          return route.fulfill({ status: 409, json: { code: "QUOTE_CHANGED", message: "Respuesta simulada: no se inicia un pago" } });
        } else if (endpoint.endsWith("/product-families/18/bundle")) data = { family: { id: 18, name: "Familia de prueba", categoryId: 1, brand: "Prueba", attributes: [{ id: 1, name: "Color", options: [{ id: 1, label: "Rojo" }, { id: 2, label: "Azul" }] }] }, variants: [{ ...product, familyId: 18, variantOptionIds: [1] }, { ...product, id: 100, familyId: 18, variantOptionIds: [2], status: false }], revision: "revision-test" };
        else throw new Error(`Unexpected API (blocked): ${endpoint}`);
        return route.fulfill({ json: { data } });
      }
      if (url.hostname !== "127.0.0.1" || url.port !== "5184") return route.abort();
      if (["/ux-test", "/checkout", "/checkout-options", "/delivery-conditions", "/catalog/families/18"].includes(endpoint)) return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
      const file = files.get(endpoint);
      if (file) return route.fulfill({ contentType: endpoint.endsWith(".css") ? "text/css" : "application/javascript", body: file.type === "chunk" ? file.code : file.source });
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:5184/ux-test?case=${mode}&theme=${theme}&${extra}`);
    return page;
  }
  const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 360, 375, 400, 1280]) {
      if (width < 720) {
        const page = await pageFor("filters", width, theme);
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("button", { name: "inactive", exact: true }).click();
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":false,"empty":false}');
        await page.getByRole("button", { name: "Cerrar diálogo" }).click();
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        assert.equal(await page.getByRole("button", { name: "inactive", exact: true }).getAttribute("aria-pressed"), "false");
        await page.getByRole("button", { name: "inactive", exact: true }).click();
        await page.getByRole("button", { name: "Ver resultados" }).click();
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":true,"empty":false}');
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("button", { name: "Limpiar", exact: true }).click();
        await page.keyboard.press("Escape");
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":true,"empty":false}');
        assert.equal(await page.getByRole("button", { name: "Filtros", exact: true }).evaluate(e => e === document.activeElement), true);
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("button", { name: "empty", exact: true }).click();
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":true,"empty":false}');
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("button", { name: "Limpiar", exact: true }).click();
        await page.getByRole("dialog").locator("..").click({ position: { x: 2, y: 2 } });
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":true,"empty":false}');
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("button", { name: "Limpiar", exact: true }).click();
        await page.getByRole("button", { name: "Ver resultados" }).click();
        assert.equal(await page.getByTestId("applied").textContent(), '{"inactive":false,"empty":false}');
        await noOverflow(page); await page.context().close();
      }
      const bundle = await pageFor("bundle", width, theme);
      const add = bundle.getByRole("button", { name: "Agregar otro atributo", exact: true });
      await add.waitFor(); await add.isEnabled();
      const box = await add.boundingBox();
      const heading = await bundle.getByRole("button", { name: "Atributos (1)", exact: true }).boundingBox();
      assert.ok(Math.abs(box.y - heading.y) < 20, "add button must stay beside heading");
      if (width < 620) assert.ok(box.width >= 44 && box.width <= 45 && box.height >= 44);
      await noOverflow(bundle);
      if ([320, 1280].includes(width)) {
        if (width === 320) await bundle.getByRole("button", { name: "Atributos (1)", exact: true }).scrollIntoViewIfNeeded();
        await bundle.screenshot({ path: fileURLToPath(new URL(`bundle-${width}-${theme}.png`, shots)), fullPage: true });
      }
      await bundle.context().close();
      const checkout = await pageFor("purchase", width, theme);
      await checkout.getByRole("button", { name: "Comprar ahora" }).click();
      await checkout.getByRole("heading", { name: "Finalizar compra" }).waitFor();
      const back = checkout.getByRole("link", { name: "Volver al producto", exact: true });
      if (width <= 620) assert.equal((await back.boundingBox()).width, 44);
      await checkout.getByRole("radio", { name: /Despacho local/ }).check();
      await checkout.getByRole("button", { name: "Usar otra dirección" }).waitFor();
      await noOverflow(checkout);
      await checkout.getByRole("link", { name: "Condiciones de despacho", exact: true }).click();
      await checkout.getByRole("heading", { name: "Condiciones de despacho local" }).waitFor();
      if (width <= 620) assert.equal((await checkout.getByRole("link", { name: "Volver a finalizar compra" }).boundingBox()).width, 44);
      await noOverflow(checkout);
      if ([320, 1280].includes(width)) await checkout.screenshot({ path: fileURLToPath(new URL(`conditions-${width}-${theme}.png`, shots)), fullPage: true });
      await checkout.context().close();
    }
  }
  for (const guest of [false, true]) {
    const page = await pageFor("purchase", 375, "dark", guest ? "guest" : "");
    await page.getByRole("button", { name: "Comprar ahora" }).click();
    if (guest) {
      await page.getByRole("heading", { name: "¿Cómo quieres continuar?" }).waitFor();
      await page.getByRole("link", { name: "Volver al producto" }).click();
      assert.equal(await page.getByTestId("route").textContent(), "/catalog/families/18?variant=99");
      await page.getByRole("button", { name: "Comprar ahora" }).click();
      await page.getByRole("link", { name: "Continuar como invitado", exact: true }).click();
    }
    await page.getByRole("heading", { name: "Finalizar compra" }).waitFor();
    assert.equal(await page.getByTestId("cart").textContent(), "[[5,4]]");
    if (guest) { await page.getByRole("radio", { name: /Despacho local/ }).check(); assert.equal(await page.getByRole("checkbox", { name: /Guardar.*dirección/ }).count(), 0); }
    await page.reload();
    await page.getByRole("heading", { name: "Finalizar compra" }).waitFor();
    assert.equal(await page.getByTestId("cart").textContent(), "[[5,4]]");
    await page.getByRole("link", { name: "Volver al producto", exact: true }).click();
    assert.equal(await page.getByTestId("route").textContent(), "/catalog/families/18?variant=99");
    await page.context().close();
  }
  for (const hasAddress of [true, false]) {
    const page = await pageFor("purchase", 375, "light", hasAddress ? "" : "no-address");
    await page.getByRole("button", { name: "Comprar ahora" }).click();
    await page.getByRole("radio", { name: /Despacho local/ }).check();
    if (hasAddress) {
      await page.getByRole("button", { name: "Usar otra dirección" }).click();
      assert.equal(await page.getByLabel("Destinatario", { exact: true }).inputValue(), "");
      await page.getByRole("button", { name: "Usar dirección guardada" }).click();
      assert.equal(await page.getByLabel("Destinatario", { exact: true }).inputValue(), saved.recipientName);
      await page.getByRole("button", { name: "Usar otra dirección" }).click();
    }
    await page.getByLabel("Destinatario", { exact: true }).fill("Otro destinatario");
    await page.getByLabel("Teléfono de contacto").fill("+56987654321");
    await page.getByLabel("Dirección, numeración o sector").fill("Otra calle 123");
    await page.getByLabel("Referencia u observaciones de entrega").fill("Referencia del pedido");
    await page.getByRole("link", { name: "Condiciones de despacho", exact: true }).click();
    await page.getByRole("link", { name: "Volver a finalizar compra" }).click();
    assert.equal(await page.getByLabel("Destinatario", { exact: true }).inputValue(), "Otro destinatario");
    const check = page.getByRole("checkbox", { name: /Guardar.*dirección/ });
    await check.click();
    if (hasAddress) {
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      assert.equal(await check.isChecked(), false);
      await check.click();
      await page.getByRole("button", { name: "Confirmar reemplazo al crear el pedido" }).click();
    }
    await Promise.all([page.waitForResponse(response => response.url().endsWith("/online-orders/checkout")), page.getByRole("button", { name: "Pagar con Webpay Plus" }).click()]);
    assert.equal(requests.at(-1).saveDeliveryAddress, true);
    assert.deepEqual(requests.at(-1).items, [{ productId: 99, quantity: 1 }]);
    assert.equal(requests.at(-1).deliveryRecipientName, "Otro destinatario");
    await noOverflow(page); await page.context().close();
  }
  const carousel = await pageFor("carousel", 375, "dark");
  const region = carousel.getByRole("region", { name: "Información destacada del catálogo" });
  await region.focus(); await carousel.keyboard.press("ArrowRight");
  assert.equal(await carousel.getByRole("button", { name: /Mostrar diapositiva 2/ }).getAttribute("aria-current"), "true");
  const cdp = await carousel.context().newCDPSession(carousel);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 260, y: 120 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 70, y: 125 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await carousel.getByRole("button", { name: /Mostrar diapositiva 1/ }).getAttribute("aria-current"), "true");
  await carousel.getByRole("button", { name: /Mostrar diapositiva 2/ }).click();
  await noOverflow(carousel);
  await carousel.context().close();
  assert.deepEqual(errors, []);
  console.log("PASS browser: filters (draft/apply/cancel/Escape/focus), family headings, direct guest/client purchase, address reuse/replacement, information return, swipe/keyboard/dots; light/dark 320/360/375/400/1280. APIs simulated; no persistence claimed.");
  console.log("Screenshots:", fileURLToPath(shots));
} catch (error) {
  console.error("Browser runtime errors:", errors);
  for (const context of browser?.contexts() || []) for (const page of context.pages()) console.error((await page.locator("body").innerText()).slice(0, 1800));
  throw error;
} finally {
  await browser?.close();
}
