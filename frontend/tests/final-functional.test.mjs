import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [select, app, root, noticeProvider, protectedRoute, clientNavbar, styles] = await Promise.all([
  read("src/components/AppSelect.jsx"),
  read("src/App.jsx"),
  read("src/pages/Root.jsx"),
  read("src/context/CustomerNoticeProvider.jsx"),
  read("src/components/ProtectedRoute.jsx"),
  read("src/components/ClientNavbar.jsx"),
  read("src/styles/styles.css"),
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

console.log("PASS reusable searchable AppSelect accessibility/portal/height contract and migrated native selects");
console.log("PASS worker verification routing, versioned public notice and persisted global theme wiring");
