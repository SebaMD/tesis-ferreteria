export const INSTITUTIONAL_CATALOG_SLIDE = Object.freeze({
  id: "institutional",
  title: "Encuentra materiales y herramientas para tu próximo proyecto",
  message: "Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.",
  eyebrow: "Catálogo Ferretería FYF",
  displaySeconds: 7,
  institutional: true,
});

export function buildCatalogSlides(notices) {
  const publicNotices = Array.isArray(notices) ? notices : [];
  return [
    INSTITUTIONAL_CATALOG_SLIDE,
    ...publicNotices.map((notice) => ({
      id: `notice-${notice.id}`,
      title: notice.title,
      message: notice.message,
      eyebrow: "Información de la ferretería",
      displaySeconds: notice.displaySeconds,
      institutional: false,
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
