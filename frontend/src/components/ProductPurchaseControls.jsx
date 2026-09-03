import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { getRemainingCartCapacity } from "../helpers/cartQuantity.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import useCart from "../hooks/useCart.js";
import useCartActions from "../hooks/useCartActions.js";
import CartQuantityControl from "./CartQuantityControl.jsx";

export default function ProductPurchaseControls({ product }) {
  const { items } = useCart();
  const { addProduct } = useCartActions();
  const [quantity, setQuantity] = useState(1);
  const [validDraft, setValidDraft] = useState(true);
  const inCart = Number(items.find((item) => Number(item.product.id) === Number(product.id))?.quantity || 0);
  const remaining = getRemainingCartCapacity(getOnlineAvailableStock(product), inCart);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-600">Cantidad</span>
        <CartQuantityControl
          quantity={quantity}
          availableStock={remaining}
          disabled={remaining < 1}
          productName={product.name}
          onQuantityChange={(value) => { setQuantity(value); return true; }}
          onValidationChange={setValidDraft}
        />
      </div>
      {inCart > 0 && <span className="text-xs text-slate-500">En tu carrito: {formatQuantityWithUnit(inCart, product.unitMeasure)} · Puedes agregar {remaining} más.</span>}
      <button className="min-h-10 px-3 text-xs" type="button" onClick={() => addProduct(product, quantity)} disabled={!validDraft || remaining < 1 || quantity > remaining}>
        <ShoppingCart size={16} /> Agregar al carrito
      </button>
    </div>
  );
}
