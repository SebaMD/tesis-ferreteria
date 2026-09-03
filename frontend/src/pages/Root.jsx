import { Toaster } from "sonner";
import App from "../App.jsx";
import AuthProvider from "../context/AuthProvider.jsx";
import CartProvider from "../context/CartProvider.jsx";
import FavoritesProvider from "../context/FavoritesProvider.jsx";

export default function Root() {
  return (
    <AuthProvider>
      <CartProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              success: "app-toast-success",
              info: "app-toast-info",
              warning: "app-toast-warning",
              error: "app-toast-error",
            },
          }}
        />
        <FavoritesProvider><App /></FavoritesProvider>
      </CartProvider>
    </AuthProvider>
  );
}
