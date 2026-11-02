// Browser-only fixture: real components, synthetic identities and intercepted API.
/* eslint-disable react-refresh/only-export-components -- standalone test entry, never imported by the app */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthContext from "../../src/context/AuthContext.js";
import CartContext from "../../src/context/CartContext.js";
import CheckoutDraftContext from "../../src/context/CheckoutDraftContext.js";
import CustomerNoticeContext from "../../src/context/CustomerNoticeContext.js";
import { createCheckoutDraftStore } from "../../src/helpers/checkoutDraft.js";
import MobileTableTools from "../../src/components/MobileTableTools.jsx";
import ProductPurchaseControls from "../../src/components/ProductPurchaseControls.jsx";
import ProductBundleEditor from "../../src/components/ProductBundleEditor.jsx";
import CatalogNoticeCarousel from "../../src/components/CatalogNoticeCarousel.jsx";
import CheckoutChoicePage from "../../src/pages/CheckoutChoicePage.jsx";
import CheckoutPage from "../../src/pages/CheckoutPage.jsx";
import DeliveryConditionsPage from "../../src/pages/DeliveryConditionsPage.jsx";
import "../../src/styles/styles.css";

const params = new URLSearchParams(location.pathname === "/ux-test" ? location.search : sessionStorage.getItem("ux-fixture-parameters"));
if (location.pathname === "/ux-test") {
  sessionStorage.setItem("ux-fixture-parameters", location.search);
  history.replaceState({ usr: { productDetailOrigin: { source: "favorites" } } }, "", "/catalog/families/18?variant=99");
}
const mode = params.get("case");
const guest = params.has("guest");
const product = { id: 99, name: "Producto de prueba", price: 5990, currentStock: 20, availableStock: 20, unitMeasure: "unidad", status: true, images: [] };
const cart = [{ product: { ...product, id: 5 }, quantity: 4 }];
const auth = { isAuthenticated: !guest, user: guest ? null : { id: 1, role: mode === "bundle" ? "ADMIN" : "CLIENT", names: "Cliente", surnames: "Prueba", emailVerified: true }, replaceSession() {} };
const forbiddenMutation = () => { throw new Error("Compra directa modificó el carrito"); };
const notice = { deliveryInformation: { mode: "LOCAL_FIXED", flatFee: 3000, freeShippingFrom: 500000 }, presentation: { title: "Catálogo", mainText: "Presentación", secondaryText: "Prueba" }, notices: [{ id: 1, title: "Segundo aviso", message: "Contenido de prueba" }] };
const store = createCheckoutDraftStore("TEST");

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
function Fixture() {
  return <AuthContext.Provider value={auth}><CartContext.Provider value={{ items: cart, addItem: forbiddenMutation, removeItem: forbiddenMutation, clearCart: forbiddenMutation }}><CheckoutDraftContext.Provider value={store}><CustomerNoticeContext.Provider value={notice}>
    <BrowserRouter>
      {mode === "filters" ? <FilterFixture /> : mode === "carousel" ? <CatalogNoticeCarousel /> : mode === "bundle" ? <ProductBundleEditor familyId={18} categories={[{ id: 1, name: "Prueba" }]} onClose={() => {}} /> : <PurchaseFixture />}
    </BrowserRouter>
  </CustomerNoticeContext.Provider></CheckoutDraftContext.Provider></CartContext.Provider></AuthContext.Provider>;
}
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")).render(<Fixture />);
