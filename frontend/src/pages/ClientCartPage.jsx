import { ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import CartQuantityControl from "../components/CartQuantityControl.jsx";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import useCartActions from "../hooks/useCartActions.js";
import { formatQuantityWithUnit, getDisplayUnit } from "../helpers/units.js";
import { getCatalogProductsByIdsRequest } from "../services/catalog.service.js";
import { getProductPromotionPricing } from "../helpers/promotionPricing.js";
import ProductPromotionPrice from "../components/ProductPromotionPrice.jsx";

function getPrimaryImage(product) {
  return product?.images?.find((image) => image.isPrimary) || product?.images?.[0] || null;
}

export default function ClientCartPage() {
  const { items, updateQuantity, clearCart } = useCart();
  const { removeProduct } = useCartActions();
  const { isAuthenticated, user } = useAuth();
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const cartProductIds = useMemo(() => items.map((item) => item.product.id), [items]);

  useEffect(() => {
    const loadAvailability = (notifyError = false) => getCatalogProductsByIdsRequest(cartProductIds)
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
  }, [cartProductIds]);

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
    return { ...item, product, available, availableStock, requestedQuantity: quantity, quantity, pricing: getProductPromotionPricing(product, quantity) };
  });
  const total = rows.reduce(
    (sum, row) => sum + row.pricing.finalSubtotal,
    0,
  );

  const hasAvailabilityConflicts = rows.some(
    (row) => !row.available || row.requestedQuantity > row.availableStock,
  );
  const isClient = isAuthenticated && user?.role === "CLIENT";

  return (
    <main className="mx-auto grid w-full max-w-280 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <LoadingOverlay active={loading} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1.5">
        <h1 className="m-0 flex items-center gap-2 text-2xl font-bold text-ink-950"><ShoppingCart size={24} /> Carrito</h1>
        <p className="col-start-1 row-start-2 mt-0 mb-0 text-sm text-slate-500 max-[620px]:col-span-2">Revisa tus productos antes de reservar stock e iniciar el pago.</p>
        {items.length > 0 && (
          <button className="col-start-2 row-start-1 row-span-2 self-end border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:row-span-1 max-[620px]:self-center max-[620px]:px-3 max-[620px]:text-xs" type="button" onClick={clearCart}>Limpiar carrito</button>
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
                    <span className="text-xs text-slate-500">Precio por {getDisplayUnit(1, row.product.unitMeasure)}</span>
                    <ProductPromotionPrice product={row.product} quantity={row.quantity} showLineSummary />
                    <span className={`text-xs font-bold ${row.available ? "text-positive-600" : "text-critical-600"}`}>
                      {row.available ? `${formatQuantityWithUnit(row.availableStock, row.product.unitMeasure)} disponibles` : "Producto no disponible actualmente"}
                    </span>
                    {invalidQuantity && (
                      <span className="text-xs text-critical-600">
                        Tienes {row.requestedQuantity} en el carrito, pero ahora solo hay {row.availableStock} disponibles. Ajusta la cantidad para continuar.
                      </span>
                    )}
                  </div>
                  <div className="grid justify-items-end gap-3 max-[620px]:col-span-2 max-[620px]:w-full max-[620px]:grid-cols-[1fr_auto] max-[620px]:items-center">
                    <CartQuantityControl
                      quantity={row.quantity}
                      availableStock={row.availableStock}
                      disabled={!row.available}
                      productName={row.product.name}
                      onQuantityChange={(quantity) => updateQuantity(row.product.id, quantity, row.availableStock)}
                    />
                    <div className="flex items-center gap-2">
                      <div className="grid justify-items-end gap-0.5">
                        {row.pricing.discountAmount > 0 && <span className="font-mono text-xs text-slate-500 line-through">{formatClp(row.pricing.baseSubtotal)}</span>}
                        <strong className="font-mono text-ink-950">{formatClp(row.pricing.finalSubtotal)}</strong>
                      </div>
                      <button className="size-9 min-h-9 border-critical-600 bg-critical-600 p-0" type="button" onClick={() => removeProduct(row.product.id)} aria-label={`Eliminar ${row.product.name}`}><Trash2 size={16} /></button>
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
              <Link className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/checkout-options">
                Continuar compra
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
