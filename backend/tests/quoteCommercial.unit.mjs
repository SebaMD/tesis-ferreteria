import assert from "node:assert/strict";
import { test } from "node:test";
import { commercialQuoteSignature, quoteFingerprint } from "../dist/modules/deliverySettings/deliveryPricing.js";
const item={productId:1,quantity:1,unitPrice:"1000.00",subtotal:"1000.00",discountAmount:"0.00",promotionId:null,promotionTypeSnapshot:null,promotionNameSnapshot:null,promotionValueSnapshot:null};
const quote={revisionId:1,deliveryType:"DELIVERY",items:[item,{...item,productId:2,unitPrice:"2000.00",subtotal:"2000.00"}],fee:3000};
test("technical revisions cannot impersonate a changed commercial contract",()=>{
  const revised={...quote,revisionId:2};assert.notEqual(quoteFingerprint(quote),quoteFingerprint(revised));
  assert.equal(commercialQuoteSignature(quote,{}),commercialQuoteSignature(revised,{}));
  assert.equal(commercialQuoteSignature(quote,{}),commercialQuoteSignature({...quote,items:[...quote.items].reverse()},{}));
});
test("equal totals do not conceal changes to products, quantity, prices, promotion or delivery",()=>{
  const signature=commercialQuoteSignature(quote,{});
  for(const changed of [
    {...quote,items:[{...item,productId:3},quote.items[1]]},
    {...quote,items:[{...item,quantity:2,unitPrice:"500.00"},quote.items[1]]},
    {...quote,items:[{...item,unitPrice:"1500.00",subtotal:"1500.00"},{...quote.items[1],unitPrice:"1500.00",subtotal:"1500.00"}]},
    {...quote,items:[{...item,promotionId:4,promotionTypeSnapshot:"BUY_2_PAY_1"},quote.items[1]]},
    {...quote,deliveryType:"PICKUP"}, {...quote,fee:4000}
  ])assert.notEqual(signature,commercialQuoteSignature(changed,{}));
  assert.notEqual(commercialQuoteSignature(quote,{threshold:5000}),commercialQuoteSignature(quote,{threshold:6000}));
});
