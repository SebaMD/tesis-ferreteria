import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=file=>readFile(new URL(`../src/${file}`,import.meta.url),"utf8");
test("checkout dispatch creates only a quote request with a stable key and separate PIN purpose",async()=>{
  const form=await read("components/DeliveryQuoteRequestForm.jsx"),checkout=await read("pages/CheckoutPage.jsx");
  assert.match(form,/requestKey:operation.current.key/);assert.match(form,/submitting.current/);
  assert.doesNotMatch(form,/submitWebpayForm|createOnlineOrder|inventory/);
  for(const field of ["recipientName","phone","address","commune","reference","nonUrgent"])assert.ok(form.includes(field));
  assert.match(checkout,/deliveryType === "DELIVERY" \? quotePinRequest/);
  assert.match(checkout,/guestEmailVerification.purpose === deliveryType/);
  assert.match(checkout,/Por cotizar/);
});
test("acceptance includes both backend signatures and never submits client freight",async()=>{
  const page=await read("pages/DeliveryQuotesPage.jsx");
  assert.match(page,/accepted:true,quoteFingerprint:summary.quoteFingerprint,commercialSignature:summary.commercialSignature/);
  assert.match(page,/disabled=\{busy\|\|!accepted\}/);assert.match(page,/paymentBusy.current/);
  assert.match(page,/code===\"QUOTE_CHANGED\"/);assert.match(page,/setAccepted\(false\)/);
  assert.match(page,/"\/payment":"\/checkout"/);assert.match(page,/close-unpaid/);
});
test("guest quote access uses a dedicated session token header, not IDs or email as authority",async()=>{
  const service=await read("services/deliveryQuotes.service.js");
  assert.match(service,/X-Delivery-Quote-Token/);assert.match(service,/X-Guest-Session/);
  assert.match(service,/sessionStorage.setItem/);assert.doesNotMatch(service,/accessToken.*URLSearchParams|\?token=/);
  assert.match(service,/\/recover-access/);
});
test("commercial settings persist manual conditional threshold and retain review/version control",async()=>{
  const settings=await read("components/DeliverySettingsManager.jsx");
  for(const field of ["conditionalFreeEnabled","conditionalFreeFrom","approvalValidityHours","evaluationValidityHours","expectedRevisionId"])assert.ok(settings.includes(field));
  assert.match(settings,/if \(!review\)/);assert.match(settings,/Modo manual aún no activado/);
  assert.doesNotMatch(settings,/freeShippingFrom:/);
});
