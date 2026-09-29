import { Megaphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import {
  buildCatalogSlides,
  catalogSlideDurationMilliseconds,
  nextCatalogSlideIndex,
} from "../helpers/customerNoticeCarousel.js";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function CatalogNoticeCarousel() {
  const { notices, presentation } = useCustomerNotice();
  const slides = useMemo(() => buildCatalogSlides(presentation, notices), [notices, presentation]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerVersion, setTimerVersion] = useState(0);
  const reducedMotion = useReducedMotion();
  const activeIndex = currentIndex < slides.length ? currentIndex : 0;

  useEffect(() => {
    if (slides.length < 2 || reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setCurrentIndex(nextCatalogSlideIndex(activeIndex, slides.length));
    }, catalogSlideDurationMilliseconds(slides[activeIndex]));
    return () => window.clearTimeout(timer);
  }, [activeIndex, reducedMotion, slides, timerVersion]);

  const selectSlide = (index) => {
    setCurrentIndex(index);
    setTimerVersion((current) => current + 1);
  };

  return (
    <section
      className="catalog-notice-carousel relative overflow-hidden rounded-lg bg-ink-950 bg-[linear-gradient(120deg,rgba(217,119,6,0.22),transparent_60%)] text-white"
      aria-label="Información destacada del catálogo"
      aria-roledescription="carrusel"
    >
      <div
        className="catalog-notice-track flex"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        aria-live="off"
      >
        {slides.map((slide, index) => (
          <article
            className={`relative isolate flex min-h-60 w-full shrink-0 items-center overflow-hidden px-8 pt-8 max-[620px]:min-h-64 max-[620px]:px-5 max-[620px]:pt-6 ${slides.length > 1 ? "pb-18 max-[620px]:pb-16" : "pb-8 max-[620px]:pb-6"}`}
            key={slide.id}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${index + 1} de ${slides.length}`}
            aria-hidden={index !== activeIndex}
          >
            {slide.imageUrl && (
              <>
                <img
                  className="absolute inset-y-0 right-0 -z-20 h-full w-[58%] object-cover max-[620px]:w-full"
                  src={slide.imageUrl}
                  alt=""
                />
                <span
                  className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#10151f_0%,rgba(16,21,31,0.98)_38%,rgba(16,21,31,0.72)_68%,rgba(16,21,31,0.2)_100%)] max-[620px]:bg-[linear-gradient(90deg,rgba(16,21,31,0.96),rgba(16,21,31,0.72))]"
                  aria-hidden="true"
                />
              </>
            )}
            <div className={`flex max-w-210 items-start gap-4 ${slide.imageUrl ? "w-[58%] max-[820px]:w-[66%] max-[620px]:w-full" : "w-full"}`}>
              {!slide.institutional && (
                <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-rust-500/20 text-rust-500 max-[480px]:size-9">
                  <Megaphone size={22} aria-hidden="true" />
                </span>
              )}
              <div>
                <span className="text-xs font-extrabold text-rust-500 uppercase">{slide.eyebrow}</span>
                <h1 className="mt-2 mb-2 text-3xl font-bold max-[620px]:text-2xl">{slide.title}</h1>
                <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-300">{slide.message}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="catalog-notice-indicators absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit justify-center gap-1 rounded-full border border-white/15 bg-ink-950/55 px-1.5 py-0.5 shadow-[0_3px_12px_rgba(0,0,0,0.24)] backdrop-blur-sm" aria-label="Seleccionar información destacada">
          {slides.map((slide, index) => (
            <button
              className="group grid size-8 min-h-8 place-items-center border-0 bg-transparent p-0 hover:bg-transparent"
              key={slide.id}
              type="button"
              aria-label={`Mostrar diapositiva ${index + 1}: ${slide.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => selectSlide(index)}
            >
              <span className={`catalog-notice-indicator h-3 rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.18)] transition-[width,background-color] ${index === activeIndex ? "w-7 border-rust-500 bg-rust-500" : "w-3 border-white/80 bg-ink-950/25 group-hover:bg-white/35"}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
