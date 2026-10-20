import assert from "node:assert/strict";
import { authorizeDemoTarget, DEMO_DATABASE_MARKER, LOCAL_ONCE_PREFIX } from "../dist/db/demo/seedAuthorization.js";

const token = "a".repeat(64);
const url = "postgresql://example:placeholder@localhost:5433/ferreteria";
const pending = { name: "ferreteria", comment: LOCAL_ONCE_PREFIX + token };
assert.equal(authorizeDemoTarget(pending, url, token), "new");
assert.throws(() => authorizeDemoTarget(pending, url, undefined));
assert.throws(() => authorizeDemoTarget(pending, url, "b".repeat(64)));
assert.throws(() => authorizeDemoTarget({ name: "ferreteria", comment: null }, url, token));
for (const invalid of [url.replace(":5433", ":5432"), url.replace("localhost", "remote.example"),
  url.replace("localhost", "127.0.0.1"), url.replace("/ferreteria", "/other"), url + "?host=remote.example"]) {
  assert.throws(() => authorizeDemoTarget(pending, invalid, token));
}
assert.equal(authorizeDemoTarget({ name: "ferreteria", comment: DEMO_DATABASE_MARKER }, url, undefined), "loaded");
assert.equal(authorizeDemoTarget({ name: "ferreteria", comment: DEMO_DATABASE_MARKER }, url, token), "loaded");
assert.equal(authorizeDemoTarget({ name: "fyf_seed_demo_test", comment: null }, undefined, undefined), "new");
assert.throws(() => authorizeDemoTarget({ name: "production", comment: DEMO_DATABASE_MARKER }, url, token));
console.log("PASS excepción local exacta: puerto 5432/remotos/otras bases/reutilización para escribir rechazados; demo existente solo no-op");
