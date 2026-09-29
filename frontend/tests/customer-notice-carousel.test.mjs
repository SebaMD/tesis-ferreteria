import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCatalogSlides,
  catalogSlideDurationMilliseconds,
  nextCatalogSlideIndex,
} from "../src/helpers/customerNoticeCarousel.js";

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
const manager = await readFile(new URL("../src/components/CustomerNoticeManager.jsx", import.meta.url), "utf8");
const navbar = await readFile(new URL("../src/components/Navbar.jsx", import.meta.url), "utf8");
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
assert.match(manager, /Presentación del catálogo/);
assert.match(manager, /Predeterminado/);
assert.match(manager, /onPointerMove/);
assert.match(manager, /Mover .* hacia arriba/);
assert.match(manager, /editingId === notice\.id/);
assert.match(manager, /if \(createdNoticeId\) \{/);
assert.match(manager, /setEditingId\(createdNoticeId\)/);
assert.doesNotMatch(manager, /<label>Orden/);
assert.match(manager, /image\/jpeg,image\/png,image\/webp/);
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
assert.match(navbar, /headerActions/);
assert.match(navbar, /startCreate\(\{ focus: event\.detail === 0 \}\)/);
assert.match(navbar, /Administra los mensajes que acompañan la presentación del catálogo/);

console.log("PASS editable institutional slide, image carousel, inline editing, pointer/keyboard ordering and accessible indicators");
