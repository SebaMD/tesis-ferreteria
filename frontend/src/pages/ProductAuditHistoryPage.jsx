import ProductAuditHistory from "../components/ProductAuditHistory.jsx";
import InventoryNavigation from "../components/InventoryNavigation.jsx";
import { pageClass, pageHeaderClass } from "../helpers/uiClasses.js";

export default function ProductAuditHistoryPage() {
  return <section className={pageClass}>
    <header className={pageHeaderClass}><div className="min-w-0"><h1>Historial de cambios administrativos</h1><p>Correcciones y operaciones auditadas del catálogo, familias y variantes. No son movimientos de stock ni una auditoría universal de todas las ediciones.</p></div><InventoryNavigation active="changes" /></header>
    <ProductAuditHistory />
  </section>;
}
