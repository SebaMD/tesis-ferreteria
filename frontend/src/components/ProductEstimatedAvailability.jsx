import { getProductCartAvailability } from "../helpers/cartQuantity.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import useCart from "../hooks/useCart.js";

export default function ProductEstimatedAvailability({ product, compact = false, inCart = false }) {
  const { items } = useCart();
  const { remaining, isCartLimitReached } = getProductCartAvailability(product, items);
  const onlineEligible = product.status !== false && !product.inStoreOnly;
  const message = !onlineEligible
    ? product.inStoreOnly ? "Solo presencial" : "No disponible online"
    : isCartLimitReached && !inCart ? "Máximo disponible considerando tu carrito"
      : remaining > 0 || (inCart && isCartLimitReached)
        ? `${inCart ? "Disponibles para agregar" : "Disponible estimado para agregar"}: ${formatQuantityWithUnit(remaining, product.unitMeasure)}` : "SIN STOCK";

  return <span role="status" aria-live="polite" aria-atomic="true"
    className={`${compact ? "text-xs" : "text-sm"} break-words font-bold ${onlineEligible && remaining > 0 ? "text-positive-600" : "text-critical-600"}`}>
    {message}
  </span>;
}
