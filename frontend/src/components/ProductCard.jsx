import { ImageOff, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";

function getPrimaryImage(product) {
  return product.images?.find((image) => image.isPrimary) || product.images?.[0] || null;
}

export default function ProductCard({ product, onAdd }) {
  const primaryImage = getPrimaryImage(product);
  const availableStock = getOnlineAvailableStock(product);
  const hasStock = availableStock > 0;

  return (
    <article className="group grid min-h-full grid-rows-[220px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_2px_12px_rgba(16,21,31,0.05)] transition hover:-translate-y-0.5 hover:border-rust-200 hover:shadow-[0_8px_24px_rgba(16,21,31,0.09)]">
      <Link className="grid place-items-center overflow-hidden bg-slate-100 text-slate-500" to={`/catalog/products/${product.id}`} aria-label={`Ver ${product.name}`}>
        {primaryImage ? (
          <img className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" src={primaryImage.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span className="grid justify-items-center gap-2 text-xs font-semibold">
            <ImageOff size={38} /> Sin fotografía
          </span>
        )}
      </Link>
      <div className="grid content-between gap-4 p-4">
        <div className="grid gap-2">
          <span className="text-xs font-bold text-rust-600">{product.categoryName}</span>
          <Link className="line-clamp-2 text-base font-bold text-ink-950 no-underline hover:text-rust-600" to={`/catalog/products/${product.id}`}>
            {product.name}
          </Link>
          <strong className="font-mono text-xl text-ink-950">{formatClp(product.price)}</strong>
          <span className={`text-xs font-extrabold ${hasStock ? "text-positive-600" : "text-critical-600"}`}>
            {hasStock ? `Disponible · ${availableStock} ${product.unitMeasure}` : "SIN STOCK"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
          <Link className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-slate-300 px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100" to={`/catalog/products/${product.id}`}>
            Ver producto
          </Link>
          <button className="min-h-10 px-3 text-xs" type="button" onClick={() => onAdd(product)} disabled={!hasStock}>
            <ShoppingCart size={16} /> Agregar
          </button>
        </div>
      </div>
    </article>
  );
}
