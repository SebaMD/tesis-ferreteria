import { ClipboardList, LayoutDashboard, LogIn, LogOut, ShoppingCart, UserPlus, UserRound } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import BrandLogo from "./BrandLogo.jsx";

function navClass({ isActive }) {
  return `rounded-[5px] px-3 py-2 text-sm font-bold transition-colors ${
    isActive ? "bg-rust-50 text-rust-700" : "text-ink-700 hover:bg-slate-100 hover:text-ink-950"
  }`;
}

export default function ClientNavbar() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const { totalUnits } = useCart();
  const isClient = user?.role === "CLIENT";

  const handleLogout = async () => {
    await logout();
    navigate("/catalog");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-17 w-full max-w-360 flex-wrap items-center gap-3 px-6 py-2 max-[720px]:px-3.5">
        <Link className="mr-3 flex items-center gap-2 text-ink-950 no-underline" to="/catalog">
          <BrandLogo className="size-11" />
          <span className="grid leading-tight">
            <strong className="text-sm">FERRETERIA FYF</strong>
            <small className="text-[10px] font-semibold text-slate-500">Catálogo online</small>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 max-[720px]:order-3 max-[720px]:w-full" aria-label="Navegación de clientes">
          <NavLink className={navClass} to="/catalog">Catálogo</NavLink>
          {isClient && <NavLink className={navClass} to="/orders"><ClipboardList className="inline" size={15} /> Mis pedidos</NavLink>}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated && !isClient && (
            <Link className="inline-flex min-h-10 items-center gap-2 rounded-[5px] border border-slate-300 px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100" to="/dashboard">
              <LayoutDashboard size={17} />
              <span className="max-[620px]:hidden">Sistema interno</span>
            </Link>
          )}

          {!isAuthenticated && (
            <>
              <Link className="inline-flex min-h-10 items-center gap-2 rounded-[5px] border border-slate-300 px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100 max-[520px]:hidden" to="/login">
                <LogIn size={17} /> Ingresar
              </Link>
              <Link className="inline-flex min-h-10 items-center gap-2 rounded-[5px] border border-ink-950 bg-ink-950 px-3 text-xs font-bold text-white no-underline hover:bg-ink-700" to="/register">
                <UserPlus size={17} /> <span className="max-[620px]:hidden">Registrarse</span>
              </Link>
            </>
          )}

          <Link className="relative grid size-11 place-items-center rounded-[5px] border border-ink-950 bg-ink-950 text-white no-underline hover:bg-ink-700" to="/cart" title="Ver carrito" aria-label={`Ver carrito, ${totalUnits} ${totalUnits === 1 ? "unidad" : "unidades"}`}>
            <ShoppingCart size={20} />
            {totalUnits > 0 && (
              <span className="absolute -top-2 -right-2 grid min-h-5 min-w-5 place-items-center rounded-full bg-rust-500 px-1 text-[10px] font-black text-white">
                {totalUnits > 99 ? "99+" : totalUnits}
              </span>
            )}
          </Link>

          {isClient && (
            <Link className="grid size-10 place-items-center rounded-[5px] border border-slate-300 text-ink-700 no-underline hover:bg-slate-100" to="/account" title="Mi cuenta" aria-label="Mi cuenta">
              <UserRound size={18} />
            </Link>
          )}

          {isAuthenticated && (
            <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:bg-slate-100" type="button" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
