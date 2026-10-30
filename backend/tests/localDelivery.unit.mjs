import {test} from 'node:test';import assert from 'node:assert/strict';
import {calculateDelivery,publicDeliveryInformation,deliveryBenefit} from '../dist/modules/deliverySettings/deliveryPricing.js';
import {validateDeliverySettings} from '../dist/modules/deliverySettings/deliverySettings.service.js';
import {canonicalizeDeliveryCommune} from '../dist/utils/delivery.js';
const p={id:1,version:1,pickupEnabled:true,deliveryEnabled:true,pricingMode:'LOCAL_FIXED',flatFee:'3000.00',freeShippingFrom:'500000.00',minimumProductsTotal:null,isDemo:false};
test('local freight uses strictly greater net subtotal; no automatic equivalence with legacy manual policy',()=>{
 for(const [net,fee]of [[45000,3000],[500000,3000],[500001,0]])assert.equal(calculateDelivery(p,'DELIVERY',net).fee,fee);
 assert.equal(calculateDelivery(p,'PICKUP',999999).fee,0);assert.equal(calculateDelivery(p,'DELIVERY',450000).fee,3000);
 assert.equal(deliveryBenefit(p,'DELIVERY',500000).remaining,1);assert.equal(publicDeliveryInformation(p).onlineQuoteRequestsEnabled,false);
 assert.throws(()=>calculateDelivery({...p,pricingMode:'MANUAL_QUOTE'},'DELIVERY',600000));
 assert.throws(()=>calculateDelivery({...p,deliveryEnabled:false},'DELIVERY',1));
});
test('local revision validation and structured commune do not accept substring addresses or client fee values',()=>{
 const body={expectedRevisionId:1,pricingMode:'LOCAL_FIXED',pickupEnabled:true,deliveryEnabled:true,flatFee:3000,minimumProductsTotal:null,freeShippingFrom:500000,isDemo:false};
 assert.equal(validateDeliverySettings(body).pricingMode,'LOCAL_FIXED');assert.throws(()=>validateDeliverySettings({...body,isDemo:true}));
 for(const value of ['Concepción','Dirección en Santa Juana','Santa Juana otra comuna'])assert.equal(canonicalizeDeliveryCommune(value),null);
 assert.equal(canonicalizeDeliveryCommune(' santa   juana '),'Santa Juana');
});
