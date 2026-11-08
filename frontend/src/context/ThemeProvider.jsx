import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
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

  useLayoutEffect(() => {
    if (selection.key !== currentKey) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [selection.key, currentKey, theme]);

  useEffect(() => {
    if (!currentKey) return undefined;
    // Migrate only after commit, never while reading/rendering (StrictMode).
    if (localStorage.getItem(currentKey) === null && localStorage.getItem(LEGACY_THEME_STORAGE_KEY)) {
      localStorage.setItem(currentKey, readTheme(currentKey));
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
    const sync = () => setSelection({ key: currentKey, theme: readTheme(currentKey) });
    const storage = event => { if (event.key === null || event.key === currentKey) sync(); };
    window.addEventListener('storage', storage);window.addEventListener('focus', sync);window.addEventListener('pageshow', sync);
    return () => { window.removeEventListener('storage', storage);window.removeEventListener('focus', sync);window.removeEventListener('pageshow', sync); };
  }, [currentKey]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (currentKey) localStorage.setItem(currentKey, next);
    setSelection({ key: currentKey, theme: next });
  }, [currentKey, theme]);

  const value = useMemo(() => ({ theme, isDark: theme === "dark", toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
