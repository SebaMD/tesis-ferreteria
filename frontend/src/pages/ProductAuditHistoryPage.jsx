import ProductAuditHistory from "../components/ProductAuditHistory.jsx";
import InventoryNavigation from "../components/InventoryNavigation.jsx";
import { pageClass, pageHeaderClass } from "../helpers/uiClasses.js";

export default function ProductAuditHistoryPage() {
  return <section className={`${pageClass} inventory-compact-page`}>
    <header className={`${pageHeaderClass} inventory-section-header`}><div className="min-w-0"><h1>Historial de cambios administrativos</h1><p>Correcciones y operaciones registradas del catálogo. No incluye movimientos de stock.</p></div><InventoryNavigation active="changes" /></header>
    <ProductAuditHistory />
  </section>;
}
