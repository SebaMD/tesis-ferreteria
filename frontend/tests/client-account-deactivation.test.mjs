import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../src/", import.meta.url);

test("client account presents reversible deactivation and never labels it as deletion", async () => {
  const source = await readFile(new URL("pages/ClientAccountPage.jsx", root), "utf8");
  assert.match(source, /Seguridad de la cuenta/);
  assert.match(source, /Desactivar mi cuenta/);
  assert.match(source, /deactivateMyClientAccountRequest/);
  assert.match(source, /clearSession\(\)/);
  assert.doesNotMatch(source, /Eliminar mi cuenta/);
});

test("login routes only the explicit self-deactivation code to secure reactivation", async () => {
  const login = await readFile(new URL("pages/LoginPage.jsx", root), "utf8");
  const reactivation = await readFile(new URL("pages/ClientReactivationPage.jsx", root), "utf8");
  assert.match(login, /CLIENT_SELF_DEACTIVATED/);
  assert.match(login, /reactivate-account/);
  assert.match(reactivation, /requestClientReactivationRequest/);
  assert.match(reactivation, /confirmClientReactivationRequest/);
  assert.match(reactivation, /Reactivar mi cuenta/);
  assert.match(reactivation, /current-password/);
  assert.match(reactivation, /one-time-code/);
});
