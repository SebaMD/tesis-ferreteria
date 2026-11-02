import { Toaster } from "sonner";
import App from "../App.jsx";
import AuthProvider from "../context/AuthProvider.jsx";
import CartProvider from "../context/CartProvider.jsx";
import FavoritesProvider from "../context/FavoritesProvider.jsx";
import CustomerNoticeProvider from "../context/CustomerNoticeProvider.jsx";
import ThemeProvider from "../context/ThemeProvider.jsx";
import CheckoutDraftProvider from "../context/CheckoutDraftProvider.jsx";
import useTheme from "../hooks/useTheme.js";
import ClientScrollRestoration from "../components/ClientScrollRestoration.jsx";

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
          actionButton: "app-toast-action",
        },
      }}
    />
  );
}

export default function Root() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CartProvider>
          <CustomerNoticeProvider>
            <ThemedToaster />
            <ClientScrollRestoration />
            <CheckoutDraftProvider><FavoritesProvider><App /></FavoritesProvider></CheckoutDraftProvider>
          </CustomerNoticeProvider>
        </CartProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
