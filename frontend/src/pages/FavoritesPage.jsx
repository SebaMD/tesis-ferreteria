import { Heart, RefreshCw } from "lucide-react";
import { useContext, useEffect } from "react";
import { Link } from "react-router-dom";
import FavoritesContext from "../context/FavoritesContext.js";
import ProductCard from "../components/ProductCard.jsx";

export default function FavoritesPage() {
  const { products, loading, error, reload, busy } = useContext(FavoritesContext);
  useEffect(() => {
    // Revalidate on entry, without polling; the provider shares any in-flight request.
    reload();
  }, [reload]);
  return (
    <main className="mx-auto grid w-full max-w-360 gap-6 px-6 py-8 max-[720px]:px-3.5">
      <header><h1 className="m-0 text-2xl font-bold text-ink-950">Favoritos</h1><p className="mt-2 text-sm text-slate-600">Productos guardados para tus próximas compras. La disponibilidad se valida al comprar.</p></header>
      {loading && <p role="status">Cargando favoritos...</p>}
      {error && <div role="alert" className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="m-0">{error}</p><button type="button" onClick={() => reload()} disabled={loading || busy.length > 0}><RefreshCw size={17} /> Reintentar</button></div>}
      {!loading && !error && products.length === 0 && <section className="grid justify-items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-12 text-center"><Heart size={36} className="text-slate-400" /><h2 className="m-0 text-lg">No tienes productos favoritos todavía</h2><Link to="/catalog">Volver al catálogo</Link></section>}
      <section className="grid grid-cols-4 gap-4 max-[1180px]:grid-cols-3 max-[880px]:grid-cols-2 max-[540px]:grid-cols-1" aria-label="Productos favoritos">
        {!loading && !error && products.map((product) => <ProductCard key={product.id} product={product} />)}
      </section>
    </main>
  );
}
