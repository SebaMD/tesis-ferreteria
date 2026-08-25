import { Navigate, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "CLIENT" ? "/catalog" : "/dashboard"} replace />;
  }

  return children;
}
