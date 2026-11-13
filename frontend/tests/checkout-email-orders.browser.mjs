// Chromium + real React components + intercepted API. No mail, Webpay or database access.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FYF_PLAYWRIGHT_MODULE || "playwright");
const bundle = await build({ root: fileURLToPath(new URL("..", import.meta.url)), define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL("./fixtures/checkout-email-orders.jsx", import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ["/" + file.fileName, file]));
const entry = bundle.output.find(file => file.type === "chunk" && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith(".css")).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join("");
const shots = process.env.FYF_UX_SCREENSHOT_DIR || await mkdtemp(path.join(tmpdir(), "fyf-checkout-email-orders-"));
const errors = [];
const product = { id: 99, name: "Producto de prueba", price: 5990, currentStock: 20, availableStock: 20, status: true, unitMeasure: "unidad", images: [] };
const item = { productId: 99, productName: "Producto de prueba", quantity: 1, unitPrice: "5990", subtotal: "5990", unitMeasure: "unidad" };
const attempt = { id: 10, status: "EXPIRED", total: "5990", productsSubtotal: "5990", productsDiscountTotal: "0", productsNet: "5990", deliveryFee: "0", deliveryType: "PICKUP", createdAt: "2026-11-05T20:00:00Z", items: [item], payment: { status: "EXPIRED" }, canRetryPayment: true, canArchive: true };
const initialOrders = () => [attempt, { ...attempt, id: 11, status: "CANCELLED", canRetryPayment: false }, { ...attempt, id: 12, status: "PAYMENT_REVIEW", payment: { status: "REVIEW" }, canRetryPayment: false, canArchive: false }, { ...attempt, id: 13, status: "DELIVERED", payment: { status: "AUTHORIZED" }, canRetryPayment: false, canArchive: false },
  ...["PAID", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"].map((status, index) => ({ ...attempt, id: 20 + index, status, payment: { status: "AUTHORIZED" }, canRetryPayment: false, canArchive: false, items: [{ ...item, productName: "Alicate profesional con un nombre extenso y características históricas del producto" }] })),
].map(order => structuredClone(order));
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let cases = 0;
try {
  async function pageFor(routePath, { guest = true, width = 1280, theme = "light" } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const records = { requests: [], codes: 0, verifies: 0, ttl: 600_000, verifyDelay: 0, failVerify: false, checkoutStatus: 409, revision: 0, fee: 3000, stock: 20, orders: initialOrders(), archives: [] };
    page.on("pageerror", error => errors.push(error.stack));
    await page.addInitScript(() => { HTMLFormElement.prototype.submit = function () { window.__webpayForm = { action: this.action, token: this.querySelector('[name="token_ws"]').value }; }; });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname, method = route.request().method();
      if (endpoint.startsWith("/api/")) {
        const body = method === "POST" || method === "PATCH" ? route.request().postDataJSON() : null;
        records.requests.push({ endpoint, method, body });
        let data;
        if (/\/catalog\/products\/\d+$/.test(endpoint)) data = { ...product, currentStock: records.stock, availableStock: records.stock };
        else if (endpoint.endsWith("/online-orders/delivery-address")) data = null;
        else if (endpoint.endsWith("/online-orders/guest/pending")) data = null;
        else if (endpoint.endsWith("/online-orders/quote")) {
          const fee = body.deliveryType === "DELIVERY" ? records.fee : 0;
          data = { productsSubtotal: 5990, productsDiscountTotal: 0, productsNet: 5990, deliveryFee: fee, total: 5990 + fee, quoteFingerprint: `quote-${body.deliveryType}-${fee}-${records.revision}`, commercialSignature: `commercial-${body.deliveryType}-${fee}-${records.revision}` };
        } else if (/\/email-verification\/(guest|client)\/request$/.test(endpoint)) {
          records.codes++;
          data = { challengeId: records.codes, email: body?.email || "client@example.test", expiresAt: new Date(Date.now() + records.ttl).toISOString(), resendAvailableAt: new Date().toISOString(), sent: true };
          records.challengeEmail = data.email;
        } else if (/\/email-verification\/(guest|client)\/verify$/.test(endpoint)) {
          records.verifies++;
          if (records.verifyDelay) await new Promise(resolve => setTimeout(resolve, records.verifyDelay));
          if (records.failVerify || body.pin !== "123456") return route.fulfill({ status: 400, json: { message: "Código inválido o vencido" } });
          data = endpoint.includes("/client/") ? { token: "synthetic-test-session", user: { id: 1, role: "CLIENT", correo: "client@example.test", names: "Cliente", emailVerified: true } } : { challengeId: body.challengeId, email: records.challengeEmail, verifiedAt: new Date().toISOString() };
        } else if (/\/online-orders\/(guest\/)?checkout$/.test(endpoint)) {
          records.revision++;
          return route.fulfill({ status: records.checkoutStatus, json: records.checkoutStatus === 403 ? { message: "Debes verificar el correo de esta compra antes de iniciar el pago" } : { code: "QUOTE_CHANGED", message: "La cotización cambió o venció" } });
        } else if (endpoint.endsWith("/retry-payment")) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const id = Number(endpoint.split("/").at(-2));
          if (records.retryError) {
            records.orders.find(order => order.id === id).canRetryPayment = false;
            return route.fulfill({ status: 409, json: { message: "El stock disponible cambió. No se inició un nuevo pago." } });
          }
          data = { orderId: id, token: "new-test-payment-token", url: "https://webpay.example.test/pay", guestAccessToken: "t".repeat(43) };
        } else if (endpoint.endsWith("/archive")) {
          const id = Number(endpoint.split("/").at(-2)); records.archives.push(id); records.orders = records.orders.filter(order => order.id !== id); data = { orderId: id };
        } else if (endpoint.endsWith("/restore")) {
          const id = Number(endpoint.split("/").at(-2)); records.orders.push(initialOrders().find(order => order.id === id)); data = { orderId: id };
        } else if (endpoint.endsWith("/online-orders/guest/device-orders") || endpoint.endsWith("/online-orders")) data = routePath === "/checkout" ? [] : records.orders;
        else { errors.push(`Unexpected API: ${method} ${endpoint}`); return route.abort(); }
        return route.fulfill({ json: { data } });
      }
      const file = files.get(endpoint);
      if (file) return route.fulfill({ contentType: endpoint.endsWith(".css") ? "text/css" : "application/javascript", body: file.type === "chunk" ? file.code : file.source });
      if (["/checkout", "/orders", "/guest-orders", "/delivery-conditions"].includes(endpoint)) return route.fulfill({ contentType: "text/html", body: `<html lang="es"><head>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
      errors.push(`Blocked external URL: ${url}`); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5184${routePath}?${guest ? "guest&" : ""}theme=${theme}`);
    return { page, context, records };
  }
  const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
  const pay = page => page.getByRole("button", { name: /^Pagar con Webpay Plus/ });
  const waitPay = async page => {
    try {
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Pagar con Webpay Plus") && !button.disabled));
    } catch (error) {
      console.log(await page.locator("main").innerText());
      throw error;
    }
  };
  async function fillGuest(page, email = "guest@example.test") {
    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Persona Invitada");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await page.getByLabel("Confirmar correo", { exact: true }).fill(email);
    await page.getByLabel("Teléfono", { exact: true }).fill("+56912345678");
  }
  async function verify(page) {
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).click();
    await page.getByLabel("Codigo de 6 digitos").fill("123456");
    await page.getByRole("button", { name: "Verificar correo", exact: true }).click();
  }
  async function delivery(page) {
    await page.getByRole("radio", { name: /Despacho local/ }).check();
    await page.getByLabel("Destinatario", { exact: true }).fill("Persona receptora");
    await page.getByLabel("Teléfono de contacto", { exact: true }).fill("+56912345678");
    await page.getByLabel("Dirección, numeración o sector", { exact: true }).fill("Calle de prueba 123");
  }

  for (const startDelivery of [false, true]) {
    const { page, context, records } = await pageFor("/checkout");
    await fillGuest(page);
    if (startDelivery) await delivery(page);
    await verify(page); await waitPay(page);
    if (startDelivery) await page.getByRole("radio", { name: /Retiro en tienda/ }).check(); else await delivery(page);
    await waitPay(page);
    if (startDelivery) await page.getByRole("radio", { name: /Despacho local/ }).check(); else await page.getByRole("radio", { name: /Retiro en tienda/ }).check();
    await waitPay(page);
    assert.equal(records.codes, 1); assert.equal(records.verifies, 1);
    assert.equal(await page.getByRole("button", { name: "Enviar codigo", exact: true }).count(), 0);
    await pay(page).click();
    await page.getByText(/El resumen cambió\./).waitFor(); await waitPay(page);
    assert.equal(await page.getByRole("button", { name: /Aceptar resumen actualizado/ }).count(), 0);
    assert.equal(records.requests.filter(request => request.endpoint.endsWith('/guest/checkout')).length, 1, 'conflict never resubmits payment automatically');
    assert.equal(records.codes, 1, "quote changes do not invalidate identity");
    const payload = records.requests.find(request => request.endpoint.endsWith("/guest/checkout")).body;
    assert.equal(payload.emailVerificationChallengeId, 1);
    assert.equal(payload.deliveryType, startDelivery ? "DELIVERY" : "PICKUP");
    assert.equal(payload.quoteFingerprint, `quote-${payload.deliveryType}-${startDelivery ? 3000 : 0}-0`);
    assert.ok((await pay(page).textContent()).includes(startDelivery ? '$8.990' : '$5.990'), 'final action explicitly names the displayed total');
    await page.getByRole("radio", { name: /Retiro en tienda/ }).check();
    records.fee = 4000;
    await delivery(page); await page.getByLabel("Referencia u observaciones de entrega").fill("Portón de prueba");
    await page.getByRole("button", { name: /Pagar con Webpay Plus.*\$9\.990/ }).waitFor();
    await page.getByText(/El resumen cambió\./).waitFor(); await waitPay(page);
    assert.ok((await pay(page).textContent()).includes('$9.990'));
    assert.equal(records.codes, 1);
    records.stock = 0; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Pagar con Webpay Plus") && button.disabled));
    assert.equal(records.codes, 1, "stock validation remains independent");
    cases++; await context.close();
  }

  {
    const { page, context, records } = await pageFor("/checkout"); await fillGuest(page); await verify(page); await waitPay(page);
    await page.getByLabel("Correo electrónico", { exact: true }).fill("other@example.test");
    await page.getByLabel("Confirmar correo", { exact: true }).fill("other@example.test");
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true);
    records.failVerify = true; await verify(page); await page.getByRole("alert").filter({ hasText: "Código inválido" }).first().waitFor(); assert.equal(await pay(page).isDisabled(), true);
    records.failVerify = false; await page.getByRole("button", { name: "Verificar correo", exact: true }).click(); await waitPay(page);
    await page.evaluate(() => { localStorage.setItem("fyf_guest_checkout_session", "b".repeat(43)); window.dispatchEvent(new StorageEvent("storage")); });
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true);
    await page.reload(); await fillGuest(page);
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true, "a fresh process does not inherit a previous verification");
    cases++; await context.close();
  }
  {
    const { page, context, records } = await pageFor("/checkout"); records.ttl = 2000;
    await fillGuest(page); await verify(page); await waitPay(page);
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true);
    records.ttl = 600_000; await verify(page); await waitPay(page);
    records.checkoutStatus = 403; await pay(page).click();
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true);
    cases++; await context.close();
  }
  {
    const { page, context, records } = await pageFor("/checkout"); await fillGuest(page); records.verifyDelay = 600;
    await verify(page); await page.getByLabel("Correo electrónico", { exact: true }).fill("other@example.test");
    await page.getByLabel("Confirmar correo", { exact: true }).fill("other@example.test");
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor();
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(await pay(page).isDisabled(), true, "late verification of old identity cannot authorize new email");
    cases++; await context.close();
  }
  {
    const { page, context, records } = await pageFor("/checkout", { guest: false }); await verify(page); await waitPay(page);
    await delivery(page); await waitPay(page); await page.getByRole("radio", { name: /Retiro en tienda/ }).check(); await waitPay(page);
    assert.equal(records.codes, 1); assert.equal(records.verifies, 1);
    await page.getByTestId("change-identity").click();
    await page.getByRole("button", { name: "Enviar codigo", exact: true }).waitFor(); assert.equal(await pay(page).isDisabled(), true);
    cases++; await context.close();
  }

  for (const guest of [false, true]) for (const theme of ["light", "dark"]) for (const width of [320, 360, 390, 430, 1280, 1440]) {
    const { page, context, records } = await pageFor(guest ? "/guest-orders" : "/orders", { guest, theme, width });
    const card = page.locator("#order-10"); await card.waitFor();
    const retry = card.getByRole("button", { name: "Reintentar pago" }); const detail = card.getByRole("button", { name: "Ver detalle", exact: true });
    const r = await retry.boundingBox(), d = await detail.boundingBox();
    assert.ok(d.y >= r.y + r.height && Math.abs(d.width - r.width) < 1 && Math.abs(d.x - r.x) < 1, "retry above detail, equal width");
    assert.ok(r.height >= 44 && d.height >= 44); await noOverflow(page);
    assert.equal(await card.getByRole("button").count(), 2, "incomplete card has only retry and detail");
    assert.equal(await card.getByRole("button", { name: "Ocultar", exact: true }).count(), 0);
    const cardBox = await card.boundingBox();
    assert.ok(cardBox.y + cardBox.height - (d.y + d.height) <= 20, "no artificial space below the two actions");
    for (const id of [20, 21, 22, 23, 24]) {
      const activeCard = page.locator(`#order-${id}`);
      const badge = activeCard.locator("span").filter({ hasText: /^(Pago confirmado|Preparando pedido|Listo para retirar|Listo para despacho|En reparto)$/i });
      const box = await badge.boundingBox();
      const name = await activeCard.getByText("Alicate profesional con un nombre extenso y características históricas del producto", { exact: true }).boundingBox();
      const total = await activeCard.getByText("$5.990", { exact: true }).boundingBox();
      assert.ok(box && box.y <= name.y + 1, "active badge stays above/beside product name, never below it");
      assert.ok(box.x >= name.x && box.x + box.width <= (await activeCard.boundingBox()).x + (await activeCard.boundingBox()).width, "badge remains to the right within its card");
      assert.ok(box.x + box.width <= total.x || box.y + box.height <= total.y, "badge never overlaps total");
      assert.equal(await activeCard.getByRole("button", { name: "Descargar comprobante" }).count(), 1);
    }
    assert.equal(await page.locator("#order-11").getByRole("button", { name: "Reintentar pago" }).count(), 0);
    assert.equal(await page.locator("#order-12").getByRole("button", { name: "Ocultar", exact: true }).count(), 0);
    assert.equal(await page.locator("#order-13").getByRole("button", { name: "Ocultar", exact: true }).count(), 0);
    if ([320, 1280].includes(width)) {
      await card.screenshot({ path: path.join(shots, `compact-${guest ? "guest" : "client"}-${width}-${theme}.png`) });
      await page.locator("#order-20").screenshot({ path: path.join(shots, `paid-${guest ? "guest" : "client"}-${width}-${theme}.png`) });
    }
    if (width === 320) { await detail.focus(); await page.keyboard.press("Enter"); } else await detail.click();
    const dialog = page.getByRole("dialog");
    const date = dialog.getByText("Fecha de compra", { exact: true }); const actions = dialog.getByRole("button", { name: "Reintentar pago" });
    await actions.scrollIntoViewIfNeeded(); const a = await actions.boundingBox(), dt = await date.boundingBox();
    const amounts = await dialog.getByText("Total final", { exact: true }).boundingBox();
    assert.ok(a.y > amounts.y && dt.y > amounts.y, "date and actions are below amounts");
    if (width >= 1280) assert.ok(a.x > dt.x && Math.abs(a.y - dt.y) < 35, "desktop date left and actions right");
    assert.ok(a.width > 0 && a.height >= 40); await noOverflow(page);
    if ([320, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `attempt-${guest ? "guest" : "client"}-${width}-${theme}.png`), fullPage: true });
    await page.keyboard.press("Escape"); assert.equal(await dialog.count(), 0);
    if (width === 1280 && theme === "light") {
      await detail.click();
      await page.getByRole("dialog").getByRole("button", { name: "Ocultar", exact: true }).click();
      await page.getByRole("dialog").last().getByRole("button", { name: "Ocultar", exact: true }).click();
      await card.waitFor({ state: "detached" });
      if (guest) {
        assert.equal(records.archives.length, 0); await page.reload();
        await page.getByRole("button", { name: /Mostrar ocultos/ }).click();
        await page.locator("#order-10").getByRole("button", { name: "Restaurar" }).click();
        await page.locator("#order-10").getByRole("button", { name: "Ver detalle", exact: true }).waitFor();
        assert.equal(records.requests.some(request => /\/archive|\/restore/.test(request.endpoint)), false);
      } else { assert.deepEqual(records.archives, [10]); await page.getByRole("button", { name: "Deshacer", exact: true }).click(); await card.waitFor(); }
      const retryButton = card.getByRole("button", { name: "Reintentar pago" });
      const retryElement = await retryButton.elementHandle();
      await retryButton.click();
      await retryElement.evaluate(button => button.click());
      try { await page.waitForFunction(() => Boolean(window.__webpayForm)); }
      catch (error) { console.log({ guest, requests: records.requests.slice(-6), errors, text: await page.locator("body").innerText() }); throw error; }
      assert.equal(records.requests.filter(request => request.endpoint.endsWith("/retry-payment")).length, 1, "double click starts one retry");
      assert.equal((await page.evaluate(() => window.__webpayForm)).token, "new-test-payment-token", "new payment attempt, not expired token");
    }
    cases++; await context.close();
  }
  for (const guest of [false, true]) {
    const { page, context, records } = await pageFor(guest ? "/guest-orders" : "/orders", { guest });
    await page.locator("#order-10").getByRole("button", { name: "Ver detalle", exact: true }).click();
    records.retryError = true;
    await page.getByRole("dialog").getByRole("button", { name: "Reintentar pago" }).click();
    await page.getByText("El stock disponible cambió. No se inició un nuevo pago.", { exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"] button')].some(button => button.textContent.includes("Reintentar pago") || button.textContent.includes("Iniciando")));
    assert.equal(await page.evaluate(() => Boolean(window.__webpayForm)), false);
    assert.equal(records.requests.filter(request => request.endpoint.endsWith("/retry-payment")).length, 1);
    cases++; await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${cases} browser scenarios: checkout identity/expiry/commercial guards, client/guest attempts, reversible guest hiding; APIs simulated. Screenshots: ${shots}`);
} finally {
  await browser.close();
}
