import { AlertTriangle, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductCard from "../components/ProductCard.jsx";
import AppModal from "../components/AppModal.jsx";
import CatalogFilters from "../components/CatalogFilters.jsx";
import BackToTop from "../components/BackToTop.jsx";
import { CATALOG_SORT_OPTIONS, EMPTY_CATALOG_FILTERS, filterAndSortCatalog, getCatalogBrands } from "../helpers/catalogFilters.js";
import { CATALOG_BACKGROUND_IMAGE } from "../helpers/catalogAppearance.js";
import { getCatalogProductsRequest } from "../services/catalog.service.js";

export default function CatalogPage() {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(EMPTY_CATALOG_FILTERS);
  const [order, setOrder] = useState("name-asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadCatalog = useCallback(async ({ showLoading = false, notifyError = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getCatalogProductsRequest();
      setProducts(data);
      setLoadError("");
    } catch (error) {
      const message = getApiError(error, "No se pudo cargar el catálogo");
      setLoadError(message);
      if (notifyError) toast.error(message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCatalog({ showLoading: true, notifyError: true });
    const refreshCatalog = () => loadCatalog();
    const refreshTimer = window.setInterval(refreshCatalog, 30_000);
    window.addEventListener("focus", refreshCatalog);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCatalog);
    };
  }, [loadCatalog]);

  const categories = useMemo(() => (
    [...new Map(products.map((product) => [product.categoryId, {
      id: product.categoryId,
      name: product.categoryName,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"))
  ), [products]);

  const brands = useMemo(() => getCatalogBrands(products), [products]);
  const filteredProducts = useMemo(() => filterAndSortCatalog(products, filters, order), [products, filters, order]);
  const activeCount = Object.entries(filters).filter(([key, value]) => value !== EMPTY_CATALOG_FILTERS[key]).length;
  const advancedFilterCount = ["minPrice", "maxPrice", "brand", "availability"]
    .filter((key) => filters[key] !== EMPTY_CATALOG_FILTERS[key]).length;
  const filterProps = { filters, onChange: setFilters, onClear: () => setFilters(EMPTY_CATALOG_FILTERS), brands };
  const changeFilter = (field) => (event) => setFilters((current) => ({
    ...current,
    [field]: event.target.value,
  }));

  return (
    <main className="mx-auto grid w-full max-w-360 gap-6 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />
      <section className="rounded-lg bg-ink-950 bg-[linear-gradient(120deg,rgba(217,119,6,0.22),transparent_60%)] px-7 py-8 text-white max-[620px]:px-5">
        <span className="text-xs font-extrabold text-rust-500 uppercase">Catálogo Ferretería FYF</span>
        <h1 className="mt-2 mb-2 max-w-180 text-3xl font-bold max-[620px]:text-2xl">Encuentra materiales y herramientas para tu próximo proyecto</h1>
        <p className="m-0 max-w-180 text-sm leading-6 text-slate-300">Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.</p>
      </section>

      {loadError && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <span className="flex items-center gap-2"><AlertTriangle size={18} />{loadError}</span>
          <button className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100" type="button" onClick={() => loadCatalog({ showLoading: true })} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} /> Reintentar
          </button>
        </section>
      )}

      <section className="rounded-lg bg-slate-100 bg-cover bg-center bg-no-repeat" style={CATALOG_BACKGROUND_IMAGE ? { backgroundImage: `url(${CATALOG_BACKGROUND_IMAGE})` } : undefined}>
        <div className="grid gap-4 rounded-lg bg-white/85 p-4 max-[720px]:p-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-bold text-ink-950">Productos</h2>
              <span className="text-xs font-semibold text-slate-500">{filteredProducts.length} productos en catálogo</span>
              {activeCount > 0 && <span className="ml-2 text-xs font-bold text-rust-700">· {activeCount} filtros activos</span>}
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 min-[1024px]:grid-cols-[minmax(240px,1fr)_220px_220px]">
            <label className="relative grid min-w-0 gap-1 text-xs font-semibold max-[1023px]:col-span-3">
              Buscar producto
              <Search className="pointer-events-none absolute bottom-3 left-3 text-slate-400" size={17} aria-hidden="true" />
              <input className="min-h-11 w-full pl-9" type="search" value={filters.search} onChange={changeFilter("search")} placeholder="Buscar producto..." />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold">
              Categoría
              <select className="min-h-11 w-full text-xs" value={filters.categoryId} onChange={changeFilter("categoryId")}>
                <option value="">Todas</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold min-[1024px]:col-start-3">
              Ordenar por
              <select value={order} onChange={(event) => setOrder(event.target.value)} className="min-h-11 w-full text-xs">
                {CATALOG_SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="min-h-11 shrink-0 border-slate-300 bg-white px-3 text-xs text-ink-700 hover:bg-slate-100 min-[1024px]:hidden" type="button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={17} /> Filtrar{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
            </button>
          </div>
          <div className="grid min-w-0 grid-cols-[240px_minmax(0,1fr)] items-start gap-5 max-[1023px]:grid-cols-1">
            <aside className="rounded-lg border border-slate-200 bg-white p-4 max-[1023px]:hidden" aria-label="Filtros del catálogo">
              <CatalogFilters {...filterProps} />
            </aside>
            <div className="min-w-0">
              <section className="grid grid-cols-3 gap-4 max-[1250px]:grid-cols-2 max-[600px]:grid-cols-1" aria-label="Productos del catálogo">
                {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
              </section>
              {!loading && !loadError && filteredProducts.length === 0 && (
                <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
                  No encontramos productos con esos filtros.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <AppModal open={filtersOpen} title="Filtrar productos" onClose={() => setFiltersOpen(false)} size="small" footer={<button type="button" onClick={() => setFiltersOpen(false)}>Ver {filteredProducts.length} productos</button>}><CatalogFilters {...filterProps} /></AppModal>
      <BackToTop />
    </main>
  );
}
