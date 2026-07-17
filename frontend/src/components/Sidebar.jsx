import { BarChart3, Boxes, Home, ShoppingCart, UsersRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import { ROUTE_PERMISSIONS } from "../helpers/roles.js";
import BrandLogo from "./BrandLogo.jsx";

const items = [
  { to: "/dashboard", label: "Inicio", icon: Home, roles: ROUTE_PERMISSIONS.dashboard },
  { to: "/products", label: "Inventario", icon: Boxes, roles: ROUTE_PERMISSIONS.products },
  { to: "/sales", label: "Ventas", icon: ShoppingCart, roles: ROUTE_PERMISSIONS.sales },
  { to: "/reports", label: "Reportes", icon: BarChart3, roles: ROUTE_PERMISSIONS.reports },
  { to: "/users", label: "Usuarios", icon: UsersRound, roles: ROUTE_PERMISSIONS.users },
];

export default function Sidebar({ open, onNavigate }) {
  const { user } = useAuth();

  return (
    <aside className={`sticky top-0 flex h-screen flex-col bg-ink-950 text-white max-[980px]:fixed max-[980px]:inset-y-0 max-[980px]:left-0 max-[980px]:z-50 max-[980px]:w-64 max-[980px]:transition-transform max-[980px]:duration-200 ${open ? "max-[980px]:translate-x-0" : "max-[980px]:-translate-x-full"}`}>
      <div className="flex h-16.25 items-center gap-2.5 border-b border-white/10 px-5 font-bold">
        <BrandLogo className="size-12" />
        <span className="whitespace-nowrap">FERRETERIA FYF</span>
      </div>
      <p className="mx-4 mt-5 mb-2 text-[11px] text-[#687485]">Operación</p>
      <nav className="grid gap-1 px-3">
        {items
          .filter((item) => item.roles.includes(user?.role))
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-[5px] border-l-[3px] px-3 text-[13px] font-semibold transition-colors ${isActive ? "border-rust-600 bg-rust-500 text-white hover:bg-rust-600" : "border-transparent text-[#aab3bf] hover:bg-white/6 hover:text-white"}`}
                key={item.to}
                to={item.to}
                onClick={onNavigate}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
      <div className="mt-auto border-t border-white/10 px-5 py-4 font-mono text-[10px] text-[#687485]">FERRETERIA FYF V1.0</div>
    </aside>
  );
}
