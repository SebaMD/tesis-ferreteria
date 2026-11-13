// Real UI with synthetic sessions; all API calls are intercepted by the browser test.
/* eslint-disable react-refresh/only-export-components -- standalone browser test entry */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AuthContext from "../../src/context/AuthContext.js";
import CartContext from "../../src/context/CartContext.js";
import CheckoutDraftContext from "../../src/context/CheckoutDraftContext.js";
import CustomerNoticeContext from "../../src/context/CustomerNoticeContext.js";
import { createCheckoutDraftStore } from "../../src/helpers/checkoutDraft.js";
import CheckoutPage from "../../src/pages/CheckoutPage.jsx";
import ClientOrdersPage from "../../src/pages/ClientOrdersPage.jsx";
import GuestDeviceOrdersPage from "../../src/pages/GuestDeviceOrdersPage.jsx";
import DeliveryConditionsPage from "../../src/pages/DeliveryConditionsPage.jsx";
import "../../src/styles/styles.css";

const params = new URLSearchParams(location.search);
const guest = params.has("guest");
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
const product = { id: 99, name: "Producto de prueba", price: 5990, currentStock: 20, availableStock: 20, status: true, unitMeasure: "unidad", images: [] };
const cart = { items: [{ product, quantity: 1 }] };
const notice = { deliveryInformation: { mode: "LOCAL_FIXED", flatFee: 3000, freeShippingFrom: 500000 } };

function Fixture() {
  const [user, setUser] = useState(guest ? null : { id: 1, role: "CLIENT", correo: "client@example.test", names: "Cliente", emailVerified: false });
  const owner = user ? `CLIENT:${user.id}` : "GUEST";
  const drafts = useMemo(() => createCheckoutDraftStore(owner), [owner]);
  const auth = { user, isAuthenticated: Boolean(user), replaceSession: session => setUser(session.user) };
  return <AuthContext.Provider value={auth}><CartContext.Provider value={cart}><CheckoutDraftContext.Provider value={drafts}><CustomerNoticeContext.Provider value={notice}>
    <BrowserRouter><Toaster /><Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders" element={<ClientOrdersPage />} />
      <Route path="/guest-orders" element={<GuestDeviceOrdersPage />} />
      <Route path="/delivery-conditions" element={<DeliveryConditionsPage />} />
    </Routes></BrowserRouter>
    <button data-testid="change-identity" onClick={() => setUser({ id: 2, role: "CLIENT", correo: "other@example.test", names: "Otra persona", emailVerified: false })}>Cambiar identidad de prueba</button>
  </CustomerNoticeContext.Provider></CheckoutDraftContext.Provider></CartContext.Provider></AuthContext.Provider>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
