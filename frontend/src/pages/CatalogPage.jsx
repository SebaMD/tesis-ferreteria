import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductCard from "../components/ProductCard.jsx";
import useCart from "../hooks/useCart.js";
import { getCatalogProductsRequest } from "../services/catalog.service.js";

export default function CatalogPage() {
  const { addItem } = useCart();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCatalog = (notifyError = false) => getCatalogProductsRequest()
      .then(setProducts)
      .catch((error) => {
        if (notifyError) toast.error(getApiError(error, "No se pudo cargar el catálogo"));
      })
      .finally(() => setLoading(false));

    loadCatalog(true);
    const refreshCatalog = () => loadCatalog(false);
    const refreshTimer = window.setInterval(refreshCatalog, 30_000);
    window.addEventListener("focus", refreshCatalog);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCatalog);
    };
  }, []);

  const categories = useMemo(() => (
    [...new Map(products.map((product) => [product.categoryId, {
      id: product.categoryId,
      name: product.categoryName,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"))
  ), [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");

    return products.filter((product) => {
      const matchesCategory = !categoryId || String(product.categoryId) === categoryId;
      const matchesSearch = !normalizedSearch
        || product.name.toLocaleLowerCase("es").includes(normalizedSearch)
        || product.categoryName.toLocaleLowerCase("es").includes(normalizedSearch)
        || String(product.description || "").toLocaleLowerCase("es").includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [categoryId, products, search]);

  const handleAdd = (product) => {
    const result = addItem(product, 1);
    if (result.success) toast.success(`${product.name} agregado al carrito`);
    else toast.error(result.message);
  };

  return (
    <main className="mx-auto grid w-full max-w-360 gap-6 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />
      <section className="rounded-lg bg-ink-950 bg-[linear-gradient(120deg,rgba(217,119,6,0.22),transparent_60%)] px-7 py-8 text-white max-[620px]:px-5">
        <span className="text-xs font-extrabold text-rust-500 uppercase">Catálogo Ferretería FYF</span>
        <h1 className="mt-2 mb-2 max-w-180 text-3xl font-bold max-[620px]:text-2xl">Encuentra materiales y herramientas para tu próximo proyecto</h1>
        <p className="m-0 max-w-180 text-sm leading-6 text-slate-300">Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.</p>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="relative min-w-65 flex-1 max-[620px]:min-w-0">
          <span className="sr-only">Buscar productos</span>
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={18} />
          <input className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar productos..." />
        </label>
        <label className="relative w-full max-w-70 max-[620px]:max-w-none">
          <span className="sr-only">Filtrar por categoría</span>
          <SlidersHorizontal className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
          <select className="pl-10" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-bold text-ink-950">Productos</h2>
        <span className="text-xs font-semibold text-slate-500">{filteredProducts.length} productos en catálogo</span>
      </div>

      <section className="grid grid-cols-4 gap-4 max-[1180px]:grid-cols-3 max-[880px]:grid-cols-2 max-[540px]:grid-cols-1">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={handleAdd} />
        ))}
      </section>

      {!loading && filteredProducts.length === 0 && (
        <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
          No encontramos productos con esos filtros.
        </p>
      )}
    </main>
  );
}
