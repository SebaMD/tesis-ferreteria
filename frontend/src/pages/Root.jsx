import { Toaster } from "sonner";
import App from "../App.jsx";
import AuthProvider from "../context/AuthProvider.jsx";
import CartProvider from "../context/CartProvider.jsx";
import FavoritesProvider from "../context/FavoritesProvider.jsx";
import CustomerNoticeProvider from "../context/CustomerNoticeProvider.jsx";
import ThemeProvider from "../context/ThemeProvider.jsx";
import useTheme from "../hooks/useTheme.js";

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
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
  );
}

export default function Root() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <CustomerNoticeProvider>
            <ThemedToaster />
            <FavoritesProvider><App /></FavoritesProvider>
          </CustomerNoticeProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
