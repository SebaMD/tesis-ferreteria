import { useCallback, useEffect, useMemo, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import ThemeContext from "./ThemeContext.js";

const LEGACY_THEME_STORAGE_KEY = "fyf-theme";

function storageKey(userId) {
  return userId ? `fyf-theme:user:${userId}` : null;
}

function readTheme(key) {
  if (!key) return "light";
  const stored = localStorage.getItem(key);
  if (stored) return stored === "dark" ? "dark" : "light";
  const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy) {
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacy === "dark" ? "dark" : "light";
  }
  return "light";
}

export default function ThemeProvider({ children }) {
  const { user } = useAuth();
  const currentKey = storageKey(user?.id);
  const [selection, setSelection] = useState(() => ({ key: currentKey, theme: readTheme(currentKey) }));

  if (selection.key !== currentKey) {
    setSelection({ key: currentKey, theme: readTheme(currentKey) });
  }

  const theme = selection.theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    if (selection.key) localStorage.setItem(selection.key, theme);
  }, [selection.key, theme]);

  const toggleTheme = useCallback(() => {
    setSelection((current) => ({
      ...current,
      theme: current.theme === "dark" ? "light" : "dark",
    }));
  }, []);

  const value = useMemo(() => ({ theme, isDark: theme === "dark", toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
