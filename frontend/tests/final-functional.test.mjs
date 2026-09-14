import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [select, app, root, noticeProvider, protectedRoute, clientNavbar, styles, navbar, dashboard, account, login, register, internalVerification, themeProvider] = await Promise.all([
  read("src/components/AppSelect.jsx"),
  read("src/App.jsx"),
  read("src/pages/Root.jsx"),
  read("src/context/CustomerNoticeProvider.jsx"),
  read("src/components/ProtectedRoute.jsx"),
  read("src/components/ClientNavbar.jsx"),
  read("src/styles/styles.css"),
  read("src/components/Navbar.jsx"),
  read("src/pages/DashboardPage.jsx"),
  read("src/pages/ClientAccountPage.jsx"),
  read("src/pages/LoginPage.jsx"),
  read("src/pages/RegisterPage.jsx"),
  read("src/pages/InternalEmailVerificationPage.jsx"),
  read("src/context/ThemeProvider.jsx"),
]);

assert.match(select, /options\.length > 6/);
assert.match(select, /normalize\("NFD"\)/);
for (const key of ["Tab", "ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.match(select, new RegExp(key));
for (const role of ["combobox", "listbox", "option"]) assert.match(select, new RegExp(`role=\\"${role}\\"`));
assert.match(select, /OPTION_HEIGHT \* 5\.5/);
assert.match(select, /createPortal/);
assert.doesNotMatch(await read("src/pages/CatalogPage.jsx"), /<select/);
assert.doesNotMatch(await read("src/pages/UsersPage.jsx"), /<select/);
assert.doesNotMatch(await read("src/pages/ProductsPage.jsx"), /<select/);
assert.doesNotMatch(await read("src/pages/SalesPage.jsx"), /<select/);
assert.doesNotMatch(await read("src/pages/OnlineOrdersManagementPage.jsx"), /<select/);

assert.match(app, /verify-work-email/);
assert.match(protectedRoute, /requiresEmailVerification/);
assert.match(root, /ThemeProvider/);
assert.match(root, /CustomerNoticeProvider/);
assert.match(noticeProvider, /sessionStorage/);
assert.match(noticeProvider, /current\.version !== dismissedVersion/);
assert.match(clientNavbar, /Información de la ferretería/);
assert.match(styles, /\.dark \.app-select-popup/);
assert.match(styles, /customer-notice-panel/);
assert.match(navbar, /CustomerNoticeManager/);
assert.match(navbar, /Administrar aviso a clientes/);
assert.match(navbar, /Abrir mi perfil/);
assert.match(navbar, /ThemeToggle showLabel/);
assert.doesNotMatch(dashboard, /CustomerNoticeManager/);
assert.match(account, /Mi perfil/);
assert.match(account, /Mi dirección/);
assert.match(account, /updateMyClientProfileRequest/);
assert.match(account, /saveClientDeliveryAddressRequest/);
assert.match(account, /deleteClientDeliveryAddressRequest/);
assert.match(account, /ThemeToggle showLabel/);
for (const page of [login, register, internalVerification, await read("src/pages/ForgotPasswordPage.jsx"), await read("src/pages/ResetPasswordPage.jsx")]) {
  assert.doesNotMatch(page, /AuthThemeToggle|ThemeToggle/);
}
assert.match(login, /Correo electrónico o RUT/);
assert.match(internalVerification, /readInternalVerificationChallenge/);
assert.doesNotMatch(internalVerification, /useEffect/);
assert.match(themeProvider, /fyf-theme:user:/);
assert.match(themeProvider, /return "light"/);

const { isValidRut, normalizeRut } = await import("../src/helpers/rut.js");
const { normalizeChileanMobilePhone } = await import("../src/helpers/phone.js");
for (const variant of ["10.120.345-k", "10120345k", "10120345-K", "10 120 345 K"]) {
  assert.equal(normalizeRut(variant), "10120345-K");
  assert.equal(isValidRut(variant), true);
}
assert.equal(isValidRut("10120345-1"), false);
assert.equal(normalizeChileanMobilePhone("9 1234 5678"), "+56912345678");

console.log("PASS reusable searchable AppSelect accessibility/portal/height contract and migrated native selects");
console.log("PASS worker verification routing, versioned public notice and persisted global theme wiring");
console.log("PASS centralized RUT/phone helpers, relocated notice/theme controls and client account sections");
