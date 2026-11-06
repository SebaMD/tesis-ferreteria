import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=file=>readFile(new URL(`../src/${file}`,import.meta.url),"utf8");
test("legacy request form remains isolated, but new checkout uses normal payment verification and server totals",async()=>{
  const form=await read("components/DeliveryQuoteRequestForm.jsx"),checkout=await read("pages/CheckoutPage.jsx");
  assert.match(form,/requestKey:operation.current.key/);assert.match(form,/submitting.current/);
  assert.doesNotMatch(form,/submitWebpayForm|createOnlineOrder|inventory/);
  for(const field of ["recipientName","phone","address","commune","reference","nonUrgent"])assert.ok(form.includes(field));
  assert.doesNotMatch(checkout,/quotePinRequest|DeliveryQuoteRequestForm/);assert.match(checkout,/requestGuestEmailVerification\(normalizedGuestEmail\)/);
  assert.match(checkout,/guestCheckoutEmailIsVerified\(guestEmailVerification/);
  assert.match(checkout,/purpose: "GUEST_CHECKOUT"/);
  assert.doesNotMatch(checkout,/guestEmailVerification.purpose === deliveryType/);
  assert.match(checkout,/quoteFingerprint: quote.quoteFingerprint/);
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
test("commercial settings persist local tariff and strict threshold with review/version control",async()=>{
  const settings=await read("components/DeliverySettingsManager.jsx");
  for(const field of ["flatFee","freeShippingFrom","LOCAL_FIXED","expectedRevisionId"])assert.ok(settings.includes(field));
  assert.match(settings,/if \(!review\)/);assert.match(settings,/Igualar el umbral no concede gratuidad/);
  assert.doesNotMatch(settings,/approvalValidityHours|evaluationValidityHours/);
});
