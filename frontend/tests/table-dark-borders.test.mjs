import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bordes oscuros se limitan a tablas y sus filas móviles, no a tarjetas genéricas", async () => {
  const styles = await readFile(new URL("../src/styles/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.dark table,\s*\.dark \[data-responsive-table="mobile"\] \{\s*border: 1px solid #465260;/);
  assert.match(styles, /\.dark table th,\s*\.dark table td,\s*\.dark \[data-mobile-table-row\] \{\s*border-bottom-color: #2c3745 !important;/);
  assert.match(styles, /\.dark table thead th \{\s*border-bottom-color: #3d4856 !important;/);
  assert.match(styles, /\.dark \.border-slate-300,\s*\.dark \.border-slate-200 \{\s*border-color: #3d4856 !important;/);
  assert.match(styles, /\.dark tbody tr:hover,[\s\S]*?background-color: #252f3b !important;/);
  assert.match(styles, /@apply border-b border-slate-200 px-3\.5 py-2\.5/);
  assert.match(styles, /\.dark \.sale-return-pending-notice button:focus-visible \{\s*outline: 2px solid #fdba74;/);
});

test("botón naranja mantiene contraste de texto normal y hover con los tonos reales de Tailwind", async () => {
  const theme = await readFile(new URL("../node_modules/tailwindcss/theme.css", import.meta.url), "utf8");
  const luminance = token => {
    const match = theme.match(new RegExp(`--color-${token}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`));
    assert.ok(match);
    const L = Number(match[1]) / 100, C = Number(match[2]), h = Number(match[3]) * Math.PI / 180;
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
      -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(v => Math.min(1, Math.max(0, v)));
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const ink = [0x10, 0x15, 0x1f].map(v => { const channel = v / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
  const inkLuminance = .2126 * ink[0] + .7152 * ink[1] + .0722 * ink[2];
  assert.ok((luminance("amber-600") + .05) / (inkLuminance + .05) >= 4.5);
  assert.ok(1.05 / (luminance("amber-700") + .05) >= 4.5);
  const styles = await readFile(new URL("../src/styles/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.dark \.sale-return-pending-notice button:not\(:disabled\):hover \{\s*background: var\(--color-amber-700\) !important;\s*color: #ffffff !important;/);
});
