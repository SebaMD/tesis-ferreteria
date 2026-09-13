import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Root from "./pages/Root.jsx";

if (localStorage.getItem("fyf-theme") === "dark") {
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
