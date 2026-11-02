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
    const inventory = [{ ...product, categoryId: 1, categoryName: "Prueba", brand: "Prueba", minimumStock: 0, updatedAt: "2026-11-02T12:00:00.000Z", hasHistory: false }];
    const categories = [{ id: 1, name: "Prueba", description: "Categoría de prueba" }];
    const bundleWrites = [];
    let movementWrites = 0;
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => { if (errors.length < 20) errors.push(error.stack); });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      const endpoint = url.pathname;
      if (endpoint.startsWith("/api/")) {
        let data;
        if (/\/catalog\/products\/\d+$/.test(endpoint)) data = { ...product, id: Number(endpoint.split("/").at(-1)) };
        else if (endpoint.endsWith("/catalog/products")) { await new Promise(resolve => setTimeout(resolve, 200)); data = { items: Array.from({ length: 20 }, (_, i) => ({ ...product, id: 99 + i, name: `Artículo ${i + 1}`, categoryName: "Prueba" })), page: 1, pageSize: 20, totalItems: 20, totalPages: 1, facets: { categories: [{ id: 1, name: "Prueba" }], brands: [] } }; }
        else if (endpoint.endsWith("/products")) data = inventory;
        else if (endpoint.endsWith("/inventory")) { if (route.request().method() === "POST") movementWrites++; data = []; }
        else if (endpoint.endsWith("/categories")) { if (route.request().method() === "POST") { data = { id: 2, ...route.request().postDataJSON() }; categories.push(data); } else data = categories; }
        else if (/\/categories\/\d+$/.test(endpoint)) data = { id: 2, ...route.request().postDataJSON() };
        else if (/\/product-families\/conversion\/\d+$/.test(endpoint)) data = { product: inventory.find(item => item.id === Number(endpoint.split("/").at(-1))), revision: "revision-test" };
        else if (endpoint.endsWith("/product-families/bundle")) {
          const body = route.request().postDataJSON(); bundleWrites.push(body);
          const familyId = body.simple ? null : 18;
          const ids = body.variants.map((variant, index) => {
            const id = variant.id || 200 + index;
            const next = { ...product, ...variant, id, name: variant.name || body.family.name, categoryId: body.family.categoryId, categoryName: categories.find(category => category.id === body.family.categoryId)?.name || "Prueba", currentStock: variant.id ? 20 : variant.initialStock, familyId, familyName: familyId ? body.family.name : null, unitMeasure: body.unitMeasure || "unidad", hasHistory: false, updatedAt: "2026-11-02T12:00:00.000Z" };
            const existing = inventory.findIndex(item => item.id === id); if (existing >= 0) inventory[existing] = next; else inventory.push(next); return id;
          });
          data = { familyId, productIds: ids, replayed: false };
        }
        else if (endpoint.endsWith("/online-orders/guest/device-orders")) data = extra.includes("with-orders") ? [{ id: 1, status: "CANCELLED", createdAt: "2026-11-02T12:00:00Z", total: 5990, deliveryType: "PICKUP", items: [] }] : [];
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
      if (["/ux-test", "/catalog", "/checkout", "/checkout-options", "/delivery-conditions", "/changes-and-returns", "/account", "/favorites", "/orders", "/catalog/families/18"].includes(endpoint) || /^\/catalog\/products\/\d+$/.test(endpoint)) return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
      const file = files.get(endpoint);
      if (file) return route.fulfill({ contentType: endpoint.endsWith(".css") ? "text/css" : "application/javascript", body: file.type === "chunk" ? file.code : file.source });
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:5184/ux-test?case=${mode}&theme=${theme}&${extra}`);
    page.uxRecords = { bundleWrites, get movementWrites() { return movementWrites; } };
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
  for (const theme of ["light", "dark"]) for (const width of [320, 360, 375, 400, 1280]) {
    const page = await pageFor("guest-orders", width, theme, "guest");
    await page.getByRole("link", { name: "Explorar catálogo", exact: true }).waitFor();
    await noOverflow(page); await page.context().close();
    const guestOrders = await pageFor("guest-orders", width, theme, "guest&with-orders");
    const back = guestOrders.getByRole("link", { name: "Volver al catálogo", exact: true }); await back.waitFor();
    if (width < 620) {
      assert.equal((await back.boundingBox()).width, 44);
      const heading = await guestOrders.getByRole("heading", { name: "Mis compras en este dispositivo", exact: true }).boundingBox();
      assert.ok(Math.abs(heading.x + heading.width / 2 - width / 2) < 2, "title must be centered independently of arrow");
    }
    await noOverflow(guestOrders); await guestOrders.context().close();
  }
  for (const stock of ["", "0", "5"]) {
    const page = await pageFor("inventory", 375, "light");
    await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Buscar categoría", exact: true }).fill("Prueba");
    await dialog.getByRole("option", { name: /^Prueba/ }).click();
    await dialog.getByLabel("Nombre", { exact: true }).fill("Nuevo artículo UX");
    await dialog.getByLabel("Precio", { exact: true }).fill("1000");
    await dialog.getByRole("spinbutton", { name: /^Stock inicial/ }).fill(stock);
    const label = stock === "" ? "Guardar y registrar entrada" : stock === "0" ? "Guardar y revisar existencias" : "Guardar y revisar entrada";
    await dialog.getByRole("button", { name: label, exact: true }).click();
    if (stock === "") {
      await page.getByRole("heading", { name: "Registrar entrada", exact: true }).waitFor();
      await page.getByRole("button", { name: "Volver a producto", exact: true }).click();
      await page.getByRole("button", { name: "Convertir en producto con variantes", exact: true }).click();
      await page.getByRole("heading", { name: "Convertir producto en variantes", exact: true }).waitFor();
      await page.getByRole("heading", { name: "1. Preparar conversión" }).waitFor();
      for (const width of [320, 360, 375, 400, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const back = page.getByRole("button", { name: "Volver a categoría", exact: true });
        await back.scrollIntoViewIfNeeded();
        assert.equal(await back.evaluate(element => getComputedStyle(element).position), "static");
        const b = await back.boundingBox(); const heading = await page.getByRole("heading", { name: "1. Preparar conversión" }).boundingBox();
        assert.ok(b.y + b.height <= heading.y, "back button must not cover conversion fields");
        await noOverflow(page);
      }
    }
    else await page.getByRole("heading", { name: "Productos guardados · Existencias y entradas", exact: true }).waitFor();
    assert.equal(page.uxRecords.bundleWrites.length, 1); assert.equal(page.uxRecords.movementWrites, 0);
    assert.equal(page.uxRecords.bundleWrites[0].variants[0].initialStock, Number(stock));
    await noOverflow(page); await page.context().close();
  }
  const quick = await pageFor("inventory", 375, "dark");
  await quick.getByRole("button", { name: "Gestionar categorías", exact: true }).click();
  await quick.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Categoría UX");
  await quick.getByRole("button", { name: "Guardar y agregar producto", exact: true }).click();
  await quick.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Familia UX");
  await quick.getByRole("dialog").getByLabel("Precio", { exact: true }).fill("1000");
  await quick.getByRole("button", { name: "Producto con variantes", exact: true }).click();
  await quick.getByLabel("Nombre del atributo 1", { exact: true }).fill("Color");
  await quick.getByLabel("Opción de Color", { exact: true }).fill("Rojo");
  await quick.getByRole("button", { name: "Volver a categoría", exact: true }).click();
  await quick.getByRole("button", { name: "Actualizar y continuar", exact: true }).click();
  assert.equal(await quick.getByLabel("Nombre del atributo 1", { exact: true }).inputValue(), "Color");
  assert.equal(await quick.getByLabel("Opción de Color", { exact: true }).inputValue(), "Rojo");
  await quick.locator('input[data-bundle-field="initialStock"]').first().fill("5");
  await quick.getByRole("button", { name: "Agregar otra variante", exact: true }).click();
  await quick.getByLabel("Opción de Color", { exact: true }).nth(1).fill("Azul");
  await quick.locator('input[data-bundle-field="price"]').nth(1).fill("1000");
  const saveFamily = quick.getByRole("button", { name: "Guardar y revisar entradas", exact: true });
  for (const width of [320, 360, 375, 400, 1280]) {
    await quick.setViewportSize({ width, height: 900 }); await saveFamily.scrollIntoViewIfNeeded();
    const rect = await saveFamily.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= width);
    assert.equal(await saveFamily.locator("svg").count(), 1); await noOverflow(quick);
  }
  await saveFamily.click();
  await quick.getByRole("heading", { name: "Productos guardados · Existencias y entradas", exact: true }).waitFor();
  assert.deepEqual(quick.uxRecords.bundleWrites[0].variants.map(row => row.initialStock), [5, 0]);
  assert.equal(quick.uxRecords.bundleWrites.length, 1); assert.equal(quick.uxRecords.movementWrites, 0);
  await quick.getByRole("button", { name: "Agregar otro producto a esta categoría", exact: true }).click();
  assert.equal(await quick.getByRole("dialog").getByLabel("Nombre", { exact: true }).inputValue(), "");
  assert.equal(quick.uxRecords.bundleWrites.length, 1);
  await quick.context().close();
  const scroll = await pageFor("scroll", 1280, "light");
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).waitFor();
  await scroll.getByRole("combobox", { name: "Ordenar catálogo" }).click();
  await scroll.getByRole("option", { name: "Precio: mayor a menor", exact: true }).click();
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).scrollIntoViewIfNeeded();
  assert.ok(await scroll.evaluate(() => scrollY > 0));
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).click();
  await scroll.getByRole("heading", { name: "Producto de prueba", exact: true }).waitFor();
  // Locator clicks may scroll to their target after a selector restores focus.
  // Compare with the real departure position captured by the product link.
  const savedY = await scroll.evaluate(() => history.state?.usr?.productDetailOrigin?.scrollY);
  assert.ok(savedY > 0);
  assert.equal(await scroll.evaluate(() => scrollY), 0);
  await scroll.goBack();
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).waitFor();
  await scroll.waitForFunction(y => Math.abs(scrollY - y) < 3, savedY);
  assert.match(await scroll.getByRole("combobox", { name: "Ordenar catálogo" }).textContent(), /Precio: mayor a menor/);
  await scroll.reload();
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).waitFor();
  await scroll.waitForFunction(y => Math.abs(scrollY - y) < 3, savedY);
  await scroll.getByRole("navigation", { name: "Pruebas de navegación" }).getByRole("link", { name: "Favoritos", exact: true }).click();
  assert.equal(await scroll.evaluate(() => scrollY), 0);
  await scroll.getByRole("link", { name: "Volver al catálogo", exact: true }).click();
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).waitFor();
  await scroll.waitForFunction(y => Math.abs(scrollY - y) < 3, savedY);
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).click();
  await scroll.getByRole("link", { name: "Volver al catálogo", exact: true }).click();
  await scroll.getByRole("link", { name: "Artículo 7", exact: true }).waitFor();
  await scroll.waitForFunction(y => Math.abs(scrollY - y) < 3, savedY);
  await scroll.getByRole("navigation", { name: "Pruebas de navegación" }).getByRole("link", { name: "Devoluciones" }).click();
  assert.equal(await scroll.evaluate(() => scrollY), 0);
  await scroll.context().close();
  for (const theme of ["light", "dark"]) for (const width of [320, 360, 375, 400, 1280]) {
    const headers = await pageFor("scroll", width, theme);
    for (const [link, title] of [["Favoritos", "Favoritos"], ["Mi cuenta", "Mi cuenta"], ["Mis compras", "Mis compras"], ["Devoluciones", "Cambios y devoluciones"], ["Condiciones", "Condiciones de despacho local"]]) {
      await headers.getByRole("navigation", { name: "Pruebas de navegación" }).getByRole("link", { name: link, exact: true }).click();
      const heading = headers.getByRole("heading", { name: title, exact: true }); await heading.waitFor();
      if (width < 620) { const box = await heading.boundingBox(); assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 2, title + " centered"); }
      await noOverflow(headers);
    }
    if ([320, 1280].includes(width)) await headers.screenshot({ path: fileURLToPath(new URL(`headers3-${width}-${theme}.png`, shots)), fullPage: true });
    await headers.context().close();
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
  console.log("PASS UX3: empty/zero/positive stock continuation, category draft roundtrip, inline back/conversion title, family per-SKU stock, no automatic extra movement, guest empty/history actions, centered client headers, async catalog POP/reload/context/filter restoration.");
  console.log("Screenshots:", fileURLToPath(shots));
} catch (error) {
  console.error("Browser runtime errors:", errors);
  for (const context of browser?.contexts() || []) for (const page of context.pages()) console.error((await page.locator("body").innerText()).slice(0, 1800));
  throw error;
} finally {
  await browser?.close();
}
