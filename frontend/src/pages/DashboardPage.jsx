import { AlertTriangle, ArrowLeftRight, DollarSign, PackageCheck, PackageX, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiError } from "../api/httpClient.js";
import { compareByNewest, formatClp, formatDate } from "../helpers/formatters.js";
import { getMovementTone, isLowStockProduct } from "../helpers/inventory.js";
import { getSaleStatusLabel, MOVEMENT_LABELS } from "../helpers/labels.js";
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
const quickLinkClass = "cursor-pointer transition hover:-translate-y-0.5 hover:border-rust-300 hover:shadow-[0_8px_18px_rgba(16,21,31,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500";

function isRecent(value, days = 7) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isToday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canViewSales = ROUTE_PERMISSIONS.sales.includes(user?.role);
  const canViewInventoryHistory = ["ADMIN", "MANAGER"].includes(user?.role);
  const canViewStockReplenishment = user?.role !== "CASHIER";
  const canUseLowStockFilter = user?.role !== "CASHIER";
  const canViewInactiveProducts = ["ADMIN", "MANAGER"].includes(user?.role);

  const goTo = (path) => {
    if (path) navigate(path);
  };

  const quickLinkProps = (path) => {
    if (!path) return {};

    return {
      role: "button",
      tabIndex: 0,
      onClick: () => goTo(path),
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goTo(path);
        }
      },
    };
  };

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const [productData, saleData, movementData] = await Promise.all([
          getProductsRequest(),
          canViewSales ? getSalesRequest() : Promise.resolve([]),
          canViewInventoryHistory ? getInventoryMovementsRequest() : Promise.resolve([]),
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
  }, [canViewInventoryHistory, canViewSales]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status !== false),
    [products],
  );
  const lowStockProducts = useMemo(
    () => activeProducts.filter(isLowStockProduct),
    [activeProducts],
  );
  const inactiveProducts = useMemo(
    () => products.filter((product) => product.status === false),
    [products],
  );
  const activeSales = useMemo(
    () => sales.filter((sale) => sale.status === "ACTIVE"),
    [sales],
  );
  const cashierTodaySalesTotal = useMemo(
    () =>
      activeSales
        .filter((sale) => String(sale.userId) === String(user?.id) && isToday(sale.date || sale.createdAt))
        .reduce((total, sale) => total + Number(sale.total || 0), 0),
    [activeSales, user?.id],
  );
  const recentMovements = useMemo(
    () => movements.filter((movement) => isRecent(movement.date || movement.createdAt)),
    [movements],
  );
  const priorityLowStockProducts = useMemo(
    () =>
      [...lowStockProducts]
        .sort((left, right) => {
          const leftDifference = Number(left.currentStock) - Number(left.minimumStock);
          const rightDifference = Number(right.currentStock) - Number(right.minimumStock);
          if (leftDifference !== rightDifference) return leftDifference - rightDifference;
          return left.name.localeCompare(right.name, "es");
        })
        .slice(0, 5),
    [lowStockProducts],
  );
  const latestSales = useMemo(() => [...sales].sort(compareByNewest).slice(0, 5), [sales]);
  const latestMovements = useMemo(() => [...movements].sort(compareByNewest).slice(0, 5), [movements]);

  const metrics = [
    {
      label: "Productos activos",
      value: activeProducts.length,
      icon: PackageCheck,
      tone: "neutral",
      path: ROUTE_PERMISSIONS.products.includes(user?.role) ? "/products" : null,
    },
    ...(canViewStockReplenishment
      ? [{
        label: "Bajo stock mínimo",
        value: lowStockProducts.length,
        icon: AlertTriangle,
        tone: "warning",
        path: ROUTE_PERMISSIONS.products.includes(user?.role) ? `/products${canUseLowStockFilter ? "?filter=low-stock" : ""}` : null,
      }]
      : []),
    ...(canViewInactiveProducts
      ? [{
        label: "Productos desactivados",
        value: inactiveProducts.length,
        icon: PackageX,
        tone: "neutral",
        path: ROUTE_PERMISSIONS.products.includes(user?.role) ? "/products?filter=inactive" : null,
      }]
      : []),
    ...(canViewSales
      ? [{ label: "Ventas activas", value: activeSales.length, icon: ShoppingCart, tone: "positive", path: "/sales?view=history" }]
      : []),
    ...(user?.role === "CASHIER"
      ? [{ label: "Vendido hoy", value: formatClp(cashierTodaySalesTotal), icon: DollarSign, tone: "positive", path: "/sales?view=history" }]
      : []),
    ...(canViewInventoryHistory
      ? [{ label: "Movimientos recientes", value: recentMovements.length, icon: ArrowLeftRight, tone: "neutral", path: "/products?view=history" }]
      : []),
  ];
  const metricsGridColumnsClass = user?.role === "WAREHOUSE"
    ? "grid-cols-2"
    : metrics.length >= 5
      ? "grid-cols-5"
      : metrics.length >= 4
      ? "grid-cols-4"
      : "grid-cols-3";
  const metricsGridClass = `grid gap-3.5 ${metricsGridColumnsClass} max-[980px]:grid-cols-2 max-[720px]:grid-cols-1`;

  return (
    <section className={`${pageClass} gap-4.5`}>
      <div className={pageHeaderClass}>
        <div>
          <h1>{user?.role === "ADMIN" ? "Panel de administración" : `Hola, ${user?.names}`}</h1>
          <p>Este es el resumen general del sistema para tu jornada.</p>
        </div>
      </div>

      {error && <div className={alertClasses.error}>{error}</div>}

      {loading ? (
        <div className={`${panelClass} text-center text-[13px] text-slate-500`}>Cargando información del sistema...</div>
      ) : (
        <>
          <div className={metricsGridClass}>
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article
                  className={`${metricCardClass} ${metric.path ? quickLinkClass : ""}`}
                  key={metric.label}
                  {...quickLinkProps(metric.path)}
                >
                  <span className={metricIconClasses[metric.tone]}><Icon size={20} /></span>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              );
            })}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-4">
            {canViewStockReplenishment && (
              <section
                className={`${dashboardPanelClass} ${ROUTE_PERMISSIONS.products.includes(user?.role) ? quickLinkClass : ""}`}
                {...quickLinkProps(ROUTE_PERMISSIONS.products.includes(user?.role) ? `/products${canUseLowStockFilter ? "?filter=low-stock" : ""}` : null)}
              >
                <div className={dashboardPanelHeadingClass}>
                  <div>
                    <h2>Productos a reponer</h2>
                    <p>Stock igual o inferior al mínimo definido</p>
                  </div>
                  <span className={panelCountClass}>{lowStockProducts.length}</span>
                </div>

                <div className="grid">
                  {priorityLowStockProducts.length === 0 ? (
                    <p className={emptyStateClass}>No hay productos con stock bajo.</p>
                  ) : (
                    priorityLowStockProducts.map((product) => (
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
            )}

            {canViewSales && (
              <section
                className={`${dashboardPanelClass} ${canViewSales ? quickLinkClass : ""}`}
                {...quickLinkProps(canViewSales ? "/sales?view=history" : null)}
              >
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
            )}

            {canViewInventoryHistory && (
              <section
                className={`${dashboardPanelClass} ${canViewInventoryHistory ? quickLinkClass : ""}`}
                {...quickLinkProps(canViewInventoryHistory ? "/products?view=history" : null)}
              >
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
                          <span className={badgeClass(getMovementTone(movement))}>
                            {MOVEMENT_LABELS[movement.movementType] || movement.movementType}
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
