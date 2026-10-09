import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  PackageCheck,
  Percent,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppSelect from "../components/AppSelect.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp } from "../helpers/formatters.js";
import {
  buildDonutGradient,
  buildLineChart,
  dateInputValue,
  getStatisticsPeriodRange,
  STATISTICS_PERIOD_OPTIONS,
} from "../helpers/managerStatistics.js";
import {
  dashboardPanelClass,
  dashboardPanelHeadingClass,
  emptyStateClass,
  pageClass,
  pageHeaderClass,
  panelClass,
  panelCountClass,
  secondaryButtonClass,
} from "../helpers/uiClasses.js";
import { getManagerStatisticsRequest } from "../services/reports.service.js";

const DONUT_COLORS = ["#c2410c", "#0284c7", "#16a34a", "#7c3aed", "#ca8a04", "#dc2626"];
const metricCardClass = "grid min-h-[142px] content-between gap-3 rounded-md border border-slate-200 bg-white p-[18px] shadow-[0_1px_2px_rgba(16,21,31,0.04)]";
const metricLabelClass = "flex items-center gap-2 text-xs font-bold uppercase tracking-[0.02em] text-slate-500";

function paymentMethodLabel(value) {
  const labels = {
    efectivo: "Efectivo",
    debito: "Débito",
    credito: "Crédito",
    transferencia: "Transferencia",
    WEBPAY_PLUS: "Webpay Plus",
  };
  return labels[value] || value;
}

function shortDate(value) {
  if (!value) return "-";
  const [, month, day] = value.split("-");
  return `${day}-${month}`;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "neutral" }) {
  const toneClass = tone === "warning"
    ? "bg-rust-50 text-rust-600"
    : tone === "positive"
      ? "bg-positive-50 text-positive-600"
      : "bg-slate-100 text-ink-700";

  return (
    <article className={metricCardClass}>
      <div className={metricLabelClass}>
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] ${toneClass}`}><Icon size={18} /></span>
        <span>{label}</span>
      </div>
      <strong className="font-mono text-[25px] leading-tight text-ink-950">{value}</strong>
      <span className="text-xs font-semibold text-slate-500">{detail}</span>
    </article>
  );
}

function SalesEvolutionChart({ data = [] }) {
  const chart = useMemo(() => buildLineChart(data), [data]);
  const middle = data.length ? data[Math.floor((data.length - 1) / 2)] : null;
  const hasSales = data.some((item) => Number(item.netSales) > 0);

  return (
    <article className={`${dashboardPanelClass} min-w-0`}>
      <div className={dashboardPanelHeadingClass}>
        <div>
          <h2>Evolución de ventas</h2>
          <p>Monto neto diario, descontando devoluciones presenciales</p>
        </div>
        <TrendingUp className="shrink-0 text-rust-600" size={20} />
      </div>
      {hasSales ? (
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <span>Máximo diario</span>
            <strong className="font-mono text-ink-950">{formatClp(chart.maxValue)}</strong>
          </div>
          <svg
            className="block h-auto w-full overflow-visible"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label="Gráfico de evolución diaria del monto neto vendido"
          >
            {[0.25, 0.5, 0.75, 1].map((ratio) => (
              <line key={ratio} x1="18" x2="702" y1={18 + 176 * (1 - ratio)} y2={18 + 176 * (1 - ratio)} stroke="currentColor" className="text-slate-200" strokeWidth="1" />
            ))}
            <polygon points={chart.areaPoints} fill="rgba(234,88,12,0.12)" />
            <polyline points={chart.linePoints} fill="none" stroke="#c2410c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {chart.points.length <= 31 && chart.points.map((point) => (
              <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#c2410c" strokeWidth="3">
                <title>{point.date}: {formatClp(point.netSales)}</title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between gap-2 text-[11px] font-semibold text-slate-500">
            <span>{shortDate(data[0]?.date)}</span>
            <span>{shortDate(middle?.date)}</span>
            <span>{shortDate(data.at(-1)?.date)}</span>
          </div>
        </div>
      ) : <p className={emptyStateClass}>No existen ventas concretadas en este período.</p>}
    </article>
  );
}

function DistributionChart({ title, description, items = [], labelFor }) {
  const usefulItems = items.filter((item) => Number(item.amount) > 0);
  const gradient = buildDonutGradient(usefulItems, DONUT_COLORS);

  return (
    <article className={dashboardPanelClass}>
      <div className={dashboardPanelHeadingClass}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={panelCountClass}>{usefulItems.length}</span>
      </div>
      {usefulItems.length ? (
        <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-5 p-5 max-[560px]:grid-cols-1">
          <div className="relative mx-auto size-[142px] rounded-full" style={{ background: gradient }} role="img" aria-label={`${title}: distribución porcentual`}>
            <div className="absolute inset-[26px] grid place-items-center rounded-full bg-white text-center">
              <span className="text-[11px] font-bold uppercase text-slate-500">Total neto</span>
              <strong className="font-mono text-sm text-ink-950">{formatClp(usefulItems.reduce((sum, item) => sum + Number(item.amount), 0))}</strong>
            </div>
          </div>
          <div className="grid gap-3">
            {usefulItems.map((item, index) => (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-xs" key={item.channel || item.paymentMethod}>
                <span className="size-3 rounded-sm" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                <div className="min-w-0">
                  <strong className="block truncate text-ink-950">{labelFor(item)}</strong>
                  <span className="text-slate-500">{item.transactions} {item.transactions === 1 ? "operación" : "operaciones"}</span>
                </div>
                <div className="text-right">
                  <strong className="block font-mono text-ink-950">{item.percentage}%</strong>
                  <span className="font-mono text-[11px] text-slate-500">{formatClp(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : <p className={emptyStateClass}>No hay montos netos para distribuir.</p>}
    </article>
  );
}

function TopProducts({ products = [] }) {
  const maxUnits = Math.max(1, ...products.map((product) => Number(product.units)));
  return (
    <article className={dashboardPanelClass}>
      <div className={dashboardPanelHeadingClass}>
        <div>
          <h2>Productos más vendidos</h2>
          <p>Unidades netas: ventas menos devoluciones presenciales</p>
        </div>
        <span className={panelCountClass}>{products.length}</span>
      </div>
      {products.length ? (
        <div className="grid gap-4 p-5">
          {products.map((product, index) => (
            <div className="grid gap-1.5" key={product.productId}>
              <div className="flex min-w-0 items-end justify-between gap-3 text-xs">
                <strong className="min-w-0 truncate text-ink-950">{index + 1}. {product.productName}</strong>
                <span className="shrink-0 font-mono font-bold text-ink-950">{product.units} uds.</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-rust-500" style={{ width: `${Math.max(4, (Number(product.units) / maxUnits) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-slate-500">Ingreso neto asociado: {formatClp(product.revenue)}</span>
            </div>
          ))}
        </div>
      ) : <p className={emptyStateClass}>No hay productos vendidos en este período.</p>}
    </article>
  );
}

function LowStockProducts({ lowStock }) {
  const products = lowStock?.products || [];
  return (
    <article className={dashboardPanelClass}>
      <div className={dashboardPanelHeadingClass}>
        <div>
          <h2>Stock bajo o en mínimo</h2>
          <p>Productos activos con stock físico menor o igual al mínimo</p>
        </div>
        <span className={panelCountClass}>{lowStock?.count || 0}</span>
      </div>
      {products.length ? (
        <div className="max-h-[430px] overflow-y-auto">
          {products.map((product) => (
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-[18px] py-3 last:border-b-0" key={product.id}>
              <div className="min-w-0">
                <strong className="block truncate text-[13px] text-ink-950">{product.name}</strong>
                <span className="text-[11px] text-slate-500">{product.unitMeasure}</span>
              </div>
              <div className="shrink-0 text-right">
                <strong className="block font-mono text-sm text-critical-600">{product.currentStock} / {product.minimumStock}</strong>
                <span className="text-[11px] text-slate-500">Actual / mínimo</span>
              </div>
            </div>
          ))}
        </div>
      ) : <p className={emptyStateClass}>No hay productos activos bajo su stock mínimo.</p>}
    </article>
  );
}

export default function StatisticsPage() {
  const initialRange = useMemo(() => getStatisticsPeriodRange("last30"), []);
  const [period, setPeriod] = useState("last30");
  const [filters, setFilters] = useState(initialRange);
  const [appliedFilters, setAppliedFilters] = useState(initialRange);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const today = dateInputValue(new Date());

  const loadStatistics = async (nextFilters) => {
    setLoading(true);
    try {
      const data = await getManagerStatisticsRequest(nextFilters);
      setStatistics(data);
      setAppliedFilters(nextFilters);
    } catch (error) {
      toast.error(getApiError(error, "No se pudieron cargar las estadísticas"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatistics(initialRange);
  }, [initialRange]);

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") setFilters(getStatisticsPeriodRange(nextPeriod));
  };

  const handleDateChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value > today ? today : value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (filters.from > filters.to) {
      toast.error("La fecha desde no puede ser posterior a la fecha hasta");
      return;
    }
    loadStatistics(filters);
  };

  const handleReset = () => {
    const next = getStatisticsPeriodRange("last30");
    setPeriod("last30");
    setFilters(next);
    loadStatistics(next);
  };

  const kpis = statistics?.kpis || {};

  return (
    <section className={`${pageClass} content-start`}>
      <LoadingOverlay active={loading} />
      <div className={pageHeaderClass}>
        <div>
          <h1>Estadísticas</h1>
          <p>Indicadores descriptivos para apoyar decisiones comerciales y de stock.</p>
        </div>
      </div>

      <form className={`${panelClass} grid-cols-[minmax(210px,300px)_minmax(0,1fr)_auto] items-end max-[920px]:grid-cols-1`} onSubmit={handleSubmit}>
        <label>
          Período
          <AppSelect value={period} onChange={handlePeriodChange} options={STATISTICS_PERIOD_OPTIONS} ariaLabel="Seleccionar período estadístico" />
        </label>
        <div className={`grid gap-3 ${period === "custom" ? "grid-cols-2 max-[560px]:grid-cols-1" : "grid-cols-1"}`}>
          {period === "custom" ? (
            <>
              <label>Desde<input type="date" name="from" value={filters.from} max={filters.to || today} onChange={handleDateChange} required /></label>
              <label>Hasta<input type="date" name="to" value={filters.to} min={filters.from} max={today} onChange={handleDateChange} required /></label>
            </>
          ) : (
            <div className="flex min-h-10.25 items-center gap-2 rounded-[5px] border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-ink-700">
              <CalendarDays size={17} className="text-rust-600" />
              {filters.from} al {filters.to}
            </div>
          )}
        </div>
        <div className="flex gap-2 max-[560px]:flex-col">
          <button type="submit" disabled={loading}><BarChart3 size={17} /> Consultar</button>
          <button className={secondaryButtonClass} type="button" onClick={handleReset} disabled={loading}><RotateCcw size={16} /> Restablecer</button>
        </div>
      </form>

      <p className="m-0 text-xs font-semibold text-slate-500">Período consultado: {appliedFilters.from} al {appliedFilters.to}</p>

      <div className="grid grid-cols-4 gap-3.5 max-[1180px]:grid-cols-2 max-[620px]:grid-cols-1">
        <MetricCard icon={CircleDollarSign} label="Monto neto vendido" value={formatClp(kpis.netSales)} detail="Presencial neto + online pagado" tone="positive" />
        <MetricCard icon={ReceiptText} label="Monto original" value={formatClp(kpis.originalSales)} detail="Antes de devoluciones presenciales" />
        <MetricCard icon={Percent} label="Monto devuelto" value={formatClp(kpis.returnedAmount)} detail={`${Number(kpis.returnPercentage || 0).toLocaleString("es-CL")}% del monto original`} tone="warning" />
        <MetricCard icon={ShoppingBag} label="Operaciones pagadas" value={kpis.transactions ?? 0} detail="Ventas presenciales y pedidos online" />
        <MetricCard icon={TrendingUp} label="Ticket promedio neto" value={formatClp(kpis.averageTicket)} detail="Monto neto / operaciones pagadas" />
        <MetricCard icon={PackageCheck} label="Unidades vendidas" value={kpis.unitsSold ?? 0} detail="Unidades netas de devoluciones" />
        <MetricCard icon={Boxes} label="Productos vendidos" value={kpis.productsSold ?? 0} detail="Productos distintos con unidades netas" />
        <MetricCard icon={AlertTriangle} label="Productos a reponer" value={statistics?.lowStock?.count ?? 0} detail="Stock físico menor o igual al mínimo" tone="warning" />
      </div>

      <SalesEvolutionChart data={statistics?.evolution || []} />

      <div className="grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
        <DistributionChart title="Distribución por canal" description="Participación sobre el monto neto" items={statistics?.channels} labelFor={(item) => item.label} />
        <DistributionChart title="Distribución por método de pago" description="Métodos presentes en operaciones concretadas" items={statistics?.paymentMethods} labelFor={(item) => paymentMethodLabel(item.paymentMethod)} />
      </div>

      <div className="grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
        <TopProducts products={statistics?.topProducts} />
        <LowStockProducts lowStock={statistics?.lowStock} />
      </div>
    </section>
  );
}
