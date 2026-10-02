export const PRODUCT_GALLERY_AUTOPLAY_MS = 5_000;

export function getInitialProductImageIndex(images = []) {
  const primaryIndex = images.findIndex((image) => image.isPrimary);
  return primaryIndex >= 0 ? primaryIndex : 0;
}

export function moveProductImageIndex(currentIndex, direction, imageCount) {
  if (imageCount <= 0) return 0;
  return ((currentIndex + direction) % imageCount + imageCount) % imageCount;
}

export function shouldAutoplayProductGallery({ imageCount, reducedMotion, paused, modalOpen }) {
  return imageCount > 1 && !reducedMotion && !paused && !modalOpen;
}
