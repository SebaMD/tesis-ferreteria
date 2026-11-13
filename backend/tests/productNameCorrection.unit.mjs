import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProductNameCorrection } from "../dist/modules/products/productNameCorrection.service.js";
const valid = {name:"  Nombre   descriptivo ",reason:"Corrección descriptiva",expectedRevision:"2026-10-27T12:00:00.000Z",operationKey:"12345678-1234-1234-1234-123456789012",confirmed:true};
test("name correction normalizes text but retains explicit revision and idempotency key",()=>{assert.equal(validateProductNameCorrection(valid).name,"Nombre descriptivo");assert.equal(validateProductNameCorrection(valid).expectedRevision,valid.expectedRevision);});
test("name correction rejects invalid names, reasons, unconfirmed semantic changes and unrelated payload fields",()=>{for(const b of [{name:"x"},{name:""},{name:"a\nb"},{name:"x".repeat(151)},{reason:"corto"},{confirmed:false},{unitMeasure:"caja"},{expectedRevision:"bad"}])assert.throws(()=>validateProductNameCorrection({...valid,...b}));});
