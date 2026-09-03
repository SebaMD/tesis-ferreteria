import { validateCartQuantity } from "./cartQuantity.js";
import { getOnlineAvailableStock } from "./productAvailability.js";

// A removal belongs to one mounted cart session; this capability is never persisted.
export function createCartRemovalUndo({ item, isCurrentContext, loadProduct, hasProduct, addItem }) {
  let used = false;
  return async () => {
    if (!isCurrentContext()) return { success: false, message: "El carrito o la sesión cambió. No se restauró el producto." };
    if (used) return { success: false, message: "Esta acción de deshacer ya fue utilizada." };
    used = true;
    try {
      const product = await loadProduct(item.product.id);
      if (!isCurrentContext()) return { success: false, message: "El carrito o la sesión cambió. No se restauró el producto." };
      if (!product || Number(product.id) !== Number(item.product.id) || product.status === false) {
        return { success: false, message: "El producto ya no está disponible. No se pudo restaurar." };
      }
      const validation = validateCartQuantity(item.quantity, getOnlineAvailableStock(product));
      if (!validation.valid) return { success: false, message: "La disponibilidad cambió. No se puede restaurar la cantidad completa." };
      if (hasProduct(product.id)) return { success: false, message: "El producto ya fue agregado nuevamente. Conservamos la cantidad actual." };
      return addItem(product, validation.quantity);
    } catch {
      return { success: false, message: "No se pudo comprobar la disponibilidad del producto. No se restauró el carrito." };
    }
  };
}
