export const INSTITUTIONAL_CATALOG_SLIDE = Object.freeze({
  id: "institutional",
  title: "Encuentra materiales y herramientas para tu próximo proyecto",
  message: "Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.",
  eyebrow: "Catálogo Ferretería FYF",
  displaySeconds: 7,
  institutional: true,
  imageUrl: null,
});

export function buildCatalogSlides(presentation, notices) {
  const institutional = presentation ? {
    ...INSTITUTIONAL_CATALOG_SLIDE,
    eyebrow: presentation.title || INSTITUTIONAL_CATALOG_SLIDE.eyebrow,
    title: presentation.mainText || INSTITUTIONAL_CATALOG_SLIDE.title,
    message: presentation.secondaryText || INSTITUTIONAL_CATALOG_SLIDE.message,
    imageUrl: presentation.imageUrl || null,
  } : INSTITUTIONAL_CATALOG_SLIDE;
  const publicNotices = Array.isArray(notices) ? notices : [];
  return [
    institutional,
    ...publicNotices.map((notice) => ({
      id: `notice-${notice.id}`,
      title: notice.title,
      message: notice.message,
      eyebrow: "Información de la ferretería",
      displaySeconds: notice.displaySeconds,
      institutional: false,
      imageUrl: notice.imageUrl || null,
    })),
  ];
}

export function nextCatalogSlideIndex(currentIndex, slideCount) {
  return slideCount > 0 ? (currentIndex + 1) % slideCount : 0;
}

export function catalogSlideDurationMilliseconds(slide) {
  const seconds = Number(slide?.displaySeconds);
  return (Number.isFinite(seconds) && seconds >= 3 && seconds <= 30 ? seconds : 7) * 1000;
}
