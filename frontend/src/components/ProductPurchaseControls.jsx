import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRemainingCartCapacity } from "../helpers/cartQuantity.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import useCartActions from "../hooks/useCartActions.js";
import CartQuantityControl from "./CartQuantityControl.jsx";

export default function ProductPurchaseControls({ product, compact = false, showBuyNow = false }) {
  const { items } = useCart();
  const { addProduct } = useCartActions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [validDraft, setValidDraft] = useState(true);
  const inCart = Number(items.find((item) => Number(item.product.id) === Number(product.id))?.quantity || 0);
  const remaining = getRemainingCartCapacity(getOnlineAvailableStock(product), inCart);

  const addSelectedQuantity = (options) => addProduct(product, quantity, options);
  const buyNow = () => {
    const result = addSelectedQuantity({ showSuccessToast: false });
    if (!result.success) return;
    navigate(user?.role === "CLIENT" ? "/checkout" : "/checkout-options");
  };

  return (
    <div className="grid gap-2">
      <div className={showBuyNow ? "grid justify-items-center gap-2" : `flex flex-wrap items-center justify-between gap-2 ${compact ? "max-[600px]:justify-center" : ""}`}>
        <span className={`text-xs font-bold text-slate-600 ${compact ? "max-[600px]:sr-only" : ""} ${showBuyNow ? "justify-self-start" : ""}`}>Cantidad</span>
        <CartQuantityControl
          className={`${compact ? "max-[600px]:mx-auto max-[600px]:justify-self-center" : ""} ${showBuyNow ? "mx-auto" : ""}`}
          quantity={quantity}
          availableStock={remaining}
          disabled={remaining < 1}
          productName={product.name}
          onQuantityChange={(value) => { setQuantity(value); return true; }}
          onValidationChange={setValidDraft}
        />
      </div>
      <div className="grid gap-2">
        <button className="min-h-10 px-3 text-xs" type="button" onClick={() => addSelectedQuantity()} disabled={!validDraft || remaining < 1 || quantity > remaining}>
          <ShoppingCart size={16} /> <span className={compact ? "max-[600px]:hidden" : ""}>Agregar al carrito</span><span className={compact ? "min-[601px]:hidden" : "hidden"}>Agregar</span>
        </button>
        {showBuyNow && <button className="min-h-10 border-rust-600 bg-rust-600 px-3 text-xs hover:bg-rust-700" type="button" onClick={buyNow} disabled={!validDraft || remaining < 1 || quantity > remaining}>Comprar ahora</button>}
      </div>
    </div>
  );
}
