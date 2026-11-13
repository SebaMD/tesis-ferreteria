import { Link } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";

export default function InventoryNavigation({ active }) {
  const { user } = useAuth();
  const items = [{ key: "inventory", label: "Inventario", to: "/products?view=inventory" }];
  if (["ADMIN", "MANAGER"].includes(user?.role)) items.push({ key: "history", label: "Historial de inventario", to: "/products?view=history" });
  if (user?.role === "ADMIN") items.push({ key: "changes", label: "Cambios administrativos", to: "/products/administrative-changes" });
  return <nav aria-label="Secciones de inventario" className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 max-[720px]:ml-0 max-[720px]:w-full">
    {items.map(item => <Link key={item.key} to={item.to} aria-current={active === item.key ? "page" : undefined}
      className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded-sm border-2 px-4 py-2 text-center text-sm font-extrabold no-underline max-[720px]:flex-auto ${active === item.key ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}>{item.label}</Link>)}
  </nav>;
}
