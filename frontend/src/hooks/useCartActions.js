import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useCart from "./useCart.js";

export default function useCartActions() {
  const { addItem, removeItem } = useCart();
  const navigate = useNavigate();

  const addProduct = (product, quantity) => {
    const result = addItem(product, quantity);
    if (!result.success) toast.error(result.message);
    else toast.success("Producto agregado al carrito", {
      action: { label: "Ver carrito", onClick: () => navigate("/cart") },
    });
    return result;
  };

  const removeProduct = (productId) => {
    const undo = removeItem(productId);
    if (!undo) return;
    toast.success("Producto eliminado del carrito", {
      duration: 8000,
      action: {
        label: "Deshacer",
        onClick: async () => {
          const result = await undo();
          if (result.success) toast.success("Producto restaurado en el carrito");
          else toast.error(result.message);
        },
      },
    });
  };

  return { addProduct, removeProduct };
}
