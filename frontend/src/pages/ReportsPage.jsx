import { BarChart3, DollarSign, FileSpreadsheet, Filter, RotateCcw, ShoppingCart, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import Pagination from "../components/Pagination.jsx";
import { downloadExcel } from "../helpers/excelExport.js";
import { compareByNewest, formatClp, formatDate, formatSaleFolio } from "../helpers/formatters.js";
import { getPaymentMethodLabel, getSaleStatusLabel } from "../helpers/labels.js";
import { PAYMENT_METHODS } from "../helpers/options.js";
import usePagination from "../hooks/usePagination.js";
import { getSalesByCashierReportRequest, getSalesReportRequest } from "../services/reports.service.js";
import {
  alertClasses,
  badgeClass,
  dashboardListRowClass,
  dashboardPanelClass,
  dashboardPanelHeadingClass,
  emptyTableCellClass,
  emptyStateClass,
  listRowEndClass,
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

const reportMetricCardClass = "grid min-h-[136px] content-start gap-3 rounded-md border border-slate-200 bg-white p-[18px] shadow-[0_1px_2px_rgba(16,21,31,0.04)]";
const reportMetricHeaderClass = "flex items-center gap-3 [&>span:last-child]:text-xs [&>span:last-child]:font-bold [&>span:last-child]:uppercase [&>span:last-child]:tracking-[0.02em] [&>span:last-child]:text-slate-500";
const reportMetricValueClass = "font-mono text-[28px] font-bold leading-tight text-ink-950";
const reportMetricDescriptionClass = "text-xs font-semibold text-slate-500";
const reportMetricIconClasses = {
  neutral: "inline-flex size-[38px] shrink-0 items-center justify-center rounded-[5px] bg-slate-100 text-ink-700",
  warning: "inline-flex size-[38px] shrink-0 items-center justify-center rounded-[5px] bg-rust-50 text-rust-600",
  positive: "inline-flex size-[38px] shrink-0 items-center justify-center rounded-[5px] bg-positive-50 text-positive-600",
};

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialFilters() {
  const today = dateInputValue(new Date());
  return {
    from: today,
    to: today,
    cashierId: "",
    paymentMethod: "",
  };
}

export default function ReportsPage() {
  const [dateMode, setDateMode] = useState("single");
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
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
      setAppliedFilters(nextFilters);
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

  const handleSingleDateChange = (event) => {
    const { value } = event.target;
    setFilters((current) => ({ ...current, from: value, to: value }));
  };

  const handleDateModeChange = (mode) => {
    setDateMode(mode);

    if (mode === "single") {
      setFilters((current) => ({ ...current, to: current.from }));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    loadReport(filters);
  };

  const handleReset = () => {
    const nextFilters = initialFilters();
    setDateMode("single");
    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const topCashier = report?.byCashier?.find((cashier) => cashier.salesCount > 0);
  const today = dateInputValue(new Date());
  const reportSales = useMemo(
    () => [...(report?.sales || [])].sort(compareByNewest),
    [report],
  );
  const salesPagination = usePagination(reportSales, {
    resetKey: `${appliedFilters.from}|${appliedFilters.to}|${appliedFilters.cashierId}|${appliedFilters.paymentMethod}|${reportSales.length}`,
  });
  const showingTodayReport =
    appliedFilters.from === today &&
    appliedFilters.to === today;
  const showingSingleDayReport = appliedFilters.from === appliedFilters.to;
  const exportFilenameDate =
    appliedFilters.from === appliedFilters.to
      ? appliedFilters.from
      : `${appliedFilters.from}_a_${appliedFilters.to}`;

  const handleExportSales = () => {
    downloadExcel({
      filename: `reporte-ventas-${exportFilenameDate}.xlsx`,
      sheetName: "Ventas",
      columns: [
        { key: "folio", header: "Folio de venta" },
        { key: "fecha", header: "Fecha" },
        { key: "cajero", header: "Cajero" },
        { key: "metodoPago", header: "Método de pago" },
        { key: "estado", header: "Estado" },
        { key: "total", header: "Total" },
      ],
      rows: reportSales.map((sale) => ({
        folio: formatSaleFolio(sale.id),
        fecha: formatDate(sale.date, REPORT_DATE_OPTIONS, "-"),
        cajero: `${sale.cashierNames || ""} ${sale.cashierSurnames || ""}`.trim(),
        metodoPago: getPaymentMethodLabel(sale.paymentMethod),
        estado: getSaleStatusLabel(sale.status),
        total: Number(sale.total || 0),
      })),
    });
  };

  return (
    <section className={`${pageClass} content-start`}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Reportes de ventas</h1>
          <p>Consulta la recaudación por fecha, cajero y método de pago.</p>
        </div>
      </div>

      <form className={`${panelClass} gap-4.5`} onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-4 max-[720px]:flex-col max-[720px]:items-stretch">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-rust-50 text-rust-600"><Filter size={18} /></span>
            <div>
              <h2 className="m-0 text-base font-bold text-ink-950">Filtros</h2>
              <p className="mt-1 mb-0 text-xs text-slate-500">Las ventas canceladas se muestran en el historial, pero no se suman.</p>
            </div>
          </div>
          <div className="flex w-fit max-w-full shrink-0 rounded-[5px] border border-slate-200 bg-slate-50 p-1 max-[720px]:w-full">
            <button
              className={`min-h-8 flex-1 px-3 py-1.5 text-xs ${dateMode === "single" ? "bg-rust-500 text-white hover:bg-rust-600" : "bg-transparent text-ink-700 hover:bg-slate-100"}`}
              type="button"
              onClick={() => handleDateModeChange("single")}
            >
              Un día
            </button>
            <button
              className={`min-h-8 flex-1 px-3 py-1.5 text-xs ${dateMode === "range" ? "bg-rust-500 text-white hover:bg-rust-600" : "bg-transparent text-ink-700 hover:bg-slate-100"}`}
              type="button"
              onClick={() => handleDateModeChange("range")}
            >
              Rango de fechas
            </button>
          </div>
        </div>
        <div className={`${dateMode === "single" ? "grid-cols-[repeat(3,minmax(150px,1fr))_auto]" : "grid-cols-[repeat(4,minmax(150px,1fr))_auto]"} grid items-end gap-3 max-[980px]:grid-cols-2 max-[720px]:grid-cols-1`}>
          {dateMode === "single" ? (
            <label>
              Fecha
              <input type="date" value={filters.from} onChange={handleSingleDateChange} required />
            </label>
          ) : (
            <>
              <label>
                Desde
                <input type="date" name="from" value={filters.from} max={filters.to} onChange={handleChange} required />
              </label>
              <label>
                Hasta
                <input type="date" name="to" value={filters.to} min={filters.from} onChange={handleChange} required />
              </label>
            </>
          )}
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

      <div className="w-fit max-w-full rounded-[5px] border border-rust-500 bg-rust-50 px-3.5 py-2.5 text-[13px] font-semibold text-[#92400e]">
        {showingTodayReport
          ? "Mostrando reportes de ventas de hoy"
          : showingSingleDayReport
            ? `Mostrando ventas del día ${appliedFilters.from}`
            : `Mostrando ventas desde ${appliedFilters.from} hasta ${appliedFilters.to}`}
      </div>

      {error && <div className={alertClasses.error}>{error}</div>}

      <div className="grid grid-cols-3 gap-3.5 max-[720px]:grid-cols-1">
        <article className={reportMetricCardClass}>
          <div className={reportMetricHeaderClass}>
            <span className={reportMetricIconClasses.positive}><DollarSign size={20} /></span>
            <span>Total vendido</span>
          </div>
          <strong className={reportMetricValueClass}>{formatClp(report?.total)}</strong>
          <span className={reportMetricDescriptionClass}>Solo ventas activas del período</span>
        </article>
        <article className={reportMetricCardClass}>
          <div className={reportMetricHeaderClass}>
            <span className={reportMetricIconClasses.neutral}><ShoppingCart size={20} /></span>
            <span>Ventas activas</span>
          </div>
          <strong className={reportMetricValueClass}>{report?.salesCount ?? 0}</strong>
          <span className={reportMetricDescriptionClass}>Operaciones incluidas en el total</span>
        </article>
        <article className={reportMetricCardClass}>
          <div className={reportMetricHeaderClass}>
            <span className={reportMetricIconClasses.warning}><UserRound size={20} /></span>
            <span>Mayor total por cajero</span>
          </div>
          <strong className={`${reportMetricValueClass} max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xl`}>{topCashier?.cashierName || "Sin ventas"}</strong>
          <span className={reportMetricDescriptionClass}>{topCashier ? formatClp(topCashier.total) : "Sin ventas activas en el período"}</span>
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {loading && <span className={badgeClass("neutral")}>Cargando</span>}
            <button
              className={`${secondaryButtonClass} mr-0`}
              type="button"
              onClick={handleExportSales}
              disabled={loading || reportSales.length === 0}
            >
              <FileSpreadsheet size={17} />
              Exportar Excel
            </button>
          </div>
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
            {reportSales.length ? salesPagination.paginatedItems.map((sale) => (
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
                <td className={emptyTableCellClass} colSpan="6">No hay ventas para los filtros seleccionados.</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={salesPagination.page}
          pageSize={salesPagination.pageSize}
          totalItems={salesPagination.totalItems}
          totalPages={salesPagination.totalPages}
          onPageChange={salesPagination.setPage}
        />
      </div>
    </section>
  );
}
