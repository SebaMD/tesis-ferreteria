import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('new checkout has structured local destination and a definitive server summary before Webpay',async()=>{
 const page=await read('pages/CheckoutPage.jsx');
 for(const field of ['deliveryRecipientName','deliveryPhone','deliveryAddress','deliveryReference','deliveryCommune:DELIVERY_COMMUNE','destinationValid','quoteFingerprint: quote.quoteFingerprint','<OrderAmounts order={displayQuote}'])assert.ok(page.includes(field),field);
 assert.doesNotMatch(page,/DeliveryQuoteRequestForm|quotePinRequest|Por cotizar|distanceKm|navigator.geolocation/);
 assert.match(page,/quoteOnlineOrderRequest\(\{ items: selectedItems, deliveryType,/);assert.match(page,/&& !quoteState.needsAcceptance/);
 assert.doesNotMatch(page.slice(page.indexOf('const checkoutData ='),page.indexOf('const payment =',page.indexOf('const checkoutData ='))),/deliveryFee:|total:/);
 const amounts=await read('components/orders/OrderAmounts.jsx');
 assert.match(page,/<OrderAmounts order=\{displayQuote\} checkout provisional=\{!quote\}/);
 assert.ok(amounts.indexOf('key: "productsNet"')<amounts.indexOf('key: "deliveryFee"'));
 assert.ok(amounts.indexOf('key: "deliveryFee"')<amounts.indexOf('key: "total"'));
});
test('tariff settings use existing versioned endpoint, explicit activation and strict threshold wording',async()=>{
 const settings=await read('components/DeliverySettingsManager.jsx');assert.match(settings,/pricingMode:'LOCAL_FIXED'/);assert.match(settings,/flatFee:3000,freeShippingFrom:500000/);assert.match(settings,/api.put\('\/delivery-settings'/);assert.match(settings,/expectedRevisionId:current\?\.id\?\?null/);assert.match(settings,/Igualar el umbral no concede gratuidad/);
});
