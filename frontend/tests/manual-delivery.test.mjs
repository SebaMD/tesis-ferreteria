import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkoutQuoteFailure, receiveCheckoutQuote } from "../src/helpers/checkoutQuote.js";
import { buildCatalogSlides } from "../src/helpers/customerNoticeCarousel.js";
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("cotización manual pendiente no es error de productos ni autoriza cobro", async () => {
  assert.equal(checkoutQuoteFailure({response:{status:409,data:{code:"DELIVERY_MANUAL_QUOTE_REQUIRED"}}}).errorKind,"MANUAL_DELIVERY");
  const page=await read("pages/CheckoutPage.jsx");
  assert.match(page,/const canStartPayment = !loading\s*&& destinationValid/);
  assert.match(page,/deliveryCommune:DELIVERY_COMMUNE/);
  assert.doesNotMatch(page,/FYF debe aprobar el flete antes|<DeliveryQuoteRequestForm/);
  assert.match(page,/deliveryType==="DELIVERY"\?\{\.\.\.destination/);
  assert.match(page,/quoteFingerprint: quote.quoteFingerprint/);
  assert.equal(receiveCheckoutQuote({},"pickup",{commercialSignature:"A"}).needsAcceptance,false);
});
test("condiciones provienen del backend sin inventar fórmula, GPS ni aprobación",async()=>{
  const conditions=await read("pages/DeliveryConditionsPage.jsx");
  const references=await read("helpers/deliveryConditions.js");
  assert.match(references,/information\?\.minimumOutboundKmPriceReference/);
  assert.match(conditions,/No se ofrece despacho a otras comunas/);
  assert.match(conditions,/se muestra antes de Webpay/);
  assert.doesNotMatch(conditions,/geolocation|getCurrentPosition|\*.*[Kk]m/);
  const settings=await read("components/DeliverySettingsManager.jsx");
  assert.match(settings,/value=\{form.flatFee\}/);
  assert.match(settings,/api.put\('\/delivery-settings'/);
  assert.match(settings,/freeShippingFrom/);
  assert.match(settings,/LOCAL_FIXED/);
});
test("aviso manual y suspensión sustituyen el aviso automático sin tocar los manuales",()=>{
  const notices=[{id:8,title:"Aviso conservado",message:"Manual"}];
  for(const announcement of [
    {kind:"MANUAL_QUOTE",title:"Despacho sujeto a cotización",message:"Requiere confirmación",isDemo:false},
    {kind:"SUSPENDED",title:"El despacho no está disponible por ahora",message:"Retiro en tienda",isDemo:false},
  ]) {
    const slides=buildCatalogSlides(null,notices,announcement);
    assert.equal(slides.filter(s=>s.id==="delivery-policy").length,1);
    assert.equal(slides.at(-1).title,"Aviso conservado");
    assert.doesNotMatch(slides[1].title,/gratis/);
  }
});
test("nombre principal conserva color normal; opciones mantienen hover y foco accesible",async()=>{
  const css=await read("styles/styles.css");
  assert.match(css,/\.inventory-variant-select \.app-select-trigger:hover:not\(\[aria-expanded="true"\]\) \{ color: var\(--color-ink-950\)/);
  assert.match(css,/\.dark \.inventory-variant-select \.app-select-trigger:hover,/);
  assert.match(css,/inventory-variant-popup \.app-select-option:not\(\[aria-disabled="true"\]\):hover \{ background: var\(--color-rust-50\)/);
});
