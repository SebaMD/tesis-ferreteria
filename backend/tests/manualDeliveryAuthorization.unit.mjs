import assert from "node:assert/strict";
import { test } from "node:test";
import { assertApprovedFreight } from "../dist/modules/deliveryQuotes/manualDeliveryAuthorization.js";
const policy={id:1,version:1,pricingMode:"MANUAL_QUOTE",deliveryEnabled:true,conditionalFreeEnabled:true,conditionalFreeFrom:"500000.00"};
const approved={kind:"APPROVED",reason:"PAID_FREIGHT",amount:"7000.00",validUntil:new Date(Date.now()+3600000)};
test("new manual payments require an enabled policy and unexpired explicit approval",()=>{
  assert.doesNotThrow(()=>assertApprovedFreight(policy,approved,false,1000));
  for(const p of [null,{...policy,deliveryEnabled:false},{...policy,pricingMode:null}])assert.throws(()=>assertApprovedFreight(p,approved,false,1000));
  assert.throws(()=>assertApprovedFreight(policy,{...approved,validUntil:new Date(Date.now()-1)},false,1000));
  assert.throws(()=>assertApprovedFreight(policy,{...approved,kind:"PROPOSAL"},false,1000));
});
test("conditional free freight is checked against net products, coordination and current authorization",()=>{
  const free={...approved,amount:"0.00",reason:"FREE_CONDITIONAL",coordinated:true};
  assert.doesNotThrow(()=>assertApprovedFreight(policy,free,true,500000));
  assert.throws(()=>assertApprovedFreight(policy,free,true,499999));
  assert.throws(()=>assertApprovedFreight(policy,free,false,500000));
  assert.throws(()=>assertApprovedFreight(policy,{...free,coordinated:false},true,500000));
  assert.throws(()=>assertApprovedFreight({...policy,conditionalFreeEnabled:false},free,true,500000));
});
