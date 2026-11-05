// Browser-only fixture: real components, synthetic identities and intercepted API.
/* eslint-disable react-refresh/only-export-components -- standalone test entry, never imported by the app */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import AuthContext from "../../src/context/AuthContext.js";
import CartContext from "../../src/context/CartContext.js";
import CheckoutDraftContext from "../../src/context/CheckoutDraftContext.js";
import CustomerNoticeContext from "../../src/context/CustomerNoticeContext.js";
import FavoritesContext from "../../src/context/FavoritesContext.js";
import ThemeContext from "../../src/context/ThemeContext.js";
import ClientScrollRestoration from "../../src/components/ClientScrollRestoration.jsx";
import ClientLayout from '../../src/components/ClientLayout.jsx';
import DeliverySettingsManager from '../../src/components/DeliverySettingsManager.jsx';
import ClientCartPage from '../../src/pages/ClientCartPage.jsx';
import ProductFamilyPage from '../../src/pages/ProductFamilyPage.jsx';
import { Toaster } from 'sonner';
import ProductsPage from "../../src/pages/ProductsPage.jsx";
import GuestDeviceOrdersPage from "../../src/pages/GuestDeviceOrdersPage.jsx";
import CatalogPage from "../../src/pages/CatalogPage.jsx";
import ProductDetailPage from "../../src/pages/ProductDetailPage.jsx";
import ProductAuditHistoryPage from "../../src/pages/ProductAuditHistoryPage.jsx";
import SalesPage from "../../src/pages/SalesPage.jsx";
import UsersPage from "../../src/pages/UsersPage.jsx";
import ReportsPage from "../../src/pages/ReportsPage.jsx";
import OnlineOrdersManagementPage from "../../src/pages/OnlineOrdersManagementPage.jsx";
import PaymentResultPage from "../../src/pages/PaymentResultPage.jsx";
import GuestOrderTrackingPage from "../../src/pages/GuestOrderTrackingPage.jsx";
import ReturnsInformationPage from "../../src/pages/ReturnsInformationPage.jsx";
import FavoritesPage from "../../src/pages/FavoritesPage.jsx";
import ClientOrdersPage from "../../src/pages/ClientOrdersPage.jsx";
import ClientAccountPage from "../../src/pages/ClientAccountPage.jsx";
import { createCheckoutDraftStore } from "../../src/helpers/checkoutDraft.js";
import MobileTableTools from "../../src/components/MobileTableTools.jsx";
import ProductPurchaseControls from "../../src/components/ProductPurchaseControls.jsx";
import ProductBundleEditor from "../../src/components/ProductBundleEditor.jsx";
import CatalogNoticeCarousel from "../../src/components/CatalogNoticeCarousel.jsx";
import CheckoutChoicePage from "../../src/pages/CheckoutChoicePage.jsx";
import CheckoutPage from "../../src/pages/CheckoutPage.jsx";
import DeliveryConditionsPage from "../../src/pages/DeliveryConditionsPage.jsx";
import { InformationLink } from "../../src/components/InformationNavigation.jsx";
import "../../src/styles/styles.css";

const params = new URLSearchParams(location.pathname === "/ux-test" ? location.search : sessionStorage.getItem("ux-fixture-parameters"));
if (location.pathname === "/ux-test") {
  sessionStorage.setItem("ux-fixture-parameters", location.search);
  history.replaceState({ usr: { productDetailOrigin: { source: "favorites" } } }, "", params.get('case') === 'payment' ? '/payment-result?orderId=10' : params.get('case') === 'tracking' ? `/guest-order#token=${'t'.repeat(43)}` : params.get('case') === 'audit' ? '/products/administrative-changes' : ['scroll', 'journey'].includes(params.get('case')) ? "/catalog" : "/catalog/families/18?variant=99");
}
const mode = params.get("case");
const guest = params.has("guest");
const product = { id: 99, name: "Producto de prueba", price: 5990, currentStock: 20, availableStock: 20, unitMeasure: "unidad", status: true, images: [] };
const cart = params.has('empty-cart') ? [] : [{ product: { ...product, id: 5 }, quantity: 4 }];
const auth = { isAuthenticated: !guest, user: guest ? null : { id: 1, role: mode === 'settings' ? params.has('manager') ? 'MANAGER' : 'ADMIN' : ["bundle", "inventory", "audit", "sales", "users", "reports", "orders"].includes(mode) ? "ADMIN" : "CLIENT", names: "Cliente", surnames: "Prueba", emailVerified: true }, replaceSession() {} };
const forbiddenMutation = () => { throw new Error("Compra directa modificó el carrito"); };
const notice = { refreshNotices() {}, deliveryInformation: { mode: "LOCAL_FIXED", flatFee: 3000, freeShippingFrom: 500000 }, presentation: { title: "Catálogo", mainText: "Presentación", secondaryText: "Prueba" }, notices: [{ id: 1, title: "Segundo aviso", message: "Contenido de prueba" }] };
const store = createCheckoutDraftStore("TEST");
const favorites = { enabled: true, products: params.has("with-favorites") ? [product] : [], busy: [], loading: false, error: "", reload() {}, toggle() {} };

function ScrollFixture() {
  return <><nav className="sticky top-0 z-30 bg-white" aria-label="Pruebas de navegación"><Link to="/catalog">Catálogo</Link> <InformationLink to="/favorites">Favoritos</InformationLink> <InformationLink to="/account">Mi cuenta</InformationLink> <InformationLink to="/orders">Mis pedidos</InformationLink> <InformationLink to="/changes-and-returns">Devoluciones</InformationLink> <InformationLink to="/delivery-conditions">Condiciones</InformationLink></nav><Routes>
    <Route path="/catalog" element={<CatalogPage />} />
    <Route path="/catalog/products/:id" element={<ProductDetailPage />} />
    <Route path="/favorites" element={<FavoritesPage />} />
    <Route path="/account" element={<ClientAccountPage />} />
    <Route path="/orders" element={<ClientOrdersPage />} />
    <Route path="/changes-and-returns" element={<ReturnsInformationPage />} />
    <Route path="/delivery-conditions" element={<DeliveryConditionsPage />} />
  </Routes></>;
}

function FilterFixture() {
  const [filters, setFilters] = useState({ inactive: false, empty: false });
  return <div style={{ padding: 20 }}><output data-testid="applied">{JSON.stringify(filters)}</output>
    <MobileTableTools value={filters} clearValue={{ inactive: false, empty: false }} onApply={setFilters}>
      {(draft, setDraft) => Object.keys(draft).map(key => <button key={key} aria-pressed={draft[key]} onClick={() => setDraft(value => ({ ...value, [key]: !value[key] }))}>{key}</button>)}
    </MobileTableTools></div>;
}
function PurchaseFixture() {
  const current = useLocation();
  return <><output data-testid="route">{current.pathname + current.search}</output><output data-testid="cart">{JSON.stringify(cart.map(item => [item.product.id, item.quantity]))}</output><Routes>
    <Route path="/catalog/families/18" element={<main><h1>Ficha de prueba</h1><ProductPurchaseControls product={product} showBuyNow /></main>} />
    <Route path="/checkout-options" element={<CheckoutChoicePage />} />
    <Route path="/checkout" element={<CheckoutPage />} />
    <Route path="/delivery-conditions" element={<DeliveryConditionsPage />} />
  </Routes></>;
}
function JourneyFixture() {
  return <ClientLayout><Toaster /><Link to="/catalog/families/18?variant=100">Ficha familiar de prueba</Link><Routes>
    <Route path="/catalog" element={<CatalogPage />} />
    <Route path="/catalog/products/:id" element={<ProductDetailPage />} />
    <Route path="/catalog/families/:id" element={<ProductFamilyPage />} />
    <Route path="/cart" element={<ClientCartPage />} />
    <Route path="/account" element={<ClientAccountPage />} />
    <Route path="/orders" element={<ClientOrdersPage />} />
    <Route path="/guest-orders" element={<GuestDeviceOrdersPage />} />
    <Route path="/favorites" element={<FavoritesPage />} />
    <Route path="/changes-and-returns" element={<ReturnsInformationPage />} />
    <Route path="/delivery-conditions" element={<DeliveryConditionsPage />} />
  </Routes></ClientLayout>;
}
function Fixture() {
  return <AuthContext.Provider value={auth}><CartContext.Provider value={{ items: cart, totalUnits: cart.reduce((sum, item) => sum + item.quantity, 0), addItem: mode === 'journey' ? (product, quantity) => { cart.push({ product, quantity }); return { success: true }; } : forbiddenMutation, removePurchasedItems: ['payment', 'tracking'].includes(mode) ? () => { window.__testPurchaseRemovals = (window.__testPurchaseRemovals || 0) + 1; } : forbiddenMutation, removeItem: forbiddenMutation, clearCart: params.has('allow-clear') ? () => { window.__testCartClears = (window.__testCartClears || 0) + 1; return null; } : forbiddenMutation }}><CheckoutDraftContext.Provider value={store}><CustomerNoticeContext.Provider value={notice}>
    <BrowserRouter><ThemeContext.Provider value={{ isDark: params.get("theme") === "dark", toggleTheme() {} }}><FavoritesContext.Provider value={favorites}><ClientScrollRestoration />
      {mode === 'payment' ? <PaymentResultPage /> : mode === 'tracking' ? <GuestOrderTrackingPage /> : mode === 'sales' ? <SalesPage /> : mode === 'users' ? <UsersPage /> : mode === 'reports' ? <ReportsPage /> : mode === 'orders' ? <OnlineOrdersManagementPage /> : mode === 'audit' ? <ProductAuditHistoryPage /> : mode === 'settings' ? <DeliverySettingsManager role={auth.user.role} /> : mode === 'journey' ? <JourneyFixture /> : mode === "inventory" ? <ProductsPage /> : mode === "guest-orders" ? <GuestDeviceOrdersPage /> : mode === "scroll" ? <ScrollFixture /> : mode === "filters" ? <FilterFixture /> : mode === "carousel" ? <CatalogNoticeCarousel /> : mode === "bundle" ? <ProductBundleEditor familyId={18} categories={[{ id: 1, name: "Prueba" }]} onClose={() => {}} /> : <PurchaseFixture />}
    </FavoritesContext.Provider></ThemeContext.Provider>
    </BrowserRouter>
  </CustomerNoticeContext.Provider></CheckoutDraftContext.Provider></CartContext.Provider></AuthContext.Provider>;
}
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")).render(<Fixture />);
