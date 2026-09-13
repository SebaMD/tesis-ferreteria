import { useContext } from "react";
import ThemeContext from "../context/ThemeContext.js";

export default function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme debe utilizarse dentro de ThemeProvider");
  return value;
}
