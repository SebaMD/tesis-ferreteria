import { useEffect, useMemo, useRef, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import { getRemainingCartCapacity, validateCartQuantity } from "../helpers/cartQuantity.js";
import { createCartRemovalUndo } from "../helpers/cartUndo.js";
import { getCatalogProductByIdRequest } from "../services/catalog.service.js";
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

function mergeCartItems(baseItems, incomingItems) {
  const merged = new Map(baseItems.map((item) => [Number(item.product.id), item]));

  for (const item of incomingItems) {
    const productId = Number(item.product.id);
    const existing = merged.get(productId);
    merged.set(productId, existing
      ? { ...existing, product: item.product, quantity: Number(existing.quantity) + Number(item.quantity) }
      : item);
  }

  return [...merged.values()];
}

function CartStore({ children, storageKey, guestStorageKey, mergeGuestCart }) {
  const [items, setItems] = useState(() => {
    const storedItems = readCart(storageKey);
    if (!mergeGuestCart) return storedItems;

    const guestItems = readCart(guestStorageKey);
    if (guestItems.length === 0) return storedItems;

    const mergedItems = mergeCartItems(storedItems, guestItems);
    localStorage.setItem(storageKey, JSON.stringify(mergedItems));
    localStorage.removeItem(guestStorageKey);
    return mergedItems;
  });

  const itemsRef = useRef(items);
  const active = useRef(false);
  const contextVersion = useRef(0);

  useEffect(() => {
    active.current = true;
    const syncCart = (event) => {
      if (event.key === storageKey) {
        itemsRef.current = readCart(storageKey);
        setItems(itemsRef.current);
      }
      if (event.key === null || event.key === "token" || event.key === "user" || event.key === storageKey) contextVersion.current += 1;
    };

    window.addEventListener("storage", syncCart);
    return () => {
      active.current = false;
      window.removeEventListener("storage", syncCart);
    };
  }, [storageKey]);

  const saveItems = (updater) => {
    const nextItems = typeof updater === "function" ? updater(itemsRef.current) : updater;
    localStorage.setItem(storageKey, JSON.stringify(nextItems));
    itemsRef.current = nextItems;
    setItems(nextItems);
  };

  const addItem = (product, quantity = 1) => {
    const stock = getOnlineAvailableStock(product);
    const currentItem = itemsRef.current.find((item) => Number(item.product.id) === Number(product?.id));
    const currentQuantity = Number(currentItem?.quantity || 0);

    const validation = validateCartQuantity(quantity, getRemainingCartCapacity(stock, currentQuantity));
    if (!validation.valid) return { success: false, message: validation.message };
    const requestedQuantity = validation.quantity;

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
    const result = validateCartQuantity(quantity, stock);
    if (!result.valid) return false;

    saveItems((current) => current.map((item) => Number(item.product.id) === Number(productId)
      ? { ...item, quantity: result.quantity }
      : item));
    return true;
  };

  const removeItem = (productId) => {
    const item = itemsRef.current.find((entry) => Number(entry.product.id) === Number(productId));
    if (!item) return null;
    const version = contextVersion.current;
    saveItems((current) => current.filter((item) => Number(item.product.id) !== Number(productId)));
    return createCartRemovalUndo({
      item: { product: item.product, quantity: Number(item.quantity) },
      isCurrentContext: () => active.current && contextVersion.current === version,
      loadProduct: getCatalogProductByIdRequest,
      hasProduct: (id) => itemsRef.current.some((entry) => Number(entry.product.id) === Number(id)),
      addItem,
    });
  };

  const clearCart = () => {
    contextVersion.current += 1;
    saveItems([]);
  };

  const removePurchasedItems = (purchasedItems = []) => {
    contextVersion.current += 1;
    const purchasedByProduct = new Map(
      purchasedItems.map((item) => [Number(item.productId), Number(item.quantity || 0)]),
    );

    saveItems((current) => current.flatMap((item) => {
      const purchasedQuantity = purchasedByProduct.get(Number(item.product.id)) || 0;
      const remainingQuantity = Number(item.quantity) - purchasedQuantity;
      return remainingQuantity > 0 ? [{ ...item, quantity: remainingQuantity }] : [];
    }));
  };

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
    removePurchasedItems,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default function CartProvider({ children }) {
  const { user } = useAuth();
  const ownerKey = user?.role === "CLIENT" ? `client_${user.id}` : "guest";
  const storageKey = `${CART_STORAGE_PREFIX}_${ownerKey}`;
  const guestStorageKey = `${CART_STORAGE_PREFIX}_guest`;

  return (
    <CartStore
      key={`${storageKey}:${user?.role || "anonymous"}:${user?.id || "anonymous"}`}
      storageKey={storageKey}
      guestStorageKey={guestStorageKey}
      mergeGuestCart={user?.role === "CLIENT"}
    >
      {children}
    </CartStore>
  );
}
