import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getInitialProductImageIndex,
  moveProductImageIndex,
  PRODUCT_GALLERY_AUTOPLAY_MS,
  shouldAutoplayProductGallery,
} from "../src/helpers/productGallery.js";

const componentUrl = (relativePath) => new URL(`../src/${relativePath}`, import.meta.url);

test("la galería usa la imagen principal persistida y recorre las imágenes en ciclo", () => {
  assert.equal(getInitialProductImageIndex([]), 0);
  assert.equal(getInitialProductImageIndex([{ id: 1 }, { id: 2, isPrimary: true }]), 1);
  assert.equal(moveProductImageIndex(0, 1, 1), 0);
  assert.equal(moveProductImageIndex(0, -1, 4), 3);
  assert.equal(moveProductImageIndex(3, 1, 4), 0);
  assert.equal(moveProductImageIndex(1, 1, 4), 2);
});

test("el autoplay dura cinco segundos y se detiene cuando no corresponde", () => {
  assert.equal(PRODUCT_GALLERY_AUTOPLAY_MS, 5_000);
  assert.equal(shouldAutoplayProductGallery({ imageCount: 1, reducedMotion: false, paused: false, modalOpen: false }), false);
  assert.equal(shouldAutoplayProductGallery({ imageCount: 2, reducedMotion: true, paused: false, modalOpen: false }), false);
  assert.equal(shouldAutoplayProductGallery({ imageCount: 2, reducedMotion: false, paused: true, modalOpen: false }), false);
  assert.equal(shouldAutoplayProductGallery({ imageCount: 2, reducedMotion: false, paused: false, modalOpen: true }), false);
  assert.equal(shouldAutoplayProductGallery({ imageCount: 2, reducedMotion: false, paused: false, modalOpen: false }), true);
});

test("la galería y el lightbox conservan controles accesibles sin zoom hover", async () => {
  const gallery = await readFile(componentUrl("components/ProductGallery.jsx"), "utf8");
  const modal = await readFile(componentUrl("components/AppModal.jsx"), "utf8");

  assert.match(gallery, /aria-label="Imagen anterior"/);
  assert.match(gallery, /aria-label="Imagen siguiente"/);
  assert.match(gallery, /aria-label="Ampliar imagen"/);
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.match(gallery, /prefers-reduced-motion: reduce/);
  assert.match(gallery, /PRODUCT_GALLERY_AUTOPLAY_MS/);
  assert.match(gallery, /lightboxOpen/);
  assert.match(gallery, /backdrop-blur-sm/);
  assert.match(gallery, /Miniaturas del producto/);
  assert.match(gallery, /overflow-y-auto/);
  assert.match(gallery, /overflow-x-auto/);
  assert.match(gallery, /aria-current/);
  assert.match(gallery, /selectImage\(index\)/);
  assert.doesNotMatch(gallery, /hover:scale/);
  assert.match(modal, /previousActiveElement\?\.focus/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
});

test("producto presencial tiene badge sólido, no se duplica en detalle y continúa bloqueado", async () => {
  const card = await readFile(componentUrl("components/ProductCard.jsx"), "utf8");
  const detail = await readFile(componentUrl("pages/ProductDetailPage.jsx"), "utf8");
  const purchaseControls = await readFile(componentUrl("components/ProductPurchaseControls.jsx"), "utf8");

  assert.match(card, /bg-ink-950/);
  assert.match(card, /Solo presencial/);
  assert.match(card, /h-\[calc\(100%-1rem\)\] w-\[calc\(100%-1rem\)\] object-contain object-center/);
  assert.doesNotMatch(card, /object-cover/);
  assert.doesNotMatch(card, /group-hover:scale/);
  assert.doesNotMatch(detail, /Solo presencial/);
  assert.match(purchaseControls, /Disponible solo en tienda/);
});

test("administración documenta proporción y permite quitar claramente imágenes pendientes", async () => {
  const manager = await readFile(componentUrl("components/ProductImagesManager.jsx"), "utf8");
  const styles = await readFile(componentUrl("styles/styles.css"), "utf8");

  assert.match(manager, /1200 × 1200 px/);
  assert.match(manager, /formato cuadrado 1:1/);
  assert.match(manager, /aria-label=\{`Quitar imagen \$\{file\.name\}`\}/);
  assert.match(manager, /title=\{`Quitar imagen \$\{file\.name\}`\}/);
  assert.match(manager, /pending-image-remove/);
  assert.match(styles, /\.pending-image-remove/);
  assert.match(styles, /color: #10151f !important/);
  assert.match(styles, /\.dark \.pending-image-remove/);
  assert.match(styles, /color: #f8fafc !important/);
  assert.match(manager, /onSetPrimary/);
});
