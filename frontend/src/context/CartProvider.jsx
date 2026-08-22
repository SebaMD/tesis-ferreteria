import { useMemo, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import CartContext from "./CartContext.js";

const CART_STORAGE_PREFIX = "fyf_client_cart";

function readCart(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => (
      Number.isInteger(Number(item?.product?.id))
      && Number.isInteger(Number(item?.quantity))
      && Number(item.quantity) > 0
    ));
  } catch {
    return [];
  }
}

function CartStore({ children, storageKey }) {
  const [items, setItems] = useState(() => readCart(storageKey));

  const saveItems = (updater) => {
    setItems((current) => {
      const nextItems = typeof updater === "function" ? updater(current) : updater;
      localStorage.setItem(storageKey, JSON.stringify(nextItems));
      return nextItems;
    });
  };

  const addItem = (product, quantity = 1) => {
    const requestedQuantity = Number(quantity);
    const stock = Number(product?.currentStock || 0);
    const currentItem = items.find((item) => Number(item.product.id) === Number(product?.id));
    const currentQuantity = Number(currentItem?.quantity || 0);

    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return { success: false, message: "La cantidad debe ser un numero entero mayor que cero" };
    }

    if (stock < 1) {
      return { success: false, message: "Este producto no tiene stock disponible" };
    }

    if (currentQuantity + requestedQuantity > stock) {
      return { success: false, message: `Solo hay ${stock} unidades disponibles` };
    }

    saveItems((current) => {
      const existing = current.find((item) => Number(item.product.id) === Number(product.id));

      if (existing) {
        return current.map((item) => Number(item.product.id) === Number(product.id)
          ? { ...item, product, quantity: Number(item.quantity) + requestedQuantity }
          : item);
      }

      return [...current, { product, quantity: requestedQuantity }];
    });

    return { success: true };
  };

  const updateQuantity = (productId, quantity, stock) => {
    const nextQuantity = Number(quantity);
    const availableStock = Number(stock || 0);

    if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > availableStock) {
      return false;
    }

    saveItems((current) => current.map((item) => Number(item.product.id) === Number(productId)
      ? { ...item, quantity: nextQuantity }
      : item));
    return true;
  };

  const removeItem = (productId) => {
    saveItems((current) => current.filter((item) => Number(item.product.id) !== Number(productId)));
  };

  const clearCart = () => saveItems([]);

  const value = useMemo(() => ({
    items,
    totalUnits: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    total: items.reduce(
      (total, item) => total + Number(item.product?.price || 0) * Number(item.quantity || 0),
      0,
    ),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default function CartProvider({ children }) {
  const { user } = useAuth();
  const ownerKey = user?.role === "CLIENT" ? `client_${user.id}` : "guest";
  const storageKey = `${CART_STORAGE_PREFIX}_${ownerKey}`;

  return (
    <CartStore key={storageKey} storageKey={storageKey}>
      {children}
    </CartStore>
  );
}
