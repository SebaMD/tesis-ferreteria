import { BarChart3, CalendarDays, DollarSign, FileSpreadsheet, RotateCcw, Search, ShoppingCart, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import PeriodFilterPanel from "../components/PeriodFilterPanel.jsx";
import Pagination from "../components/Pagination.jsx";
import ResponsiveTableView, { MobileDetailField, MobileDetailGrid } from "../components/ResponsiveTableView.jsx";
import TableRecordCount from "../components/TableRecordCount.jsx";
import MobileTableTools from "../components/MobileTableTools.jsx";
import { downloadExcel } from "../helpers/excelExport.js";
import { compareByNewest, formatClp, formatDate, formatSaleFolio, getSaleTotals } from "../helpers/formatters.js";
import { formatWorkSchedule, getPaymentMethodLabel, getSaleStatusLabel } from "../helpers/labels.js";
import usePagination from "../hooks/usePagination.js";
import { getSalesReportRequest } from "../services/reports.service.js";
import { calendarDay, customPeriodError, customRangeBounds, initializeCustomRange, validCustomRange, reportDateError } from "../helpers/dateFilters.js";
import { getStatisticsPeriodRange, STATISTICS_PERIOD_OPTIONS } from "../helpers/managerStatistics.js";
import {
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
  panelCountClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
  tableScrollClass,
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

function getSaleStatusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "PARTIALLY_RETURNED") return "warning";
  return "critical";
}

function initialFilters() {
  const today = calendarDay(new Date(), "America/Santiago");
  return {
    mode: "single",
    from: today,
    to: today,
    cashierId: "",
    paymentMethod: "",
  };
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("today");
  const customRangeRef = useRef(null);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [cashierSummarySearch, setCashierSummarySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDateError, setShowDateError] = useState(false);
  const today = calendarDay(new Date(), "America/Santiago");
  const requestFilters = { ...filters, mode: period === "custom" ? "range" : filters.from === filters.to ? "single" : "range" };
  const dateError = customPeriodError(filters, period) || reportDateError(requestFilters, requestFilters.mode);
  const dateBounds = customRangeBounds(filters, today);

  const loadReport = async (nextFilters) => {
    const error = reportDateError(nextFilters, nextFilters.mode);
    if (error) { toast.error(error); return; }
    setLoading(true);

    try {
      const reportData = await getSalesReportRequest(nextFilters);
      setReport(reportData);
      setAppliedFilters(nextFilters);
    } catch (requestError) {
      toast.error(getApiError(requestError, "No se pudo cargar el reporte de ventas"));
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

    if (name === "from" || name === "to") {
      setShowDateError(true);
      if (period === "custom") {
        const next = { ...filters, [name]: value };
        if (validCustomRange(next, calendarDay(new Date(), "America/Santiago"))) customRangeRef.current = { from: next.from, to: next.to };
        setFilters(next);
        return;
      }
      setFilters((current) => ({ ...current, [name]: value }));
      return;
    }

    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleSingleDateChange = (event) => {
    setShowDateError(true);
    const value = event.target.value;
    setFilters((current) => ({ ...current, from: value, to: value }));
  };

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    setShowDateError(false);
    if (nextPeriod === "custom") {
      if (period === "custom") return;
      const next = initializeCustomRange(customRangeRef.current, calendarDay(new Date(), "America/Santiago"));
      customRangeRef.current = next;
      setFilters(current => ({ ...current, ...next }));
    } else if (nextPeriod === "day") setFilters(current => ({ ...current, to: current.from }));
    else if (nextPeriod !== "custom") setFilters(current => ({ ...current, ...getStatisticsPeriodRange(nextPeriod, new Date(), "America/Santiago") }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setShowDateError(true);
    if (dateError) { toast.error(dateError); return; }
    loadReport(requestFilters);
  };

  const handleReset = () => {
    const nextFilters = initialFilters();
    setPeriod("today");
    setShowDateError(false);
    setFilters(nextFilters);
    setCashierSummarySearch("");
    loadReport(nextFilters);
  };

  const topCashier = report?.byCashier?.find((cashier) => cashier.salesCount > 0);
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
  const reportPeriodMessage = report === null ? "Todavía no hay reportes consultados." : showingTodayReport
    ? "Mostrando reportes de ventas de hoy"
    : showingSingleDayReport
      ? `Mostrando ventas del día ${appliedFilters.from}`
      : `Mostrando ventas desde ${appliedFilters.from} hasta ${appliedFilters.to}`;
  const normalizedCashierSummarySearch = cashierSummarySearch.trim().toLocaleLowerCase("es");
  const displayedCashierSummary = useMemo(
    () => (report?.byCashier || []).filter((cashier) => {
      if (!normalizedCashierSummarySearch) return true;

      const searchableValues = [
        cashier.cashierName,
        cashier.cashierEmail,
        cashier.cashierId,
        cashier.workShift,
        cashier.shiftStartTime,
        cashier.shiftEndTime,
      ];

      return searchableValues.some((value) =>
        String(value || "").toLocaleLowerCase("es").includes(normalizedCashierSummarySearch),
      );
    }),
    [normalizedCashierSummarySearch, report],
  );
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
        { key: "fecha", header: "Fecha y hora" },
        { key: "cajero", header: "Cajero" },
        { key: "metodoPago", header: "Método de pago" },
        { key: "estado", header: "Estado" },
        { key: "totalOriginal", header: "Total original" },
        { key: "totalDevuelto", header: "Total devuelto" },
        { key: "totalNeto", header: "Total neto" },
      ],
      rows: reportSales.map((sale) => ({
        folio: formatSaleFolio(sale.id),
        fecha: formatDate(sale.date, REPORT_DATE_OPTIONS, "-"),
        cajero: `${sale.cashierNames || ""} ${sale.cashierSurnames || ""}`.trim(),
        metodoPago: getPaymentMethodLabel(sale.paymentMethod),
        estado: getSaleStatusLabel(sale.status),
        totalOriginal: getSaleTotals(sale).originalTotal,
        totalDevuelto: getSaleTotals(sale).returnedTotal,
        totalNeto: getSaleTotals(sale).netTotal,
      })),
    });
    toast.success("Reporte de ventas exportado exitosamente");
  };

  return (
    <section className={`${pageClass} content-start`}>
      <LoadingOverlay active={loading} />

      <div className={pageHeaderClass}>
        <div>
          <h1>Reportes de ventas</h1>
          <p>Consulta la recaudación por fecha, cajero y método de pago.</p>
        </div>
      </div>

      <PeriodFilterPanel title="Período del reporte" period={period} onPeriodChange={handlePeriodChange}
        options={STATISTICS_PERIOD_OPTIONS} selectLabel="Seleccionar período del reporte" onSubmit={handleSubmit}
        indicator={reportPeriodMessage} error={(showDateError || period === "custom") ? dateError : ""} errorId="report-range-error"
        dates={<>
            {period === "day" ? (
              <label>
                Fecha
                <input type="date" value={filters.from} max={today} onChange={handleSingleDateChange} required />
              </label>
            ) : period === "custom" ? (
              <>
                <label>
                  Desde
                  <input
                    type="date"
                    name="from"
                    value={filters.from}
                    min={dateBounds.fromMin}
                    max={dateBounds.fromMax}
                    aria-invalid={Boolean(dateError)}
                    aria-describedby={dateError ? "report-range-error" : undefined}
                    onChange={handleChange}
                    required
                  />
                </label>
                <label>
                  Hasta
                  <input type="date" name="to" value={filters.to} min={dateBounds.toMin} max={dateBounds.toMax} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "report-range-error" : undefined} onChange={handleChange} required />
                </label>
              </>
            ) : <div className="flex min-h-10 items-center gap-2 rounded-[5px] border border-slate-200 bg-slate-50 px-3 text-sm font-semibold"><CalendarDays size={17} className="text-rust-600" aria-hidden="true"/><span>{filters.from === filters.to ? filters.from : `${filters.from} al ${filters.to}`}</span></div>}
        </>}
        actions={<>
            <button type="submit" disabled={loading || Boolean(dateError)}>
              <BarChart3 size={18} />
              Consultar
            </button>
            <button className={secondaryButtonClass} type="button" onClick={handleReset} disabled={loading} title="Restablecer filtros">
              <RotateCcw size={17} />
              Limpiar
            </button>
        </>}
        footer={<p className="m-0 text-xs text-slate-500">Los límites de selección corresponden a la fecha actual en America/Santiago (Chile). En Rango personalizado, Desde debe ser anterior a Hasta. Para una sola fecha, utiliza Por día.</p>}/>

      <div className="grid grid-cols-3 gap-3.5 max-[720px]:grid-cols-1">
        <article className={reportMetricCardClass}>
          <div className={reportMetricHeaderClass}>
            <span className={reportMetricIconClasses.positive}><DollarSign size={20} /></span>
            <span>Total vendido</span>
          </div>
          <strong className={reportMetricValueClass}>{formatClp(report?.total)}</strong>
          <span className={reportMetricDescriptionClass}>Ventas activas y parcialmente devueltas</span>
        </article>
        <article className={reportMetricCardClass}>
          <div className={reportMetricHeaderClass}>
            <span className={reportMetricIconClasses.neutral}><ShoppingCart size={20} /></span>
            <span>Ventas incluidas</span>
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
          <span className={reportMetricDescriptionClass}>{topCashier ? formatClp(topCashier.total) : "Sin ventas incluidas en el período"}</span>
        </article>
      </div>

      <div className="grid grid-cols-2 items-start gap-4 max-[720px]:grid-cols-1">
        <article className={dashboardPanelClass}>
          <div className={dashboardPanelHeadingClass}>
            <div>
              <h2>Resumen por cajero</h2>
              <p>Ventas vigentes y total neto recaudado</p>
            </div>
            <span className={panelCountClass}>{displayedCashierSummary.length}</span>
          </div>
          {(report?.byCashier?.length || 0) > 0 && (
            <label className="relative mx-4.5 mt-3 block">
              <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={16} />
              <input
                className="min-h-9 pl-9.5 text-xs"
                value={cashierSummarySearch}
                onChange={(event) => setCashierSummarySearch(event.target.value)}
                placeholder="Buscar cajero"
                aria-label="Buscar cajero en resumen"
              />
            </label>
          )}
          <div className="grid">
            {displayedCashierSummary.length ? displayedCashierSummary.map((cashier) => (
              <div className={dashboardListRowClass} key={cashier.cashierId}>
                <div>
                  <strong>{cashier.cashierName || "Cajero sin nombre"}</strong>
                  <span>{cashier.cashierEmail || "Correo no registrado"}</span>
                  <span>{formatWorkSchedule(cashier)}</span>
                </div>
                <div className={listRowEndClass}>
                  <strong>{formatClp(cashier.total)}</strong>
                  <span>{cashier.salesCount} {cashier.salesCount === 1 ? "venta incluida" : "ventas incluidas"}</span>
                  <span>ID #{cashier.cashierId}</span>
                </div>
              </div>
            )) : (
              <p className={emptyStateClass}>
                {(report?.byCashier?.length || 0) > 0
                  ? "No hay cajeros que coincidan con la búsqueda."
                  : "No hay ventas para resumir."}
              </p>
            )}
          </div>
        </article>

        <article className={dashboardPanelClass}>
          <div className={dashboardPanelHeadingClass}>
            <div>
              <h2>Resumen por método de pago</h2>
              <p>Distribución del total neto</p>
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
            <p><TableRecordCount
              visibleCount={salesPagination.paginatedItems.length}
              totalCount={reportSales.length}
              filteredCount={reportSales.length}
              hasFilters
              mobilePage={salesPagination.page}
              mobilePageSize={salesPagination.pageSize}
            /></p>
          </div>
          <MobileTableTools exportAction={{ onClick: handleExportSales, disabled: loading || reportSales.length === 0, label: "Exportar reporte a Excel" }} />
          <div className="flex flex-wrap items-center justify-end gap-2 max-[720px]:hidden">
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
        <ResponsiveTableView
          rows={salesPagination.paginatedItems}
          getRowKey={(sale) => sale.id}
          getRowLabel={(sale) => formatSaleFolio(sale.id)}
          resetKey={`${salesPagination.page}|${appliedFilters.from}|${appliedFilters.to}|${appliedFilters.cashierId}|${appliedFilters.paymentMethod}`}
          emptyMessage="No hay ventas para los filtros seleccionados."
          renderSummary={(sale) => (
            <div className="grid min-w-0 gap-2">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <strong className="font-mono text-sm text-ink-950">{formatSaleFolio(sale.id)}</strong>
                <span className={badgeClass(getSaleStatusTone(sale.status))}>{getSaleStatusLabel(sale.status)}</span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="text-xs text-slate-500">{formatDate(sale.date, REPORT_DATE_OPTIONS, "-")}</span>
                <strong className="font-mono text-sm text-ink-950">{formatClp(getSaleTotals(sale).netTotal)}</strong>
              </div>
            </div>
          )}
          renderDetails={(sale) => (
            <MobileDetailGrid>
              <MobileDetailField label="Cajero" wide>{sale.cashierNames} {sale.cashierSurnames}</MobileDetailField>
              <MobileDetailField label="Método">{getPaymentMethodLabel(sale.paymentMethod)}</MobileDetailField>
              <MobileDetailField label="Total original">{formatClp(getSaleTotals(sale).originalTotal)}</MobileDetailField>
              <MobileDetailField label="Devuelto">{formatClp(getSaleTotals(sale).returnedTotal)}</MobileDetailField>
              <MobileDetailField label="Total neto">{formatClp(getSaleTotals(sale).netTotal)}</MobileDetailField>
            </MobileDetailGrid>
          )}
          desktop={(
        <div className={tableScrollClass}>
          <table className="fyf-data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha y hora</th>
                <th>Cajero</th>
                <th>Método</th>
                <th>Total original</th>
                <th>Devuelto</th>
                <th>Total neto</th>
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
                  <td className={numericCellClass}>{formatClp(getSaleTotals(sale).originalTotal)}</td>
                  <td className={numericCellClass}>{formatClp(getSaleTotals(sale).returnedTotal)}</td>
                  <td className={numericCellClass}>{formatClp(getSaleTotals(sale).netTotal)}</td>
                  <td>
                    <span className={badgeClass(getSaleStatusTone(sale.status))}>
                      {getSaleStatusLabel(sale.status)}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className={emptyTableCellClass} colSpan="8">No hay ventas para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          )}
        />
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
