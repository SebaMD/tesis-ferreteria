import assert from "node:assert/strict";
import { test } from "node:test";
import { validateQuoteRequest, validateFreight, validateManualSettings, command } from "../dist/modules/deliveryQuotes/deliveryQuotes.validation.js";
const base=()=>({requestKey:"request-key-isolated-001",items:[{productId:1,quantity:2}],recipientName:"Receptor",phone:"+56911111111",address:"Dirección informada",commune:"Concepción",nonUrgent:true});
test("manual requests accept regional text but never client freight or price authority",()=>{
  assert.equal(validateQuoteRequest(base()).commune,"Concepción");
  for(const mutate of [b=>b.amount=0,b=>b.quoteApproved=true,b=>b.items[0].price=1,b=>b.items[0].quantity=0,b=>b.items.push({...b.items[0]}),b=>b.address="",b=>b.nonUrgent="yes"]){const value=base();mutate(value);assert.throws(()=>validateQuoteRequest(value));}
});
test("manual freight validates CLP and distinct free reasons without a kilometre formula",()=>{
  const p={commandKey:"proposal-operation-0001",expectedVersion:1,amount:100,reason:"PAID_FREIGHT",vehicle:"Camioneta",distanceKm:15,trips:2,routeConfirmed:false,coordinated:false,notes:"Precio propuesto manualmente"};
  assert.equal(validateFreight(p).amount,"100.00");
  for(const mutate of [b=>b.amount=1.5,b=>b.reason="FREE_RADIUS",b=>b.distanceKm=-1,b=>b.trips=0,b=>b.notes=""]){const value={...p};mutate(value);assert.throws(()=>validateFreight(value));}
  assert.equal(validateFreight({...p,amount:0,reason:"FREE_RADIUS",distanceKm:5,routeConfirmed:true}).reason,"FREE_RADIUS");
  assert.throws(()=>validateFreight({...p,amount:0,reason:"FREE_RADIUS",distanceKm:5.1,routeConfirmed:true}));
  assert.throws(()=>validateFreight({...p,amount:0,reason:"FREE_CONDITIONAL"}));
  assert.equal(validateFreight({...p,amount:0,reason:"FREE_EXCEPTION"}).amount,"0.00");
});
test("manual settings have explicit concurrency and provisional configurable defaults, never legacy auto-free",()=>{
  assert.deepEqual(validateManualSettings({expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false}),{expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false,conditionalFreeFrom:"500000.00",approvalValidityHours:24,evaluationValidityHours:72});
  for(const change of [{freeShippingFrom:1},{flatFee:3000},{approvalValidityHours:0},{evaluationValidityHours:721},{conditionalFreeFrom:0}])assert.throws(()=>validateManualSettings({expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false,...change}));
  assert.throws(()=>command({commandKey:"short",expectedVersion:1}));
});
