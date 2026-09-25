import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCatalogSlides,
  catalogSlideDurationMilliseconds,
  nextCatalogSlideIndex,
} from "../src/helpers/customerNoticeCarousel.js";

const institutionalOnly = buildCatalogSlides([]);
assert.equal(institutionalOnly.length, 1);
assert.equal(institutionalOnly[0].id, "institutional");
assert.match(institutionalOnly[0].title, /materiales y herramientas/);

const slides = buildCatalogSlides([
  { id: 12, title: "Segundo aviso", message: "Mensaje dos", displaySeconds: 4 },
  { id: 25, title: "Tercer aviso", message: "Mensaje tres", displaySeconds: 12 },
]);
assert.equal(slides.length, 3);
assert.deepEqual(slides.map((slide) => slide.id), ["institutional", "notice-12", "notice-25"]);
assert.equal(catalogSlideDurationMilliseconds(slides[1]), 4_000);
assert.equal(catalogSlideDurationMilliseconds({ displaySeconds: 99 }), 7_000);
assert.equal(nextCatalogSlideIndex(0, 3), 1);
assert.equal(nextCatalogSlideIndex(2, 3), 0);

const component = await readFile(new URL("../src/components/CatalogNoticeCarousel.jsx", import.meta.url), "utf8");
assert.match(component, /window\.setTimeout/);
assert.match(component, /setTimerVersion/);
assert.match(component, /aria-current/);
assert.match(component, /prefers-reduced-motion: reduce/);
assert.match(component, /slides\.length > 1/);
assert.match(component, /translateX/);

console.log("PASS institutional/empty/multiple slides, individual duration, manual reset, looping and accessible indicators");
