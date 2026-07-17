import { LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import { ROLE_NAMES } from "../helpers/roles.js";

const pageNames = {
  "/dashboard": "Inicio",
  "/products": "Productos",
  "/sales": "Ventas",
  "/inventory": "Inventario",
  "/reports": "Reportes",
  "/users": "Usuarios",
};

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const initials = `${user?.names?.[0] || ""}${user?.surnames?.[0] || ""}`.toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16.25 items-center gap-3 border-b border-slate-200 bg-white px-6 max-[720px]:px-3.5">
      <button className="hidden size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950 max-[980px]:inline-flex" type="button" onClick={onToggleSidebar} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      <div className="max-[720px]:hidden">
        <strong className="text-sm text-ink-950">{pageNames[location.pathname] || "FERRETERIA FYF"}</strong>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="inline-flex min-h-7 items-center gap-1.75 rounded-full border border-[#f3d1a7] bg-rust-50 px-2.5 text-[11px] font-bold text-rust-600 max-[720px]:hidden"><i className="size-1.5 rounded-full bg-rust-500" />{ROLE_NAMES[user?.role] || user?.role}</span>
        <span className="inline-flex size-9 items-center justify-center rounded-[5px] bg-ink-950 text-xs font-bold text-white">{initials || "FS"}</span>
        <span className="grid gap-0.5 max-[720px]:hidden">
          <strong className="text-xs text-ink-950">{user?.names} {user?.surnames}</strong>
          <small className="text-[10px] text-slate-500">{user?.correo}</small>
        </span>
        <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950" type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
