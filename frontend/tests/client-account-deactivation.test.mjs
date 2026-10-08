import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../src/", import.meta.url);

test("client account presents reversible deactivation and never labels it as deletion", async () => {
  const [source, httpClient] = await Promise.all([
    readFile(new URL("pages/ClientAccountPage.jsx", root), "utf8"),
    readFile(new URL("api/httpClient.js", root), "utf8"),
  ]);
  assert.match(source, /Seguridad de la cuenta/);
  assert.match(source, /Desactivar mi cuenta/);
  assert.match(source, /deactivateMyClientAccountRequest/);
  assert.match(source, /clearSession\(\)/);
  assert.match(source, /deactivationError/);
  assert.match(source, /setDeactivationPassword\(""\)/);
  assert.match(source, /client-deactivation-error/);
  assert.match(httpClient, /status === 401/);
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

test("deactivation button uses defined theme tokens with dark text in light mode", async () => {
  const [account, styles] = await Promise.all([
    readFile(new URL("pages/ClientAccountPage.jsx", root), "utf8"),
    readFile(new URL("styles/styles.css", root), "utf8"),
  ]);
  const button = account.match(/<button[^\n]*>Desactivar mi cuenta<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /border-critical-600 bg-white text-ink-950 hover:bg-critical-50/);
  assert.doesNotMatch(button, /text-white|text-critical-700/);
  assert.match(button, /setDeactivationOpen\(true\)/);
  assert.match(styles, /--color-ink-950: #10151f/);
  assert.match(styles, /\.dark \.bg-white[\s\S]*background-color: #171e28 !important/);
  assert.match(styles, /\.dark \.text-ink-950[\s\S]*color: #eef1f4 !important/);
});
