import { LogOut, Menu } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <button className="icon-button menu-button" type="button" onClick={onToggleSidebar} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      <div>
        <strong>Sistema Ferreteria</strong>
        <span>{user?.role || "Sin rol"}</span>
      </div>
      <button className="ghost-button" type="button" onClick={logout}>
        <LogOut size={18} />
        Cerrar sesion
      </button>
    </header>
  );
}
