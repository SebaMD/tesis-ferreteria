import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Root from "./pages/Root.jsx";

try {
  const storedUser = JSON.parse(localStorage.getItem("user") || "null");
  const userTheme = storedUser?.id ? localStorage.getItem(`fyf-theme:user:${storedUser.id}`) : null;
  const legacyTheme = storedUser?.id ? localStorage.getItem("fyf-theme") : null;
  if (userTheme === "dark" || (!userTheme && legacyTheme === "dark")) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
} catch {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
