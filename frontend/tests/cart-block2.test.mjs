import assert from "node:assert/strict";
import { test } from "node:test";
import { getDisplayUnit, formatQuantityWithUnit, UNIT_PLURALS } from "../src/helpers/units.js";
import { UNIT_OPTIONS } from "../src/helpers/options.js";
import { getRemainingCartCapacity, validateCartQuantity } from "../src/helpers/cartQuantity.js";
import { createCartRemovalUndo } from "../src/helpers/cartUndo.js";

test("units: known singular/plural pairs, invariant symbols and custom units", () => {
  for (const [single, plural] of Object.entries(UNIT_PLURALS)) {
    assert.equal(getDisplayUnit(1, single), single);
    assert.equal(getDisplayUnit(2, single), plural);
    assert.equal(getDisplayUnit(1, plural), single);
    assert.equal(getDisplayUnit(0, single), plural);
  }
  for (const unit of ["kg", "g", "ml", "cm", "mm", "m", "m²", "m³", "unidad personalizada", "constructor", "__proto__"]) {
    assert.equal(getDisplayUnit(1, unit), unit);
    assert.equal(getDisplayUnit(20, unit), unit);
  }
  for (const unit of UNIT_OPTIONS) assert.ok(getDisplayUnit(2, unit));
  assert.equal(formatQuantityWithUnit(20, "caja"), "20 cajas");
  assert.equal(getDisplayUnit(2, " GALÓN "), "galones");
});

test("additions: available stock minus units already in cart", () => {
  assert.equal(validateCartQuantity(1, getRemainingCartCapacity(10, 0)).valid, true);
  assert.equal(validateCartQuantity(5, getRemainingCartCapacity(10, 0)).valid, true);
  assert.equal(validateCartQuantity(11, getRemainingCartCapacity(10, 0)).valid, false);
  assert.equal(validateCartQuantity(4, getRemainingCartCapacity(10, 7)).valid, false);
  assert.equal(validateCartQuantity(3, getRemainingCartCapacity(10, 7)).valid, true);
  assert.equal(validateCartQuantity(1, getRemainingCartCapacity(3, 7)).valid, false);
  // Reservations are reflected by availableStock, never bypassed using currentStock.
  assert.equal(getRemainingCartCapacity(2, 2), 0);
});

function removalFixture(overrides = {}) {
  const state = { active: true, stock: 10, present: false, calls: 0, additions: [] };
  const undo = createCartRemovalUndo({
    item: { product: { id: 1 }, quantity: 5 },
    isCurrentContext: () => state.active,
    loadProduct: async () => { state.calls += 1; return { id: 1, availableStock: state.stock, currentStock: 100 }; },
    hasProduct: () => state.present,
    addItem: (product, quantity) => { state.additions.push({ product, quantity }); state.present = true; return { success: true }; },
    ...overrides,
  });
  return { state, undo };
}

test("undo: fresh product, exact quantity, one use including simultaneous clicks", async () => {
  const { state, undo } = removalFixture();
  const results = await Promise.all([undo(), undo()]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(state.calls, 1);
  assert.equal(state.additions.length, 1);
  assert.equal(state.additions[0].quantity, 5);
});

test("undo: insufficient availability never restores a partial quantity", async () => {
  const { state, undo } = removalFixture();
  state.stock = 4;
  assert.equal((await undo()).success, false);
  assert.equal(state.additions.length, 0);
});

test("undo: different cart session rejected before AND after asynchronous load", async () => {
  const before = removalFixture();
  before.state.active = false;
  assert.equal((await before.undo()).success, false);
  assert.equal(before.state.calls, 0);
  let resolveProduct;
  const after = removalFixture({ loadProduct: () => new Promise((resolve) => { resolveProduct = resolve; }) });
  const pending = after.undo();
  after.state.active = false;
  resolveProduct({ id: 1, availableStock: 10 });
  assert.equal((await pending).success, false);
  assert.equal(after.state.additions.length, 0);
});

test("undo: inactive/missing/wrong product, network failure and already re-added item", async () => {
  for (const product of [null, { id: 2, availableStock: 10 }, { id: 1, status: false, availableStock: 10 }]) {
    const { state, undo } = removalFixture({ loadProduct: async () => product });
    assert.equal((await undo()).success, false);
    assert.equal(state.additions.length, 0);
  }
  const network = removalFixture({ loadProduct: async () => { throw new Error("offline"); } });
  assert.equal((await network.undo()).success, false);
  assert.equal(network.state.additions.length, 0);
  const readded = removalFixture();
  readded.state.present = true;
  assert.equal((await readded.undo()).success, false);
  assert.equal(readded.state.additions.length, 0);
});
