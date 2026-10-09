import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCatalogSlides,
  catalogSlideDurationMilliseconds,
  nextCatalogSlideIndex,
} from "../src/helpers/customerNoticeCarousel.js";
import { resolveApiAssetUrl } from "../src/helpers/apiAssets.js";

assert.equal(resolveApiAssetUrl("/uploads/customer-notices/test.png", "/api"), "/uploads/customer-notices/test.png");
assert.equal(
  resolveApiAssetUrl("/uploads/customer-notices/test.png", "https://api.example.test/api"),
  "https://api.example.test/uploads/customer-notices/test.png",
);
assert.equal(resolveApiAssetUrl("https://cdn.example.test/test.webp", "https://api.example.test/api"), "https://cdn.example.test/test.webp");

const institutionalOnly = buildCatalogSlides(null, []);
assert.equal(institutionalOnly.length, 1);
assert.equal(institutionalOnly[0].id, "institutional");
assert.match(institutionalOnly[0].title, /materiales y herramientas/);

const slides = buildCatalogSlides({
  title: "Presentación configurable",
  mainText: "Texto principal editable",
  secondaryText: "Texto secundario editable",
  imageUrl: "/uploads/customer-notices/presentation/hero.webp",
}, [
  { id: 12, title: "Segundo aviso", message: "Mensaje dos", displaySeconds: 4 },
  { id: 25, title: "Tercer aviso", message: "Mensaje tres", displaySeconds: 12 },
]);
assert.equal(slides.length, 3);
assert.deepEqual(slides.map((slide) => slide.id), ["institutional", "notice-12", "notice-25"]);
assert.equal(slides[0].eyebrow, "Presentación configurable");
assert.equal(slides[0].imageUrl, "/uploads/customer-notices/presentation/hero.webp");
assert.equal(catalogSlideDurationMilliseconds(slides[1]), 4_000);
assert.equal(catalogSlideDurationMilliseconds({ displaySeconds: 99 }), 7_000);
assert.equal(nextCatalogSlideIndex(0, 3), 1);
assert.equal(nextCatalogSlideIndex(2, 3), 0);

const component = await readFile(new URL("../src/components/CatalogNoticeCarousel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/styles.css", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/CustomerNoticeManager.jsx", import.meta.url), "utf8");
const navbar = await readFile(new URL("../src/components/Navbar.jsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/services/customerNotice.service.js", import.meta.url), "utf8");
assert.match(component, /window\.setTimeout/);
assert.match(component, /setTimerVersion/);
assert.match(component, /aria-current/);
assert.match(component, /prefers-reduced-motion: reduce/);
assert.match(component, /slides\.length > 1/);
assert.match(component, /translateX/);
assert.match(component, /slide\.imageUrl/);
assert.match(component, /linear-gradient/);
assert.match(component, /catalog-notice-indicators absolute/);
assert.match(component, /pb-18/);
assert.match(component, /catalog-notice-media-image/);
assert.match(component, /catalog-notice-mobile-overlay/);
assert.match(
  styles,
  /\.catalog-notice-media\s*\{[^}]*justify-content:\s*flex-end;[^}]*background:\s*transparent;/s,
);
assert.match(
  styles,
  /\.catalog-notice-media-image\s*\{[^}]*object-fit:\s*contain;[^}]*-webkit-mask-image:\s*linear-gradient\([^}]*rgb\(16 21 31 \/ 22%\) 8%[^}]*rgb\(16 21 31 \/ 58%\) 18%[^}]*var\(--color-ink-950\) 30%[^}]*var\(--color-ink-950\) 100%/s,
);
assert.match(styles, /mask-image:\s*linear-gradient\(/);
assert.match(
  styles,
  /@media \(max-width: 620px\)[\s\S]*\.catalog-notice-media-image\s*\{[^}]*object-fit:\s*cover;[^}]*-webkit-mask-image:\s*none;[^}]*mask-image:\s*none;/,
);
assert.match(styles, /\.catalog-notice-mobile-overlay\s*\{\s*display:\s*none;/s);
assert.match(
  styles,
  /@media \(max-width: 620px\)[\s\S]*\.catalog-notice-mobile-overlay\s*\{[^}]*display:\s*block;[^}]*pointer-events:\s*none;[^}]*linear-gradient/s,
);
assert.match(manager, /Presentación del catálogo/);
assert.match(manager, /Predeterminado/);
assert.match(manager, /const fileInputRef = useRef\(null\)/);
assert.match(manager, /onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
assert.match(manager, /className="hidden"\s*\n\s*type="file"\s*\n\s*tabIndex=\{-1\}/);
assert.match(manager, /Sin imagen seleccionada/);
assert.doesNotMatch(manager, /className="sr-only"\s*\n\s*type="file"/);
assert.match(manager, /onPointerMove/);
assert.match(manager, /Mover .* hacia arriba/);
assert.match(manager, /editingId === notice\.id/);
assert.match(manager, /if \(createdNoticeId\) \{/);
assert.match(manager, /setEditingId\(createdNoticeId\)/);
assert.doesNotMatch(manager, /<label>Orden/);
assert.match(manager, /image\/jpeg,image\/png,image\/webp/);
assert.match(manager, /Cambiar imagen/);
assert.match(manager, /Seleccionar imagen/);
assert.doesNotMatch(manager, /Ningún archivo seleccionado/);
assert.match(manager, /1920 × 720 px/);
assert.match(manager, /formato panorámico/);
assert.match(manager, /contenido principal centrado/);
assert.match(manager, /JPG, PNG o WebP · máximo 5 MB/);
assert.doesNotMatch(manager, /1200 × 675|16:9/);
assert.match(manager, /aria-labelledby=\{titleId\}/);
assert.doesNotMatch(manager, /<legend[^>]*>Imagen opcional/);
assert.match(manager, /node\.animate/);
assert.match(manager, /customer-notice-card--dragging/);
assert.match(manager, /prefers-reduced-motion: reduce/);
assert.match(manager, /editorRevealRef/);
assert.match(manager, /scrollIntoView/);
assert.match(manager, /event\.detail === 0/);
assert.match(manager, /aria-label="Editar presentación del catálogo"/);
assert.match(manager, /max-\[620px\]:grid-cols-3/);
assert.match(manager, /max-\[620px\]:grid-cols-\[auto_minmax\(0,1fr\)\]/);
assert.match(manager, /max-\[620px\]:auto-cols-fr max-\[620px\]:grid-flow-col/);
assert.match(service, /resolveApiAssetUrl/);
assert.match(service, /data\.notices\.map\(resolveImage\)/);
assert.match(navbar, /headerActions/);
assert.match(navbar, /startCreate\(\{ focus: event\.detail === 0 \}\)/);
assert.match(navbar, /Administra los mensajes que acompañan la presentación del catálogo/);

console.log("PASS editable institutional slide, image carousel, inline editing, pointer/keyboard ordering and accessible indicators");
