import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getInitialProductImageIndex,
  moveProductImageIndex,
  PRODUCT_GALLERY_AUTOPLAY_MS,
  shouldAutoplayProductGallery,
} from "../helpers/productGallery.js";
import AppModal from "./AppModal.jsx";

function GalleryZones({ multiple, onOpen, onPrevious, onNext }) {
  const zoneClass = "group min-h-0 rounded-none border-0 bg-transparent p-0 text-white hover:bg-ink-950/10 focus-visible:bg-ink-950/15";
  const iconClass = "pointer-events-none opacity-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100";

  return (
    <div className={`absolute inset-0 grid ${multiple ? "grid-cols-[1fr_2fr_1fr]" : "grid-cols-1"}`}>
      {multiple && (
        <button className={zoneClass} type="button" onClick={onPrevious} aria-label="Imagen anterior" title="Imagen anterior">
          <ChevronLeft className={iconClass} size={30} strokeWidth={2.5} />
        </button>
      )}
      <button className={zoneClass} type="button" onClick={onOpen} aria-label="Ampliar imagen" title="Ampliar imagen">
        <Maximize2 className={iconClass} size={25} strokeWidth={2.25} />
      </button>
      {multiple && (
        <button className={zoneClass} type="button" onClick={onNext} aria-label="Imagen siguiente" title="Imagen siguiente">
          <ChevronRight className={iconClass} size={30} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export default function ProductGallery({ images = [], productName }) {
  const [selectedIndex, setSelectedIndex] = useState(() => getInitialProductImageIndex(images));
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ));
  const activeIndex = images.length > 0 ? selectedIndex % images.length : 0;
  const selectedImage = images[activeIndex] || null;
  const multiple = images.length > 1;

  const showRelativeImage = (direction) => {
    setSelectedIndex((current) => moveProductImageIndex(current, direction, images.length));
  };
  const selectImage = (index) => setSelectedIndex(index);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const handleChange = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    const canAutoplay = shouldAutoplayProductGallery({
      imageCount: images.length,
      reducedMotion,
      paused: hovered || focusWithin,
      modalOpen: lightboxOpen,
    });
    if (!canAutoplay) return undefined;

    const timer = window.setTimeout(() => {
      setSelectedIndex((current) => moveProductImageIndex(current, 1, images.length));
    }, PRODUCT_GALLERY_AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [focusWithin, hovered, images.length, lightboxOpen, reducedMotion, selectedIndex]);

  useEffect(() => {
    if (!lightboxOpen || !multiple) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((current) => moveProductImageIndex(current, -1, images.length));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((current) => moveProductImageIndex(current, 1, images.length));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, multiple, images.length]);

  const resumeAfterFocus = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
  };

  return (
    <div
      className="grid gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={resumeAfterFocus}
    >
      <div className="relative">
        <div className={`relative grid aspect-square max-h-135 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${multiple ? "min-[721px]:ml-20" : ""}`}>
          {selectedImage ? (
            <>
              <img
                className="h-full w-full object-contain object-center"
                src={selectedImage.imageUrl}
                alt={`${productName}, fotografía ${activeIndex + 1} de ${images.length}`}
                loading="eager"
              />
              <GalleryZones
                multiple={multiple}
                onOpen={() => setLightboxOpen(true)}
                onPrevious={() => showRelativeImage(-1)}
                onNext={() => showRelativeImage(1)}
              />
              {multiple && (
                <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/60 bg-ink-950/80 px-2.5 py-1 text-[11px] font-black text-white shadow" aria-live="polite">
                  {activeIndex + 1} / {images.length}
                </span>
              )}
            </>
          ) : (
            <span className="grid justify-items-center gap-2 text-sm font-semibold text-slate-500">
              <ImageOff size={48} /> Producto sin fotografías
            </span>
          )}
        </div>

        {multiple && (
          <div className="product-gallery-thumbnails mt-3 flex gap-2 overflow-x-auto overscroll-contain pb-1 min-[721px]:absolute min-[721px]:inset-y-0 min-[721px]:left-0 min-[721px]:mt-0 min-[721px]:w-17 min-[721px]:flex-col min-[721px]:overflow-x-hidden min-[721px]:overflow-y-auto min-[721px]:pr-1 min-[721px]:pb-0" aria-label="Miniaturas del producto">
            {images.map((image, index) => (
              <button
                className={`size-16 min-h-16 shrink-0 overflow-hidden border-2 bg-white p-1 ${index === activeIndex ? "border-rust-500 shadow-[0_0_0_1px_rgba(217,119,6,0.2)]" : "border-slate-200 hover:border-slate-400"}`}
                type="button"
                key={image.id}
                onClick={() => selectImage(index)}
                aria-label={`Mostrar fotografía ${index + 1} de ${images.length}`}
                aria-current={index === activeIndex ? "true" : undefined}
              >
                <img className="h-full w-full object-contain object-center" src={image.imageUrl} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <AppModal
        open={lightboxOpen && Boolean(selectedImage)}
        onClose={() => setLightboxOpen(false)}
        title={`Imagen ampliada de ${productName}`}
        description={multiple ? `Fotografía ${activeIndex + 1} de ${images.length}` : "Fotografía del producto"}
        size="xlarge"
        overlayClassName="backdrop-blur-sm"
        panelClassName="max-w-[min(1180px,calc(100vw-20px))]"
      >
        <div className="relative grid min-h-[min(68dvh,720px)] place-items-center overflow-hidden rounded-md bg-ink-950 max-[620px]:min-h-[58dvh]">
          {selectedImage && (
            <img
              className="max-h-[calc(100dvh-180px)] max-w-full object-contain"
              src={selectedImage.imageUrl}
              alt={`${productName}, fotografía ampliada ${activeIndex + 1} de ${images.length}`}
            />
          )}
          {multiple && (
            <>
              <button className="group absolute inset-y-0 left-0 w-1/4 min-h-0 rounded-none border-0 bg-transparent p-0 text-white hover:bg-white/5 focus-visible:bg-white/10" type="button" onClick={() => showRelativeImage(-1)} aria-label="Imagen anterior" title="Imagen anterior">
                <ChevronLeft className="pointer-events-none opacity-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" size={36} strokeWidth={2.5} />
              </button>
              <button className="group absolute inset-y-0 right-0 w-1/4 min-h-0 rounded-none border-0 bg-transparent p-0 text-white hover:bg-white/5 focus-visible:bg-white/10" type="button" onClick={() => showRelativeImage(1)} aria-label="Imagen siguiente" title="Imagen siguiente">
                <ChevronRight className="pointer-events-none opacity-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" size={36} strokeWidth={2.5} />
              </button>
              <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/30 bg-black/70 px-2.5 py-1 text-[11px] font-black text-white" aria-live="polite">
                {activeIndex + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      </AppModal>
    </div>
  );
}
