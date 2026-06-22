import { BarChart3, DollarSign, Filter, RotateCcw, ShoppingCart, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import { formatClp, formatDate } from "../helpers/formatters.js";
import { getPaymentMethodLabel, getSaleStatusLabel } from "../helpers/labels.js";
import { PAYMENT_METHODS } from "../helpers/options.js";
import { getSalesByCashierReportRequest, getSalesReportRequest } from "../services/reports.service.js";
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
  numericCellClass,
  pageClass,
  pageHeaderClass,
  panelClass,
  panelCountClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
} from "../helpers/uiClasses.js";

const REPORT_DATE_OPTIONS = {
  dateStyle: "short",
  timeStyle: "short",
};

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialFilters() {
  const today = new Date();
  return {
    from: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: dateInputValue(today),
    cashierId: "",
    paymentMethod: "",
  };
}

export default function ReportsPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = async (nextFilters) => {
    setLoading(true);
    setError("");

    try {
      const [reportData, cashierData] = await Promise.all([
        getSalesReportRequest(nextFilters),
        getSalesByCashierReportRequest({ from: nextFilters.from, to: nextFilters.to }),
      ]);
      setReport(reportData);
      setCashiers(cashierData.cashiers || []);
    } catch (requestError) {
      setError(getApiError(requestError, "No se pudo cargar el reporte de ventas"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport(initialFilters());
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    loadReport(filters);
  };

  const handleReset = () => {
    const nextFilters = initialFilters();
    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const topCashier = report?.byCashier?.find((cashier) => cashier.salesCount > 0);

  return (
    <section className={`${pageClass} content-start`}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Reportes de ventas</h1>
          <p>Consulta la recaudación por fecha, cajero y método de pago.</p>
        </div>
      </div>

      <form className={`${panelClass} gap-4.5`} onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-[5px] bg-rust-50 text-rust-600"><Filter size={18} /></span>
          <div>
            <h2 className="m-0 text-base font-bold text-ink-950">Filtros</h2>
            <p className="mt-1 mb-0 text-xs text-slate-500">Las ventas canceladas se muestran en el historial, pero no se suman.</p>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(4,minmax(150px,1fr))_auto] items-end gap-3 max-[980px]:grid-cols-2 max-[720px]:grid-cols-1">
          <label>
            Desde
            <input type="date" name="from" value={filters.from} max={filters.to} onChange={handleChange} required />
          </label>
          <label>
            Hasta
            <input type="date" name="to" value={filters.to} min={filters.from} onChange={handleChange} required />
          </label>
          <label>
            Cajero
            <select name="cashierId" value={filters.cashierId} onChange={handleChange}>
              <option value="">Todos los cajeros</option>
              {cashiers.map((cashier) => (
                <option key={cashier.cashierId} value={cashier.cashierId}>{cashier.cashierName}</option>
              ))}
            </select>
          </label>
          <label>
            Método de pago
            <select name="paymentMethod" value={filters.paymentMethod} onChange={handleChange}>
              <option value="">Todos los métodos</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 max-[980px]:col-span-full max-[720px]:col-auto max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:[&>button]:w-full">
            <button type="submit" disabled={loading}>
              <BarChart3 size={18} />
              Consultar
            </button>
            <button className={secondaryButtonClass} type="button" onClick={handleReset} disabled={loading} title="Restablecer filtros">
              <RotateCcw size={17} />
              Limpiar
            </button>
          </div>
        </div>
      </form>

      {error && <div className={alertClasses.error}>{error}</div>}

      <div className="grid grid-cols-3 gap-3.5 max-[720px]:grid-cols-1">
        <article className={metricCardClass}>
          <span>Total vendido</span>
          <strong>{formatClp(report?.total)}</strong>
          <span className={metricIconClasses.positive}><DollarSign size={20} /></span>
          <span>Solo ventas activas del período</span>
        </article>
        <article className={metricCardClass}>
          <span>Ventas activas</span>
          <strong>{report?.salesCount ?? 0}</strong>
          <span className={metricIconClasses.neutral}><ShoppingCart size={20} /></span>
          <span>Operaciones incluidas en el total</span>
        </article>
        <article className={metricCardClass}>
          <span>Mayor total por cajero</span>
          <strong className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-sans! text-xl!">{topCashier?.cashierName || "Sin ventas"}</strong>
          <span className={metricIconClasses.warning}><UserRound size={20} /></span>
          <span>{topCashier ? formatClp(topCashier.total) : "Sin ventas activas en el período"}</span>
        </article>
      </div>

      <div className="grid grid-cols-2 items-start gap-4 max-[720px]:grid-cols-1">
        <article className={dashboardPanelClass}>
          <div className={dashboardPanelHeadingClass}>
            <div>
              <h2>Resumen por cajero</h2>
              <p>Ventas activas y total recaudado</p>
            </div>
            <span className={panelCountClass}>{report?.byCashier?.length || 0}</span>
          </div>
          <div className="grid">
            {report?.byCashier?.length ? report.byCashier.map((cashier) => (
              <div className={dashboardListRowClass} key={cashier.cashierId}>
                <div>
                  <strong>{cashier.cashierName}</strong>
                  <span>{cashier.salesCount} {cashier.salesCount === 1 ? "venta activa" : "ventas activas"}</span>
                </div>
                <div className={listRowEndClass}>
                  <strong>{formatClp(cashier.total)}</strong>
                  <span>#{cashier.cashierId}</span>
                </div>
              </div>
            )) : <p className={emptyStateClass}>No hay ventas para resumir.</p>}
          </div>
        </article>

        <article className={dashboardPanelClass}>
          <div className={dashboardPanelHeadingClass}>
            <div>
              <h2>Resumen por método de pago</h2>
              <p>Distribución de las ventas activas</p>
            </div>
            <span className={panelCountClass}>{report?.byPaymentMethod?.length || 0}</span>
          </div>
          <div className="grid">
            {report?.byPaymentMethod?.length ? report.byPaymentMethod.map((method) => (
              <div className={dashboardListRowClass} key={method.paymentMethod}>
                <div>
                  <strong>{getPaymentMethodLabel(method.paymentMethod)}</strong>
                  <span>{method.salesCount} {method.salesCount === 1 ? "venta" : "ventas"}</span>
                </div>
                <div className={listRowEndClass}>
                  <strong>{formatClp(method.total)}</strong>
                </div>
              </div>
            )) : <p className={emptyStateClass}>No hay métodos de pago para resumir.</p>}
          </div>
        </article>
      </div>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Ventas del período</h2>
            <p>Historial activo y cancelado según los filtros seleccionados</p>
          </div>
          {loading && <span className={badgeClass("neutral")}>Cargando</span>}
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Cajero</th>
              <th>Método</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {report?.sales?.length ? report.sales.map((sale) => (
              <tr key={sale.id}>
                <td>#{sale.id}</td>
                <td>{formatDate(sale.date, REPORT_DATE_OPTIONS, "-")}</td>
                <td>{sale.cashierNames} {sale.cashierSurnames}</td>
                <td>{getPaymentMethodLabel(sale.paymentMethod)}</td>
                <td className={numericCellClass}>{formatClp(sale.total)}</td>
                <td>
                  <span className={badgeClass(sale.status === "ACTIVE" ? "success" : "critical")}>
                    {getSaleStatusLabel(sale.status)}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="p-[34px_18px]! text-center text-slate-500" colSpan="6">No hay ventas para los filtros seleccionados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
