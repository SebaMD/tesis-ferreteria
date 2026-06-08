import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import SalesPage from "./pages/SalesPage.jsx";

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} />
      <div className="main-shell">
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
          <ProtectedPage>
            <DashboardPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedPage allowedRoles={["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]}>
            <ProductsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedPage allowedRoles={["ADMIN", "MANAGER", "CASHIER"]}>
            <SalesPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedPage allowedRoles={["ADMIN", "MANAGER", "WAREHOUSE"]}>
            <InventoryPage />
          </ProtectedPage>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
