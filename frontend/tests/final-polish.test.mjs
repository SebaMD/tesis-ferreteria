import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isValidPassword } from "../src/helpers/password.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("password helper keeps registration and reset rules aligned", () => {
  assert.equal(isValidPassword("Nueva-Clave-2026!"), true);
  for (const invalid of ["short", "sin-mayuscula-2026!", "SIN-NUMERO!", "SinEspecial2026"]) {
    assert.equal(isValidPassword(invalid), false);
  }
});

test("auth and post-registration UX expose recovery and direct PIN/later paths", async () => {
  const [app, login, register, verification, account, navbar] = await Promise.all([
    read("src/App.jsx"), read("src/pages/LoginPage.jsx"), read("src/pages/RegisterPage.jsx"),
    read("src/pages/ClientEmailVerificationPage.jsx"), read("src/pages/ClientAccountPage.jsx"),
    read("src/components/ClientNavbar.jsx"),
  ]);
  assert.match(app, /forgot-password/);
  assert.match(app, /reset-password/);
  assert.match(login, /¿Olvidaste tu contraseña\?/);
  assert.match(register, /fromRegistration: true/);
  assert.match(register, /postRegistrationNavigationPending = true/);
  assert.match(verification, /Tu cuenta fue creada con éxito/);
  assert.match(verification, /initialChallenge/);
  assert.match(verification, /Ingresa el código de 6 dígitos enviado al crear tu cuenta/);
  assert.match(verification, /Verificar más tarde/);
  assert.match(account, /pendiente de verificación/);
  assert.match(navbar, /correo pendiente de verificación/);
});

test("checkout, success navigation, clean catalog and warehouse shortcut are wired", async () => {
  const [checkout, result, guest, catalog, card, controls, cartActions, dashboard, favorites, orders] = await Promise.all([
    read("src/pages/CheckoutPage.jsx"), read("src/pages/PaymentResultPage.jsx"),
    read("src/pages/GuestOrderTrackingPage.jsx"), read("src/pages/CatalogPage.jsx"),
    read("src/components/ProductCard.jsx"), read("src/components/ProductPurchaseControls.jsx"),
    read("src/hooks/useCartActions.js"), read("src/pages/DashboardPage.jsx"), read("src/pages/FavoritesPage.jsx"),
    read("src/pages/ClientOrdersPage.jsx"),
  ]);
  assert.doesNotMatch(checkout, /handleRemoveProduct|Trash2/);
  assert.match(checkout, /vuelve al carrito antes de pagar/);
  assert.match(result, /Ir a mis compras/);
  assert.match(guest, /Ir a mis compras/);
  assert.match(catalog, /max-\[600px\]:gap-2\.5/);
  assert.match(card, /en el carrito/);
  assert.doesNotMatch(controls, /En tu carrito:/);
  assert.match(controls, /Comprar ahora/);
  assert.doesNotMatch(catalog, /fondo-login|CATALOG_BACKGROUND_IMAGE|catalog-background/);
  assert.match(dashboard, /Pedidos y repartos/);
  assert.match(dashboard, /operationalOrders\.length/);
  assert.match(favorites, /font-bold text-rust-600/);
  assert.match(controls, /showSuccessToast: false/);
  assert.match(cartActions, /if \(showSuccessToast\) toast\.success/);
  assert.match(card, /max-\[600px\]:hidden/);
  assert.match(favorites, /products\.length > 0/);
  assert.match(favorites, /Explorar catálogo/);
  assert.match(orders, /orders\.length > 0/);
  assert.match(orders, /Explorar catálogo/);
});

test("mobile list controls keep global queries visible and secondary filters grouped", async () => {
  const [sales, logistics, reports, products, users, dashboard] = await Promise.all([
    read("src/pages/SalesPage.jsx"), read("src/pages/OnlineOrdersManagementPage.jsx"),
    read("src/pages/ReportsPage.jsx"), read("src/pages/ProductsPage.jsx"),
    read("src/pages/UsersPage.jsx"), read("src/pages/DashboardPage.jsx"),
  ]);
  assert.match(sales, /max-w-(?:\[536px\]|134)/);
  assert.match(logistics, /Mostrar pedidos entregados/);
  assert.match(logistics, /Mostrar pedidos en curso/);
  assert.doesNotMatch(logistics, /label: "En curso"/);
  assert.doesNotMatch(logistics, /label: "Entregados"/);
  assert.doesNotMatch(logistics, /<label>Buscar pedido/);
  assert.match(reports, /Período del reporte/);
  assert.doesNotMatch(reports, /title="Filtros del reporte"/);
  assert.doesNotMatch(products, /<label>Buscar movimientos/);
  assert.doesNotMatch(users, /MobileTableTools/);
  assert.match(users, /Filtrar usuarios por rol/);
  assert.match(dashboard, /auto-rows-fr/);
});

test("mobile table counts, exclusive quick filters and compact commerce layouts stay wired", async () => {
  const [count, products, sales, orderCard, cart] = await Promise.all([
    read("src/components/TableRecordCount.jsx"), read("src/pages/ProductsPage.jsx"),
    read("src/pages/SalesPage.jsx"), read("src/components/orders/OrderSummaryCard.jsx"),
    read("src/pages/ClientCartPage.jsx"),
  ]);
  assert.match(count, /max-\[720px\]:hidden/);
  assert.match(count, /Mostrando \{mobileVisibleCount\} de \{mobileTotalCount\}/);
  assert.match(products, /setLowStockOnly\(\(current\) => !current\); setShowInactiveProducts\(false\); setOutOfStockOnly\(false\)/);
  assert.match(products, /setOutOfStockOnly\(\(current\) => !current\); setShowInactiveProducts\(false\); setLowStockOnly\(false\)/);
  assert.doesNotMatch(sales, /disabled=\{salesFilter === "cancelled"\} aria-pressed=\{salesFilter === "partial"\}>\{salesFilter/);
  assert.match(orderCard, /max-\[680px\]:size-20/);
  assert.match(orderCard, /max-\[430px\]:size-\[68px\]/);
  assert.match(cart, /col-start-2 row-start-1 row-span-2/);
});

test("product detail keeps its quantity and purchase actions in one aligned column", async () => {
  const [detail, controls] = await Promise.all([
    read("src/pages/ProductDetailPage.jsx"),
    read("src/components/ProductPurchaseControls.jsx"),
  ]);
  assert.match(detail, /mx-auto w-full max-w-md/);
  assert.match(controls, /showBuyNow \? "grid justify-items-center gap-2"/);
  assert.match(controls, /<div className="grid gap-2">/);
  assert.match(controls, /showSuccessToast: false/);
});
