import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CART_UNDO_DURATION, createCartRemovalUndo, prepareCartRestoration } from "../src/helpers/cartUndo.js";

function fixture() {
  const original = [1, 2].map(id => ({ product: { id, price: 100 }, quantity: id + 1 }));
  const state = { items: [], time: 0, active: true, writes: 0, loads: 0 };
  const options = {
    items: original,
    now: () => state.time,
    isCurrentContext: () => state.active,
    loadProduct: async id => { state.loads++; return { id, price: 200, availableStock: 20, status: true }; },
    restoreItems: removed => {
      const result = prepareCartRestoration(state.items, removed);
      if (result.success) { state.items = result.items; state.writes++; }
      return result;
    },
  };
  return { original, state, options };
}

test("clear undo restores exact IDs/quantities once, using fresh catalog prices in a single write", async () => {
  const { state, options } = fixture();
  const undo = createCartRemovalUndo(options);
  const results = await Promise.all([undo(), undo()]);
  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(state.writes, 1);
  assert.equal(state.loads, 2);
  assert.deepEqual(state.items.map(item => [item.product.id, item.quantity, item.product.price]), [[1, 2, 200], [2, 3, 200]]);
});

test("clear undo preserves later additions, including quantities of the same SKU", async () => {
  const { state, options } = fixture();
  const undo = createCartRemovalUndo(options);
  state.items = [{ product: { id: 1, price: 300 }, quantity: 7 }, { product: { id: 3 }, quantity: 1 }];
  assert.equal((await undo()).preservedCount, 1);
  assert.deepEqual(state.items.map(item => [item.product.id, item.quantity]), [[1, 7], [3, 1], [2, 3]]);
  assert.equal(state.items[0].product.price, 300);
});

test("clear undo checks additions made while its catalog requests are pending", async () => {
  const { state, options } = fixture();
  let release;
  const loaded = new Promise(resolve => { release = resolve; });
  const undo = createCartRemovalUndo({ ...options, loadProduct: async id => { await loaded; return options.loadProduct(id); } });
  const pending = undo();
  state.items = [{ product: { id: 2 }, quantity: 9 }];
  release();
  assert.equal((await pending).success, true);
  assert.equal(state.items.find(item => item.product.id === 2).quantity, 9);
  assert.equal(state.items.length, 2);
});

test("expired undo, including a request that completes too late, does not write", async () => {
  const { state, options } = fixture();
  const expired = createCartRemovalUndo(options);
  state.time = CART_UNDO_DURATION;
  assert.equal((await expired()).success, false);
  assert.equal(state.loads, 0);
  state.time = 0;
  const late = createCartRemovalUndo({ ...options, loadProduct: async id => {
    state.time = CART_UNDO_DURATION;
    return options.loadProduct(id);
  } });
  assert.equal((await late()).success, false);
  assert.equal(state.writes, 0);
});

test("logout, another clear, purchase or external cart replacement invalidates pending undo", async () => {
  for (const timing of ["before", "during"]) {
    const { state, options } = fixture();
    const undo = createCartRemovalUndo({ ...options, loadProduct: async id => {
      state.active = false;
      return options.loadProduct(id);
    } });
    if (timing === "before") state.active = false;
    assert.equal((await undo()).success, false);
    assert.equal(state.writes, 0);
  }
});

test("missing, inactive, in-store-only or insufficient products prevent partial restoration", async () => {
  for (const product of [null, { id: 999 }, { id: 2, status: false, availableStock: 20 }, { id: 2, inStoreOnly: true, availableStock: 20 }, { id: 2, availableStock: 2 }]) {
    const { state, options } = fixture();
    const undo = createCartRemovalUndo({ ...options, loadProduct: id => id === 2 ? product : options.loadProduct(id) });
    assert.equal((await undo()).success, false);
    assert.deepEqual(state.items, []);
    assert.equal(state.writes, 0);
  }
});

test("network/storage failures leave the undo consumed and do not replace later additions", async () => {
  for (const overrides of [
    { loadProduct: async () => { throw Error("offline"); } },
    { restoreItems: () => { throw Error("storage full"); } },
    { isCurrentContext: () => { throw Error("storage unavailable"); } },
  ]) {
    const { state, options } = fixture();
    state.items = [{ product: { id: 3 }, quantity: 4 }];
    const undo = createCartRemovalUndo({ ...options, ...overrides });
    assert.equal((await undo()).success, false);
    assert.equal((await undo()).success, false);
    assert.deepEqual(state.items, [{ product: { id: 3 }, quantity: 4 }]);
    assert.equal(state.writes, 0);
  }
});

test("undo snapshots IDs and quantities, not later mutations of the removed items", async () => {
  const { original, state, options } = fixture();
  const undo = createCartRemovalUndo(options);
  original[0].quantity = 18;
  original[0].product.id = 9;
  assert.equal((await undo()).success, true);
  assert.equal(state.items[0].product.id, 1);
  assert.equal(state.items[0].quantity, 2);
});

test("all re-added products are preserved without duplicates or a redundant write", async () => {
  const { state, options } = fixture();
  const undo = createCartRemovalUndo(options);
  state.items = [1, 2].map(id => ({ product: { id }, quantity: 8 }));
  assert.equal((await undo()).success, false);
  assert.equal(state.writes, 0);
  assert.deepEqual(state.items.map(item => item.quantity), [8, 8]);
});

test("single removal and full clear share Sonner, duration and owner-scoped persistent cart", async () => {
  const read = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");
  const hook = await read("hooks/useCartActions.js"), provider = await read("context/CartProvider.jsx");
  assert.match(hook, /offerUndo\(removeItem\(productId\)/);
  assert.match(hook, /offerUndo\(clearCart\(\), "Carrito vaciado"/);
  assert.match(hook, /duration: CART_UNDO_DURATION/);
  assert.match(await read("pages/ClientCartPage.jsx"), /onClick=\{clearProducts\}/);
  assert.match(provider, /const removedItems = itemsRef.current;\s*contextVersion.current \+= 1;\s*saveItems\(\[\]\)/);
  assert.match(provider, /if \(result.success\) saveItems\(result.items\)/);
  assert.match(provider, /active.current && contextVersion.current === version/);
  assert.match(provider, /localStorage.getItem\("token"\) === sessionToken && localStorage.getItem\("user"\) === sessionUser/);
  assert.match(provider, /localStorage.getItem\(storageKey\) === JSON.stringify\(itemsRef.current\)/);
  assert.match(provider, /client_\$\{user.id\}/);
  assert.match(provider, /key=\{`\$\{storageKey\}/);
});

test("information return links are borderless and transparent with orange hover and visible focus", async () => {
  const source = await readFile(new URL("../src/components/InformationNavigation.jsx", import.meta.url), "utf8");
  assert.match(source, /<CompactBackLink \{\.\.\.back\}/);
  const styles = await readFile(new URL("../src/styles/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.compact-back-link \{[^}]*color: var\(--color-rust-600\)[^}]*text-decoration: none/s);
  assert.match(styles, /\.compact-back-link:focus-visible/);
  assert.doesNotMatch(styles.match(/\.compact-back-link \{[^}]*\}/s)[0], /border:|background:/);
});
