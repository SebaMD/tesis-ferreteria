import { Heart } from "lucide-react";
import { useContext } from "react";
import FavoritesContext from "../context/FavoritesContext.js";

export default function FavoriteButton({ product, className = "" }) {
  const favorites = useContext(FavoritesContext);
  if (!favorites.enabled) return null;
  const selected = favorites.products.some((item) => item.id === product.id);
  const label = `${selected ? "Quitar de" : "Agregar a"} favoritos: ${product.name}`;
  return (
    <button type="button" aria-label={label} title={favorites.error || label} aria-pressed={selected}
      disabled={favorites.loading || Boolean(favorites.error) || favorites.busy.includes(product.id)}
      onClick={() => favorites.toggle(product)}
      className={`size-11 min-h-11 shrink-0 rounded-full border-slate-200 bg-white p-0 shadow-sm hover:bg-slate-50 ${selected ? "text-red-600" : "text-ink-700"} ${className}`}>
      <Heart size={21} fill={selected ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
