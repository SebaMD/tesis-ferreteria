import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Sidebar from "./components/Sidebar.jsx";
import useAuth from "./hooks/useAuth.js";
import { ROUTE_PERMISSIONS } from "./helpers/roles.js";
import DashboardPage from "./pages/DashboardPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SalesPage from "./pages/SalesPage.jsx";

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

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
            <InventoryPage />
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
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
