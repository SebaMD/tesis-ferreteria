import { LogOut, Mail, Megaphone, Menu, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import { ROLE_NAMES } from "../helpers/roles.js";
import BrandLogo from "./BrandLogo.jsx";
import AppModal from "./AppModal.jsx";
import CustomerNoticeManager from "./CustomerNoticeManager.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

const pageNames = {
  "/dashboard": "Inicio",
  "/products": "Inventario",
  "/sales": "Ventas",
  "/inventory": "Inventario",
  "/reports": "Reportes",
  "/users": "Usuarios",
};

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const canManageNotice = ["ADMIN", "MANAGER"].includes(user?.role);

  return (
    <header className="sticky top-0 z-30 flex h-16.25 items-center gap-3 border-b border-slate-200 bg-white px-6 max-[720px]:gap-2 max-[720px]:px-3.5">
      <button className="hidden size-10 min-h-10 shrink-0 border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950 max-[980px]:inline-flex" type="button" onClick={onToggleSidebar} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      <div className="hidden min-w-0 items-center gap-1.5 max-[980px]:flex">
        <BrandLogo className="size-8" />
        <strong className="text-xs leading-tight text-ink-950">Ferretería FYF</strong>
      </div>
      <div className="max-[980px]:hidden">
        <strong className="text-sm text-ink-950">{pageNames[location.pathname] || "FERRETERIA FYF"}</strong>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2.5 max-[720px]:gap-2">
        <button className="inline-flex size-10 min-h-10 items-center justify-center rounded-[5px] border border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950" type="button" onClick={() => setProfileOpen(true)} title="Mi perfil" aria-label="Abrir mi perfil"><UserRound size={18} /></button>
        {canManageNotice && (
          <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:border-rust-400 hover:bg-rust-50 hover:text-rust-700" type="button" onClick={() => setNoticeOpen(true)} title="Avisos a clientes" aria-label="Administrar avisos a clientes">
            <Megaphone size={18} />
          </button>
        )}
        <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950" type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
      <AppModal open={noticeOpen} onClose={() => setNoticeOpen(false)} title="Avisos a clientes" description="Configura la información operacional visible en la tienda online." size="large">
        {canManageNotice && <CustomerNoticeManager embedded />}
      </AppModal>
      <AppModal open={profileOpen} onClose={() => setProfileOpen(false)} title="Mi perfil" description="Información de tu cuenta y preferencias de visualización.">
        <div className="grid gap-5">
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink-950 text-white"><UserRound size={22} /></span>
            <div className="min-w-0"><strong className="block truncate text-base text-ink-950">{user?.names} {user?.surnames}</strong><span className="text-xs font-bold text-rust-600">{ROLE_NAMES[user?.role] || user?.role}</span></div>
          </div>
          <dl className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
            <div className="rounded-md bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={15} /> RUT</dt><dd className="mt-1.5 ml-0 font-semibold text-ink-950">{user?.rut}</dd></div>
            <div className="rounded-md bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><Mail size={15} /> Correo</dt><dd className="mt-1.5 ml-0 break-all font-semibold text-ink-950">{user?.correo}</dd><span className={`mt-1 block text-xs font-bold ${user?.emailVerifiedAt || user?.emailVerified ? "text-positive-600" : "text-amber-700"}`}>{user?.emailVerifiedAt || user?.emailVerified ? "Correo verificado" : "Correo pendiente de verificación"}</span></div>
          </dl>
          <section className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div><strong className="block text-sm text-ink-950">Apariencia</strong><span className="text-xs text-slate-500">La preferencia se guarda solamente para esta cuenta.</span></div>
            <ThemeToggle showLabel />
          </section>
        </div>
      </AppModal>
    </header>
  );
}
