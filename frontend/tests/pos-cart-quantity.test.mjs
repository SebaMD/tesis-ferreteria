import assert from "node:assert/strict";
import test from "node:test";
import { getPosCartQuantityError } from "../src/helpers/posCartQuantity.js";

test("a temporary empty quantity is invalid, not an implicit one", () => {
  for (const value of ["", " ", null, undefined]) assert.equal(getPosCartQuantityError(value, 20), "Ingresa una cantidad.");
});

test("only positive safe integer quantities within available stock are accepted", () => {
  for (const value of [1, "1", "2", "02", "20"]) assert.equal(getPosCartQuantityError(value, 20), "");
  for (const value of ["-1", "1.5", "1,5", "1e2", "abc", "NaN", "Infinity", "9007199254740992"]) assert.match(getPosCartQuantityError(value, 20), /entero/);
  assert.match(getPosCartQuantityError("0", 20), /mínima/);
  assert.match(getPosCartQuantityError("21", 20), /stock/);
  assert.match(getPosCartQuantityError("1", 0), /stock/);
});

test("checking a draft never mutates its last valid quantity or stock", () => {
  const cart = { quantity: 2, price: 3490, availableStock: 20 };
  const before = JSON.stringify(cart);
  for (const draft of ["", "0", "-1", "1.5", "21", "abc"]) {
    assert.ok(getPosCartQuantityError(draft, cart.availableStock));
    assert.equal(cart.quantity * cart.price, 6980);
    assert.equal(JSON.stringify(cart), before);
  }
});
