import { useContext } from "react";
import CartContext from "../context/CartContext.js";

export default function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart debe utilizarse dentro de CartProvider");
  return context;
}
