import { Moon, Sun } from "lucide-react";
import useTheme from "../hooks/useTheme.js";

export default function ThemeToggle({ className = "", showLabel = false }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Usar tema claro" : "Usar tema oscuro";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      className={`theme-toggle min-h-10 border-slate-300 bg-white px-3 text-ink-700 hover:bg-slate-100 ${className}`}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden="true" />
      {showLabel && <span>{isDark ? "Tema claro" : "Tema oscuro"}</span>}
    </button>
  );
}
