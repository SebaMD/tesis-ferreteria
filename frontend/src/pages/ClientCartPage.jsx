import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import { getCatalogProductsRequest } from "../services/catalog.service.js";

function getPrimaryImage(product) {
  return product?.images?.find((image) => image.isPrimary) || product?.images?.[0] || null;
}

export default function ClientCartPage() {
  const { items, removeItem, updateQuantity, clearCart } = useCart();
  const { isAuthenticated, user } = useAuth();
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAvailability = (notifyError = false) => getCatalogProductsRequest()
      .then(setCatalogProducts)
      .catch((error) => {
        if (notifyError) toast.error(getApiError(error, "No se pudo actualizar la disponibilidad"));
      })
      .finally(() => setLoading(false));

    loadAvailability(true);
    const refreshAvailability = () => loadAvailability(false);
    const refreshTimer = window.setInterval(refreshAvailability, 30_000);
    window.addEventListener("focus", refreshAvailability);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshAvailability);
    };
  }, []);

  const liveProductById = useMemo(
    () => new Map(catalogProducts.map((product) => [Number(product.id), product])),
    [catalogProducts],
  );
  const rows = items.map((item) => {
    const liveProduct = liveProductById.get(Number(item.product.id));
    const product = liveProduct || item.product;
    const availableStock = liveProduct ? getOnlineAvailableStock(liveProduct) : 0;
    const available = Boolean(liveProduct && availableStock > 0);
    const quantity = Number(item.quantity);
    return { ...item, product, available, availableStock, requestedQuantity: quantity, quantity };
  });
  const total = rows.reduce(
    (sum, row) => sum + Number(row.product.price || 0) * Number(row.quantity || 0),
    0,
  );

  const changeQuantity = (row, quantity) => {
    if (!row.available) return;
    if (quantity < 1) {
      removeItem(row.product.id);
      return;
    }
    if (!updateQuantity(row.product.id, quantity, row.availableStock)) {
      toast.error(`Solo hay ${row.availableStock} unidades disponibles`);
    }
  };

  const hasAvailabilityConflicts = rows.some(
    (row) => !row.available || row.requestedQuantity > row.availableStock,
  );
  const isClient = isAuthenticated && user?.role === "CLIENT";

  return (
    <main className="mx-auto grid w-full max-w-280 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <LoadingOverlay active={loading} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-2xl font-bold text-ink-950"><ShoppingCart size={24} /> Carrito</h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">Revisa tus productos antes de reservar stock e iniciar el pago.</p>
        </div>
        {items.length > 0 && (
          <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={clearCart}>Limpiar carrito</button>
        )}
      </div>

      {items.length === 0 ? (
        <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="grid justify-items-center gap-3">
            <ShoppingCart className="text-slate-400" size={45} />
            <strong className="text-lg text-ink-950">Tu carrito está vacío</strong>
            <Link className="font-bold text-rust-600" to="/catalog">Explorar catálogo</Link>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 max-[860px]:grid-cols-1">
          <section className="grid gap-3">
            {rows.map((row) => {
              const image = getPrimaryImage(row.product);
              const invalidQuantity = row.requestedQuantity > row.availableStock;

              return (
                <article className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 max-[620px]:grid-cols-[76px_1fr]" key={row.product.id}>
                  <Link className="grid size-24 place-items-center overflow-hidden rounded-[5px] bg-slate-100 max-[620px]:size-19" to={`/catalog/products/${row.product.id}`}>
                    {image ? <img className="h-full w-full object-cover" src={image.imageUrl} alt={row.product.name} /> : <ShoppingCart className="text-slate-400" size={26} />}
                  </Link>
                  <div className="grid gap-1.5">
                    <Link className="font-bold text-ink-950 no-underline hover:text-rust-600" to={`/catalog/products/${row.product.id}`}>{row.product.name}</Link>
                    <span className="font-mono text-sm text-ink-700">{formatClp(row.product.price)} por {row.product.unitMeasure}</span>
                    <span className={`text-xs font-bold ${row.available ? "text-positive-600" : "text-critical-600"}`}>
                      {row.available ? `${row.availableStock} disponibles` : "Producto no disponible actualmente"}
                    </span>
                    {invalidQuantity && (
                      <span className="text-xs text-critical-600">
                        Tienes {row.requestedQuantity} en el carrito, pero ahora solo hay {row.availableStock} disponibles. Ajusta la cantidad para continuar.
                      </span>
                    )}
                  </div>
                  <div className="grid justify-items-end gap-3 max-[620px]:col-span-2 max-[620px]:w-full max-[620px]:grid-cols-[1fr_auto] max-[620px]:items-center">
                    <div className="flex items-center gap-1">
                      <button className="size-9 min-h-9 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => changeQuantity(row, Math.min(row.quantity - 1, row.availableStock))} disabled={!row.available} aria-label="Disminuir cantidad"><Minus size={16} /></button>
                      <input className="w-16 text-center" type="number" min="1" max={row.availableStock} value={row.quantity} onChange={(event) => changeQuantity(row, Number(event.target.value))} disabled={!row.available} aria-label={`Cantidad de ${row.product.name}`} />
                      <button className="size-9 min-h-9 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => changeQuantity(row, row.quantity + 1)} disabled={!row.available || row.quantity >= row.availableStock} aria-label="Aumentar cantidad"><Plus size={16} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-ink-950">{formatClp(Number(row.product.price) * row.quantity)}</strong>
                      <button className="size-9 min-h-9 border-critical-600 bg-critical-600 p-0" type="button" onClick={() => removeItem(row.product.id)} aria-label={`Eliminar ${row.product.name}`}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="sticky top-22 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 max-[860px]:static">
            <h2 className="m-0 text-lg font-bold text-ink-950">Resumen</h2>
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-bold text-slate-600">Total</span>
              <strong className="font-mono text-2xl text-ink-950">{formatClp(total)}</strong>
            </div>
            {hasAvailabilityConflicts && (
              <p className="m-0 rounded-[5px] bg-rust-50 px-3 py-3 text-xs leading-5 text-rust-700">
                El stock disponible cambió. Ajusta las cantidades antes de continuar al pago.
              </p>
            )}
            {!isAuthenticated && !hasAvailabilityConflicts && (
              <Link className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/login" state={{ from: "/checkout" }}>
                Iniciar sesión para pagar
              </Link>
            )}
            {isClient && !hasAvailabilityConflicts && (
              <Link className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/checkout">
                Continuar al pago Webpay
              </Link>
            )}
            {isAuthenticated && !isClient && (
              <p className="m-0 rounded-[5px] bg-rust-50 px-3 py-3 text-xs leading-5 text-rust-700">
                Los pedidos online requieren una cuenta con rol Cliente.
              </p>
            )}
            <Link className="text-center text-sm font-bold text-rust-600" to="/catalog">Seguir viendo productos</Link>
          </aside>
        </div>
      )}
    </main>
  );
}
