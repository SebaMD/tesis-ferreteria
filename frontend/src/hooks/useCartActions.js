import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCart from "./useCart.js";
import { CART_UNDO_DURATION } from "../helpers/cartUndo.js";

function offerUndo(undo, message, restoredMessage) {
  if (!undo) return;
  toast.success(message, {
    duration: CART_UNDO_DURATION,
    action: {
      label: "Deshacer",
      onClick: async () => {
        const result = await undo();
        if (result.success) toast.success(result.preservedCount
          ? `${restoredMessage}. Se conservaron las cantidades de los productos agregados después.`
          : restoredMessage);
        else toast.error(result.message);
      },
    },
  });
}

export default function useCartActions() {
  const { addItem, removeItem, clearCart } = useCart();
  const navigate = useNavigate();

  const addProduct = (product, quantity, { showSuccessToast = true } = {}) => {
    const result = addItem(product, quantity);
    if (!result.success) toast.error(result.message);
    else if (showSuccessToast) toast.success("Producto agregado al carrito", {
      action: { label: "Ver carrito", onClick: () => navigate("/cart") },
    });
    return result;
  };

  const removeProduct = (productId) => {
    offerUndo(removeItem(productId), "Producto eliminado del carrito", "Producto restaurado en el carrito");
  };

  const clearProducts = () => {
    offerUndo(clearCart(), "Carrito vaciado", "Carrito restaurado");
  };

  return { addProduct, removeProduct, clearProducts };
}
