import { Boxes, Home, Package, ReceiptText, ShoppingCart } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const items = [
  { to: "/dashboard", label: "Inicio", icon: Home, roles: ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"] },
  { to: "/products", label: "Productos", icon: Package, roles: ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"] },
  { to: "/sales", label: "Ventas", icon: ShoppingCart, roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { to: "/inventory", label: "Inventario", icon: Boxes, roles: ["ADMIN", "MANAGER", "WAREHOUSE"] },
];

export default function Sidebar({ open }) {
  const { user } = useAuth();

  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <div className="sidebar-brand">
        <ReceiptText size={24} />
        <span>Ferreteria</span>
      </div>
      <nav>
        {items
          .filter((item) => item.roles.includes(user?.role))
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
    </aside>
  );
}
