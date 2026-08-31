import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ClientLayout from "./components/ClientLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Sidebar from "./components/Sidebar.jsx";
import useAuth from "./hooks/useAuth.js";
import { ROUTE_PERMISSIONS } from "./helpers/roles.js";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SalesPage from "./pages/SalesPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import CatalogPage from "./pages/CatalogPage.jsx";
import ClientAccountPage from "./pages/ClientAccountPage.jsx";
import ClientCartPage from "./pages/ClientCartPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import CheckoutChoicePage from "./pages/CheckoutChoicePage.jsx";
import GuestOrderTrackingPage from "./pages/GuestOrderTrackingPage.jsx";
import ClientOrdersPage from "./pages/ClientOrdersPage.jsx";
import PaymentResultPage from "./pages/PaymentResultPage.jsx";
import OnlineOrdersManagementPage from "./pages/OnlineOrdersManagementPage.jsx";
import ProductDetailPage from "./pages/ProductDetailPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="grid min-h-screen grid-cols-[256px_minmax(0,1fr)] bg-[#f5f6f7] max-[980px]:grid-cols-1">
      {sidebarOpen && <button className="fixed inset-0 z-40 hidden h-full w-full min-h-0 rounded-none border-0 bg-[rgba(16,21,31,0.55)] p-0 hover:bg-[rgba(16,21,31,0.55)] max-[980px]:block" type="button" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />}
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className="min-w-0">
        <Navbar onToggleSidebar={() => setSidebarOpen((current) => !current)} />
        {children}
      </div>
    </div>
  );
}

function ProtectedPage({ children, allowedRoles }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function StorePage({ children }) {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user?.role !== "CLIENT") {
    return <Navigate to="/dashboard" replace />;
  }

  return <ClientLayout>{children}</ClientLayout>;
}

function ProtectedClientPage({ children }) {
  return (
    <ProtectedRoute allowedRoles={ROUTE_PERMISSIONS.client}>
      <ClientLayout>{children}</ClientLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/catalog" element={<StorePage><CatalogPage /></StorePage>} />
      <Route path="/catalog/products/:id" element={<StorePage><ProductDetailPage /></StorePage>} />
      <Route path="/cart" element={<StorePage><ClientCartPage /></StorePage>} />
      <Route path="/checkout-options" element={<StorePage><CheckoutChoicePage /></StorePage>} />
      <Route path="/account" element={<ProtectedClientPage><ClientAccountPage /></ProtectedClientPage>} />
      <Route path="/checkout" element={<StorePage><CheckoutPage /></StorePage>} />
      <Route path="/orders" element={<ProtectedClientPage><ClientOrdersPage /></ProtectedClientPage>} />
      <Route path="/payment-result" element={<ProtectedClientPage><PaymentResultPage /></ProtectedClientPage>} />
      <Route path="/order-tracking" element={<StorePage><GuestOrderTrackingPage /></StorePage>} />
      <Route
        path="/dashboard"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.dashboard}>
            <DashboardPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.products}>
            <ProductsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.sales}>
            <SalesPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.inventory}>
            <ProductsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/online-orders-management"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.onlineOrdersManagement}>
            <OnlineOrdersManagementPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.reports}>
            <ReportsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedPage allowedRoles={ROUTE_PERMISSIONS.users}>
            <UsersPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/"
        element={<Navigate to={isAuthenticated && user?.role !== "CLIENT" ? "/dashboard" : "/catalog"} replace />}
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated && user?.role !== "CLIENT" ? "/dashboard" : "/catalog"} replace />}
      />
    </Routes>
  );
}
