import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCROLL_Y = 600;
const NEAR_TOP_Y = 140;
const DIRECTION_INTENT_DELTA = 24;
const MICRO_MOVEMENT_DELTA = 3;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const scrollAnimationRef = useRef(0);

  const cancelScrollAnimation = useCallback(() => {
    if (!scrollAnimationRef.current) return;
    window.cancelAnimationFrame(scrollAnimationRef.current);
    scrollAnimationRef.current = 0;
  }, []);

  useEffect(() => {
    let frame = 0;
    let shown = false;
    let lastY = window.scrollY;
    let directionDistance = 0;
    let direction = 0;

    const setShown = (next) => {
      if (next === shown) return;
      shown = next;
      setVisible(next);
    };

    const update = () => {
      frame = 0;
      const currentY = window.scrollY;
      const delta = currentY - lastY;

      if (currentY <= NEAR_TOP_Y) {
        direction = 0;
        directionDistance = 0;
        lastY = currentY;
        setShown(false);
        return;
      }

      if (Math.abs(delta) < MICRO_MOVEMENT_DELTA) return;
      lastY = currentY;

      const nextDirection = delta > 0 ? 1 : -1;
      if (nextDirection !== direction) {
        direction = nextDirection;
        directionDistance = 0;
      }
      directionDistance += Math.abs(delta);

      if (currentY < MIN_SCROLL_Y) {
        setShown(false);
      } else if (directionDistance >= DIRECTION_INTENT_DELTA) {
        setShown(direction < 0);
      }
    };
    const scroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => { window.removeEventListener("scroll", scroll); window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const cancelFromUserInput = () => cancelScrollAnimation();
    window.addEventListener("wheel", cancelFromUserInput, { passive: true });
    window.addEventListener("touchstart", cancelFromUserInput, { passive: true });
    return () => {
      window.removeEventListener("wheel", cancelFromUserInput);
      window.removeEventListener("touchstart", cancelFromUserInput);
      cancelScrollAnimation();
    };
  }, [cancelScrollAnimation]);

  const returnToTop = () => {
    cancelScrollAnimation();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      window.scrollTo(0, 0);
      return;
    }

    const startY = window.scrollY;
    if (startY <= 0) return;
    const startedAt = performance.now();
    const duration = Math.min(900, Math.max(480, startY * 0.18));

    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      window.scrollTo(0, Math.round(startY * (1 - eased)));
      if (progress < 1) scrollAnimationRef.current = window.requestAnimationFrame(step);
      else scrollAnimationRef.current = 0;
    };
    scrollAnimationRef.current = window.requestAnimationFrame(step);
  };

  return (
    <button
      type="button"
      aria-label="Volver arriba"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title="Volver arriba"
      className={`back-to-top fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border-ink-950 bg-ink-950 px-4 py-2 text-white shadow-lg hover:bg-ink-700 ${visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
      onClick={returnToTop}
    >
      <ArrowUp size={18} /> Volver arriba
    </button>
  );
}
