import { AlertTriangle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductCard from "../components/ProductCard.jsx";
import AppModal from "../components/AppModal.jsx";
import CatalogFilters from "../components/CatalogFilters.jsx";
import BackToTop from "../components/BackToTop.jsx";
import AppSelect from "../components/AppSelect.jsx";
import CatalogNoticeCarousel from "../components/CatalogNoticeCarousel.jsx";
import CatalogPagination from "../components/CatalogPagination.jsx";
import { CATALOG_SORT_OPTIONS, EMPTY_CATALOG_FILTERS, validatePriceRange } from "../helpers/catalogFilters.js";
import { getCatalogProductsRequest } from "../services/catalog.service.js";

const EMPTY_PAGINATION = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };

export default function CatalogPage() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(EMPTY_CATALOG_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [order, setOrder] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [facets, setFacets] = useState({ categories: [], brands: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestSequence = useRef(0);
  const gridStartRef = useRef(null);
  const search = searchParams.get("search") || "";

  const priceRange = validatePriceRange(filters.minPrice, filters.maxPrice);
  const catalogQuery = useMemo(() => ({
    page,
    limit: pageSize,
    search: debouncedSearch || undefined,
    categoryId: filters.categoryId || undefined,
    brand: filters.brand || undefined,
    availability: filters.availability,
    sort: order,
    minPrice: priceRange.valid && priceRange.min !== null ? priceRange.min : undefined,
    maxPrice: priceRange.valid && priceRange.max !== null ? priceRange.max : undefined,
    promotionTypes: [
      filters.percentageDiscount ? "PERCENTAGE_DISCOUNT" : null,
      filters.buy2Pay1 ? "BUY_2_PAY_1" : null,
    ].filter(Boolean).join(",") || undefined,
  }), [debouncedSearch, filters.availability, filters.brand, filters.buy2Pay1, filters.categoryId, filters.percentageDiscount, order, page, pageSize, priceRange.max, priceRange.min, priceRange.valid]);

  const loadCatalog = useCallback(async ({ showLoading = false, notifyError = false } = {}) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (showLoading) setLoading(true);
    try {
      const data = await getCatalogProductsRequest(catalogQuery);
      if (requestSequence.current === sequence) {
        setProducts(data.items || []);
        setPagination({
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
        });
        setFacets(data.facets || { categories: [], brands: [] });
        if (data.page !== page) setPage(data.page);
        setLoadError("");
      }
    } catch (error) {
      const message = getApiError(error, "No se pudo cargar el catálogo");
      if (requestSequence.current === sequence) {
        setLoadError(message);
        if (notifyError) toast.error(message);
      }
    } finally {
      if (showLoading && requestSequence.current === sequence) setLoading(false);
    }
  }, [catalogQuery, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  const categories = facets.categories;
  const brands = facets.brands;
  const activeCount = Object.entries(filters).filter(([key, value]) => value !== EMPTY_CATALOG_FILTERS[key]).length + (search.trim() ? 1 : 0);
  const advancedFilterCount = ["minPrice", "maxPrice", "brand", "availability", "percentageDiscount", "buy2Pay1"]
    .filter((key) => filters[key] !== EMPTY_CATALOG_FILTERS[key]).length;
  const updateFilters = (next) => {
    setFilters(next);
    setPage(1);
  };
  const filterProps = { filters, onChange: updateFilters, onClear: () => updateFilters(EMPTY_CATALOG_FILTERS), brands };
  const setFilterValue = (field, value) => updateFilters({ ...filters, [field]: value });
  const changeOrder = (value) => {
    setOrder(value);
    setPage(1);
  };
  const changePageSize = (value) => {
    setPageSize(value);
    setPage(1);
  };
  const changePage = (value, { scrollToGrid = true } = {}) => {
    const next = Math.min(Math.max(1, value), Math.max(1, pagination.totalPages));
    if (next === page) return;
    setPage(next);
    if (scrollToGrid) {
      window.requestAnimationFrame(() => gridStartRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      }));
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-360 gap-6 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />
      <CatalogNoticeCarousel />

      {loadError && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <span className="flex items-center gap-2"><AlertTriangle size={18} />{loadError}</span>
          <button className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100" type="button" onClick={() => loadCatalog({ showLoading: true })} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} /> Reintentar
          </button>
        </section>
      )}

      <section className="grid min-w-0 gap-4">
        <div>
          <h2 className="m-0 text-lg font-bold text-ink-950">Productos</h2>
          <span className="text-xs font-semibold text-slate-500">{pagination.totalItems} productos en catálogo</span>
          {activeCount > 0 && <span className="ml-2 text-xs font-bold text-rust-700">· {activeCount} filtros activos</span>}
        </div>

        <div className="grid min-w-0 gap-3 min-[1024px]:grid-cols-[minmax(0,1fr)_auto] min-[1024px]:items-end">
          <div className="grid min-w-0 grid-cols-[minmax(0,190px)_minmax(0,210px)_auto] items-end gap-2 max-[620px]:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs font-semibold">
              Categoría
              <AppSelect className="text-xs" value={filters.categoryId} onChange={(value) => setFilterValue("categoryId", value)} ariaLabel="Filtrar por categoría" options={[{ value: "", label: "Todas" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold">
              Ordenar por
              <AppSelect className="text-xs" value={order} onChange={changeOrder} ariaLabel="Ordenar catálogo" options={CATALOG_SORT_OPTIONS.map(([value, label]) => ({ value, label }))} />
            </label>
            <button className="min-h-10 shrink-0 border-slate-300 bg-white px-3 text-xs text-ink-700 hover:bg-slate-100 min-[1024px]:hidden max-[620px]:col-span-2" type="button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={17} /> Filtrar{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
            </button>
          </div>
          <CatalogPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            loading={loading}
            onPageChange={(value) => changePage(value, { scrollToGrid: true })}
            onPageSizeChange={changePageSize}
          />
        </div>

        <div className="grid min-w-0 grid-cols-[240px_minmax(0,1fr)] items-start gap-5 max-[1023px]:grid-cols-1">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 max-[1023px]:hidden" aria-label="Filtros del catálogo">
            <CatalogFilters {...filterProps} />
          </aside>
          <div className="min-w-0 scroll-mt-4" ref={gridStartRef}>
            <section className="grid grid-cols-3 gap-4 max-[1250px]:grid-cols-2 max-[600px]:gap-2.5" aria-label="Productos del catálogo">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </section>
            {!loading && !loadError && products.length === 0 && (
              <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
                No encontramos productos con esos filtros.
              </p>
            )}
            <CatalogPagination
              className="mt-4"
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              totalPages={pagination.totalPages}
              loading={loading}
              onPageChange={(value) => changePage(value, { scrollToGrid: false })}
              showPageSize={false}
              ariaLabel="Paginación inferior del catálogo"
            />
          </div>
        </div>
      </section>
      <AppModal open={filtersOpen} title="Filtrar productos" onClose={() => setFiltersOpen(false)} size="small" footer={<button type="button" onClick={() => setFiltersOpen(false)}>Ver {pagination.totalItems} productos</button>}><CatalogFilters {...filterProps} /></AppModal>
      <BackToTop />
    </main>
  );
}
