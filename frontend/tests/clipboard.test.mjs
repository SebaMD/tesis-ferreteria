import assert from "node:assert/strict";
import test from "node:test";
import { copyText } from "../src/helpers/clipboard.js";

async function withClipboard({ modern, result = true, throws = false, command = true, busy = false }, check) {
  const saved = Object.fromEntries(["navigator", "document", "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const state = { modern: [], copied: [], nodes: [], focused: null, restoredRanges: [], frames: [] };
  const previousRange = { cloneRange: () => previousRange };
  const selection = { rangeCount: 1, getRangeAt: () => previousRange, removeAllRanges() {}, addRange: range => state.restoredRanges.push(range) };
  const container = { appendChild: node => state.nodes.push(node) };
  const focus = { isConnected: true, disabled: busy, closest: () => container, focus(options) { assert.equal(options.preventScroll, true); state.focused = focus; } };
  state.clearBusy = () => { focus.disabled = false; state.frames.forEach(callback => callback()); };
  const document = {
    activeElement: focus, body: container,
    createElement(tag) {
      assert.equal(tag, "textarea");
      return { style: {}, setAttribute() {}, focus(options) { assert.equal(options.preventScroll, true); }, select() {},
        setSelectionRange(start, end) { assert.equal(start, 0); assert.equal(end, this.value.length); },
        remove() { state.nodes.splice(state.nodes.indexOf(this), 1); } };
    },
    ...(command ? { execCommand(name) {
      assert.equal(name, "copy");
      if (throws) throw new Error("Copy blocked");
      if (result) state.copied.push(state.nodes[0].value);
      return result;
    } } : {}),
  };
  const navigator = modern ? { clipboard: { async writeText(text) { state.modern.push(text); return modern(text); } } } : {};
  for (const [key, value] of Object.entries({ navigator, document, window: { getSelection: () => selection, requestAnimationFrame: callback => state.frames.push(callback) } })) Object.defineProperty(globalThis, key, { configurable: true, value });
  try { await check(state); }
  finally { for (const key of Object.keys(saved)) if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; }
}

test("modern copy preserves text and does not create a temporary selection", async () => {
  await withClipboard({ modern: () => {} }, async state => {
    await copyText("Ficha Ñandú\nMonto: $3.490");
    assert.deepEqual(state.modern, ["Ficha Ñandú\nMonto: $3.490"]);
    assert.deepEqual(state.copied, []); assert.deepEqual(state.nodes, []);
  });
});

test("missing Clipboard API falls back to a real selection and restores focus/ranges", async () => {
  await withClipboard({}, async state => {
    await copyText("Ficha\nSegunda línea");
    assert.deepEqual(state.copied, ["Ficha\nSegunda línea"]);
    assert.deepEqual(state.nodes, []); assert.ok(state.focused); assert.equal(state.restoredRanges.length, 1);
  });
});

test("a denied modern write falls back without changing its text", async () => {
  await withClipboard({ modern: () => { throw new Error("NotAllowedError"); } }, async state => {
    await copyText("Texto exacto");
    assert.deepEqual(state.modern, ["Texto exacto"]); assert.deepEqual(state.copied, ["Texto exacto"]);
  });
});

test("focus returns after an asynchronously denied copy clears the button busy state", async () => {
  await withClipboard({ busy: true, modern: () => { throw new Error("NotAllowedError"); } }, async state => {
    await copyText("Texto exacto");
    assert.equal(state.focused, null); assert.equal(state.frames.length, 1);
    state.clearBusy(); assert.ok(state.focused); assert.deepEqual(state.nodes, []);
  });
});

for (const options of [{ result: false }, { throws: true }, { command: false }]) {
  test(`failed fallback rejects and removes temporary elements: ${JSON.stringify(options)}`, async () => {
    await withClipboard(options, async state => {
      await assert.rejects(copyText("No se debe indicar éxito"));
      assert.deepEqual(state.copied, []); assert.deepEqual(state.nodes, []); assert.ok(state.focused);
    });
  });
}
