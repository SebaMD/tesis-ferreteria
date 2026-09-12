import { Heart, RefreshCw, ShoppingCart } from "lucide-react";
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
    <main className="mx-auto grid w-full max-w-260 gap-8 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="m-0 text-3xl font-bold text-ink-950 max-[520px]:text-2xl">Favoritos</h1><p className="mt-1.5 mb-0 text-sm text-slate-500">Productos guardados para tus próximas compras. La disponibilidad se valida al comprar.</p></div>
        {!loading && !error && products.length > 0 && (
          <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-rust-600 no-underline" to="/catalog"><ShoppingCart size={17} /> Volver al catálogo</Link>
        )}
      </header>
      {loading && <p role="status">Cargando favoritos...</p>}
      {error && <div role="alert" className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="m-0">{error}</p><button type="button" onClick={() => reload()} disabled={loading || busy.length > 0}><RefreshCw size={17} /> Reintentar</button></div>}
      {!loading && !error && products.length === 0 && <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><div className="grid justify-items-center gap-3"><Heart size={46} className="text-slate-400" /><strong className="text-lg text-ink-950">No tienes productos favoritos todavía</strong><span className="text-sm text-slate-500">Guarda productos desde el catálogo para encontrarlos rápidamente.</span><Link className="font-bold text-rust-600 hover:text-rust-700" to="/catalog">Explorar catálogo</Link></div></section>}
      <section className="grid grid-cols-4 gap-4 max-[1180px]:grid-cols-3 max-[880px]:grid-cols-2 max-[600px]:gap-2.5" aria-label="Productos favoritos">
        {!loading && !error && products.map((product) => <ProductCard key={product.id} product={product} />)}
      </section>
    </main>
  );
}
