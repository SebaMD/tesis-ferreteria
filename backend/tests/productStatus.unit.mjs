import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductRevision } from "../dist/modules/products/products.service.js";
test("optional product revision is a strict quoted timestamp, never product data",()=>{
 const stamp="2026-10-22T10:15:30.123Z";assert.equal(parseProductRevision(JSON.stringify(stamp)),stamp);assert.equal(parseProductRevision(undefined),undefined);
 for(const bad of ["invalid",'"not-a-date"','123','"2026-10-22"','{}'])assert.throws(()=>parseProductRevision(bad),/inválida/);
});
