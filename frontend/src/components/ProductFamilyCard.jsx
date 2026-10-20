import { ImageOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createProductDetailNavigationState } from "../helpers/catalogNavigation.js";
import { formatClp } from "../helpers/formatters.js";
import { familyCardSummary } from "../helpers/productVariants.js";

export default function ProductFamilyCard({ product, detailOrigin }) {
  const navigate = useNavigate();
  const image = product.images?.find((i) => i.isPrimary) || product.images?.[0];
  const summary = familyCardSummary(product);
  const path = `/catalog/families/${product.id}?variant=${product.representativeProductId}`;
  const open = (e) => {
    if (!detailOrigin || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path, { state: createProductDetailNavigationState(detailOrigin, window.scrollY) });
  };
  return <article className="group relative grid min-h-full min-w-0 grid-rows-[220px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_2px_12px_rgba(16,21,31,0.05)] transition hover:-translate-y-0.5 hover:border-rust-200 hover:shadow-lg max-[600px]:grid-rows-[140px_1fr] max-[380px]:grid-rows-[124px_1fr]">
    <Link to={path} onClick={open} className="relative grid place-items-center overflow-hidden bg-slate-100" aria-label={`Ver opciones de ${product.name}`}>
      {image ? <img src={image.imageUrl} alt={product.imageCaption} className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain" loading="lazy" /> : <span className="grid justify-items-center gap-2 text-xs text-slate-500"><ImageOff size={38} />Sin fotografía</span>}
      {product.onlineHasOffers && summary.count > 0 && <span className="absolute top-2 left-2 rounded bg-rust-600 px-2 py-1 text-xs font-bold text-white">Oferta</span>}
    </Link>
    <div className="grid content-between gap-4 p-4 max-[600px]:gap-3 max-[600px]:p-3"><div className="grid min-w-0 gap-2">
      <span className="text-xs font-bold text-rust-600 max-[600px]:hidden">{product.categoryName}</span>
      <Link to={path} onClick={open} className="line-clamp-2 text-base font-bold text-ink-950 no-underline max-[600px]:text-sm">{product.name}</Link>
      <span className="font-mono text-xl font-extrabold text-ink-950 max-[600px]:text-lg max-[380px]:text-base">{summary.price !== null ? <>{summary.from && "Desde "}{formatClp(summary.price)}</> : "No disponible online"}</span>
      <span className="truncate text-xs text-slate-500">{product.brand || "Sin marca"}</span>
      <span className="text-xs text-slate-500">{summary.availability}</span>
    </div><Link to={path} onClick={open} className="inline-flex min-h-10 items-center justify-center rounded border border-slate-300 px-3 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-600">Ver opciones</Link></div>
  </article>;
}
