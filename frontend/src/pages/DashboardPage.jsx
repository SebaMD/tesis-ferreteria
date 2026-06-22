import { AlertTriangle, ArrowLeftRight, PackageCheck, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import { compareByNewest, formatClp, formatDate } from "../helpers/formatters.js";
import { getSaleStatusLabel } from "../helpers/labels.js";
import { ROUTE_PERMISSIONS } from "../helpers/roles.js";
import { getInventoryMovementsRequest } from "../services/inventory.service.js";
import { getProductsRequest } from "../services/products.service.js";
import { getSalesRequest } from "../services/sales.service.js";
import useAuth from "../hooks/useAuth.js";
import {
  alertClasses,
  badgeClass,
  dashboardListRowClass,
  dashboardPanelClass,
  dashboardPanelHeadingClass,
  emptyStateClass,
  listRowEndClass,
  metricCardClass,
  metricIconClasses,
  pageClass,
  pageHeaderClass,
  panelClass,
  panelCountClass,
} from "../helpers/uiClasses.js";

const DASHBOARD_DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

function isRecent(value, days = 7) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canViewSales = ROUTE_PERMISSIONS.sales.includes(user?.role);
  const canViewInventory = ROUTE_PERMISSIONS.inventory.includes(user?.role);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const [productData, saleData, movementData] = await Promise.all([
          getProductsRequest(),
          canViewSales ? getSalesRequest() : Promise.resolve([]),
          canViewInventory ? getInventoryMovementsRequest() : Promise.resolve([]),
        ]);

        if (!active) return;
        setProducts(productData);
        setSales(saleData);
        setMovements(movementData);
      } catch (err) {
        if (active) setError(getApiError(err, "No se pudo cargar el resumen del sistema"));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => {
      active = false;
    };
  }, [canViewInventory, canViewSales]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status !== false),
    [products],
  );
  const lowStockProducts = useMemo(
    () => activeProducts.filter((product) => product.currentStock <= product.minimumStock),
    [activeProducts],
  );
  const activeSales = useMemo(
    () => sales.filter((sale) => sale.status === "ACTIVE"),
    [sales],
  );
  const recentMovements = useMemo(
    () => movements.filter((movement) => isRecent(movement.date || movement.createdAt)),
    [movements],
  );
  const latestSales = useMemo(() => [...sales].sort(compareByNewest).slice(0, 5), [sales]);
  const latestMovements = useMemo(() => [...movements].sort(compareByNewest).slice(0, 5), [movements]);

  const metrics = [
    {
      label: "Productos activos",
      value: activeProducts.length,
      icon: PackageCheck,
      tone: "neutral",
    },
    {
      label: "Bajo stock mínimo",
      value: lowStockProducts.length,
      icon: AlertTriangle,
      tone: "warning",
    },
    ...(canViewSales
      ? [{ label: "Ventas activas", value: activeSales.length, icon: ShoppingCart, tone: "positive" }]
      : []),
    ...(canViewInventory
      ? [{ label: "Movimientos recientes", value: recentMovements.length, icon: ArrowLeftRight, tone: "neutral" }]
      : []),
  ];

  return (
    <section className={`${pageClass} gap-4.5`}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Hola, {user?.names}</h1>
          <p>Este es el resumen general del sistema para tu jornada.</p>
        </div>
      </div>

      {error && <div className={alertClasses.error}>{error}</div>}

      {loading ? (
        <div className={`${panelClass} text-center text-[13px] text-slate-500`}>Cargando información del sistema...</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3.5 max-[980px]:grid-cols-2 max-[720px]:grid-cols-1">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className={metricCardClass} key={metric.label}>
                  <span className={metricIconClasses[metric.tone]}><Icon size={20} /></span>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              );
            })}
          </div>

          <div className="grid grid-cols-2 items-start gap-4 max-[720px]:grid-cols-1">
            <section className={dashboardPanelClass}>
              <div className={dashboardPanelHeadingClass}>
                <div>
                  <h2>Productos a reponer</h2>
                  <p>Stock igual o inferior al mínimo definido</p>
                </div>
                <span className={panelCountClass}>{lowStockProducts.length}</span>
              </div>

              <div className="grid">
                {lowStockProducts.length === 0 ? (
                  <p className={emptyStateClass}>No hay productos con stock bajo.</p>
                ) : (
                  lowStockProducts.slice(0, 5).map((product) => (
                    <article className={dashboardListRowClass} key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.categoryName}</span>
                      </div>
                      <div className={listRowEndClass}>
                        <strong>{product.currentStock} / {product.minimumStock}</strong>
                        <span className={badgeClass("warning")}>Reponer</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            {canViewSales ? (
              <section className={dashboardPanelClass}>
                <div className={dashboardPanelHeadingClass}>
                  <div>
                    <h2>Últimas ventas</h2>
                    <p>Ventas presenciales más recientes</p>
                  </div>
                  <span className={panelCountClass}>{sales.length}</span>
                </div>

                <div className="grid">
                  {latestSales.length === 0 ? (
                    <p className={emptyStateClass}>Todavía no hay ventas registradas.</p>
                  ) : (
                    latestSales.map((sale) => (
                      <article className={dashboardListRowClass} key={sale.id}>
                        <div>
                          <strong>Venta #{sale.id}</strong>
                          <span>{sale.userNames} {sale.userSurnames} · {formatDate(sale.date, DASHBOARD_DATE_OPTIONS)}</span>
                        </div>
                        <div className={listRowEndClass}>
                          <strong>{formatClp(sale.total)}</strong>
                          <span className={badgeClass(sale.status === "ACTIVE" ? "success" : "critical")}>
                            {getSaleStatusLabel(sale.status)}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : (
              <section className={dashboardPanelClass}>
                <div className={dashboardPanelHeadingClass}>
                  <div>
                    <h2>Movimientos recientes</h2>
                    <p>Últimas operaciones de inventario</p>
                  </div>
                  <span className={panelCountClass}>{movements.length}</span>
                </div>

                <div className="grid">
                  {latestMovements.length === 0 ? (
                    <p className={emptyStateClass}>Todavía no hay movimientos registrados.</p>
                  ) : (
                    latestMovements.map((movement) => (
                      <article className={dashboardListRowClass} key={movement.id}>
                        <div>
                          <strong>{movement.productName}</strong>
                          <span>{formatDate(movement.date, DASHBOARD_DATE_OPTIONS)}</span>
                        </div>
                        <div className={listRowEndClass}>
                          <strong>{movement.quantity} unidades</strong>
                          <span className={badgeClass(movement.movementType === "EXIT" ? "critical" : movement.movementType === "ADJUSTMENT" ? "neutral" : "success")}>
                            {movement.movementType}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
