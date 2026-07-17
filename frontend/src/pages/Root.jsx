import { Toaster } from "sonner";
import App from "../App.jsx";
import AuthProvider from "../context/AuthProvider.jsx";

export default function Root() {
  return (
    <AuthProvider>
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
      <App />
    </AuthProvider>
  );
}
