import { validateCartQuantity } from "./cartQuantity.js";
import { getOnlineAvailableStock } from "./productAvailability.js";

export const CART_UNDO_DURATION = 8000;

// Merge only missing products. Later additions and quantities belong to the user.
export function prepareCartRestoration(current, removed) {
  const present = new Set(current.map(item => Number(item.product.id)));
  const additions = removed.filter(item => !present.has(Number(item.product.id)));
  if (!additions.length) return { success: false, message: "Los productos ya fueron agregados nuevamente. Conservamos las cantidades actuales." };
  for (const { product, quantity } of additions) {
    if (product.status === false || product.inStoreOnly) {
      return { success: false, message: "Un producto ya no está disponible para compra online. No se restauró el carrito." };
    }
    if (!validateCartQuantity(quantity, getOnlineAvailableStock(product)).valid) {
      return { success: false, message: "La disponibilidad cambió. No se pueden restaurar las cantidades completas." };
    }
  }
  return { success: true, items: [...current, ...additions], preservedCount: removed.length - additions.length };
}

// A removal belongs to one mounted cart session; this capability is never persisted.
export function createCartRemovalUndo({ items, isCurrentContext, loadProduct, restoreItems, now = Date.now }) {
  const removed = items.map(item => ({ productId: Number(item.product.id), quantity: Number(item.quantity) }));
  const expiresAt = now() + CART_UNDO_DURATION;
  let used = false;
  return async () => {
    if (used) return { success: false, message: "Esta acción de deshacer ya fue utilizada." };
    used = true;
    try {
      if (!isCurrentContext()) return { success: false, message: "El carrito o la sesión cambió. No se restauró el producto." };
      if (now() >= expiresAt) return { success: false, message: "El plazo para deshacer terminó. Agrega los productos desde el catálogo." };
      const products = await Promise.all(removed.map(async item => ({ ...item, product: await loadProduct(item.productId) })));
      if (!isCurrentContext()) return { success: false, message: "El carrito o la sesión cambió. No se restauró el producto." };
      if (now() >= expiresAt) return { success: false, message: "El plazo para deshacer terminó. No se restauró el carrito." };
      if (products.some(item => !item.product || Number(item.product.id) !== item.productId)) {
        return { success: false, message: "El producto ya no está disponible. No se pudo restaurar." };
      }
      return restoreItems(products.map(({ product, quantity }) => ({ product, quantity })));
    } catch {
      return { success: false, message: "No se pudo comprobar o restaurar el carrito. Conservamos su estado actual." };
    }
  };
}
