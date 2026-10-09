import { ImageOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createProductDetailNavigationState } from "../helpers/catalogNavigation.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import ProductPurchaseControls from "./ProductPurchaseControls.jsx";
import FavoriteButton from "./FavoriteButton.jsx";
import useCart from "../hooks/useCart.js";
import ProductPromotionPrice from "./ProductPromotionPrice.jsx";

function getPrimaryImage(product) {
  return product.images?.find((image) => image.isPrimary) || product.images?.[0] || null;
}

function isPlainPrimaryClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export default function ProductCard({ product, detailOrigin = null }) {
  const navigate = useNavigate();
  const primaryImage = getPrimaryImage(product);
  const availableStock = getOnlineAvailableStock(product);
  const hasStock = availableStock > 0;
  const { items } = useCart();
  const inCart = Number(items.find((item) => Number(item.product.id) === Number(product.id))?.quantity || 0);
  const detailPath = `/catalog/products/${product.id}`;
  const openDetail = (event) => {
    if (!detailOrigin || !isPlainPrimaryClick(event)) return;
    event.preventDefault();
    navigate(detailPath, {
      state: createProductDetailNavigationState(detailOrigin, window.scrollY),
    });
  };

  return (
    <article className="group relative grid min-h-full min-w-0 grid-rows-[220px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_2px_12px_rgba(16,21,31,0.05)] transition hover:-translate-y-0.5 hover:border-rust-200 hover:shadow-[0_8px_24px_rgba(16,21,31,0.09)] max-[600px]:grid-rows-[140px_1fr] max-[380px]:grid-rows-[124px_1fr]">
      {product.inStoreOnly ? (
        <span className="absolute top-3 left-3 z-10 rounded-full border border-ink-950 bg-ink-950 px-2.5 py-1 text-[11px] font-black text-white shadow-[0_2px_8px_rgba(16,21,31,0.35)] max-[600px]:top-2 max-[600px]:left-2">Solo presencial</span>
      ) : product.promotion && (
        <span className="absolute top-3 left-3 z-10 rounded-full border border-white/80 bg-rust-600 px-2.5 py-1 text-[11px] font-black text-white shadow-sm max-[600px]:top-2 max-[600px]:left-2">{product.promotion.label}</span>
      )}
      <FavoriteButton product={product} className="absolute top-3 right-3 z-10 max-[600px]:top-2 max-[600px]:right-2 max-[600px]:size-9 max-[600px]:min-h-9" />
      <Link className="relative grid min-h-0 place-items-center overflow-hidden bg-slate-100 p-2 text-slate-500" to={detailPath} onClick={openDetail} aria-label={`Ver ${product.name}`}>
        {primaryImage ? (
          <img className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain object-center" src={primaryImage.imageUrl} alt={product.name} loading="lazy" />
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
          <Link className="line-clamp-2 text-base font-bold text-ink-950 no-underline hover:text-rust-600 max-[600px]:text-sm" to={detailPath} onClick={openDetail}>
            {product.name}
          </Link>
          <ProductPromotionPrice product={product} showBadge={false} />
          {product.brand && <span className="truncate text-xs text-slate-500" title={product.brand}>{product.brand}</span>}
          <span className={`line-clamp-2 text-xs font-extrabold ${hasStock ? "text-positive-600" : "text-critical-600"}`}>
            {hasStock ? `Disponible · ${formatQuantityWithUnit(availableStock, product.unitMeasure)}` : "SIN STOCK"}
          </span>
        </div>
        <div className="grid gap-2">
          <ProductPurchaseControls product={product} compact />
          <Link className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-slate-300 px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100" to={detailPath} onClick={openDetail}>
            Ver producto
          </Link>
        </div>
      </div>
    </article>
  );
}
