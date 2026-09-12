import { ImageOff } from "lucide-react";
import { Link } from "react-router-dom";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import ProductPurchaseControls from "./ProductPurchaseControls.jsx";
import FavoriteButton from "./FavoriteButton.jsx";
import useCart from "../hooks/useCart.js";

function getPrimaryImage(product) {
  return product.images?.find((image) => image.isPrimary) || product.images?.[0] || null;
}

export default function ProductCard({ product }) {
  const primaryImage = getPrimaryImage(product);
  const availableStock = getOnlineAvailableStock(product);
  const hasStock = availableStock > 0;
  const { items } = useCart();
  const inCart = Number(items.find((item) => Number(item.product.id) === Number(product.id))?.quantity || 0);

  return (
    <article className="group relative grid min-h-full min-w-0 grid-rows-[220px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_2px_12px_rgba(16,21,31,0.05)] transition hover:-translate-y-0.5 hover:border-rust-200 hover:shadow-[0_8px_24px_rgba(16,21,31,0.09)] max-[600px]:grid-rows-[140px_1fr] max-[380px]:grid-rows-[124px_1fr]">
      <FavoriteButton product={product} className="absolute top-3 right-3 z-10 max-[600px]:top-2 max-[600px]:right-2 max-[600px]:size-9 max-[600px]:min-h-9" />
      <Link className="grid place-items-center overflow-hidden bg-slate-100 text-slate-500" to={`/catalog/products/${product.id}`} aria-label={`Ver ${product.name}`}>
        {primaryImage ? (
          <img className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" src={primaryImage.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span className="grid justify-items-center gap-2 text-xs font-semibold">
            <ImageOff size={38} /> Sin fotografía
          </span>
        )}
      </Link>
      {inCart > 0 && <span className="absolute top-48 right-3 z-10 inline-flex min-h-7 max-w-[calc(100%-24px)] items-center rounded-full border-2 border-white bg-rust-600 px-2.5 text-xs font-black whitespace-nowrap text-white shadow-sm max-[600px]:top-29 max-[600px]:right-2 max-[600px]:min-h-6 max-[600px]:max-w-[calc(100%-16px)] max-[600px]:px-1.5 max-[600px]:text-[9px] max-[380px]:top-25" title={`${inCart} ${inCart === 1 ? "unidad" : "unidades"} en el carrito`} aria-label={`${inCart} ${inCart === 1 ? "unidad" : "unidades"} en el carrito`}>{inCart > 99 ? "99+" : inCart} en carrito</span>}
      <div className="grid content-between gap-4 p-4 max-[600px]:gap-2.5 max-[600px]:p-3">
        <div className="grid gap-2">
          <span className="truncate text-xs font-bold text-rust-600 max-[600px]:hidden">{product.categoryName}</span>
          <Link className="line-clamp-2 text-base font-bold text-ink-950 no-underline hover:text-rust-600 max-[600px]:text-sm" to={`/catalog/products/${product.id}`}>
            {product.name}
          </Link>
          <strong className="font-mono text-xl text-ink-950 max-[600px]:text-base">{formatClp(product.price)}</strong>
          {product.brand && <span className="truncate text-xs text-slate-500" title={product.brand}>{product.brand}</span>}
          <span className={`line-clamp-2 text-xs font-extrabold ${hasStock ? "text-positive-600" : "text-critical-600"}`}>
            {hasStock ? `Disponible · ${formatQuantityWithUnit(availableStock, product.unitMeasure)}` : "SIN STOCK"}
          </span>
        </div>
        <div className="grid gap-2">
          <ProductPurchaseControls product={product} compact />
          <Link className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-slate-300 px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100" to={`/catalog/products/${product.id}`}>
            Ver producto
          </Link>
        </div>
      </div>
    </article>
  );
}
