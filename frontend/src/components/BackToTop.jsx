import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    let shown = false;
    const update = () => {
      frame = 0;
      const next = window.scrollY > 600;
      if (next !== shown) { shown = next; setVisible(next); }
    };
    const scroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => { window.removeEventListener("scroll", scroll); window.cancelAnimationFrame(frame); };
  }, []);
  if (!visible) return null;
  return <button type="button" aria-label="Volver arriba" title="Volver arriba" className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 z-20 size-11 min-h-11 rounded-full border-ink-950 bg-ink-950 p-0 text-white shadow-lg hover:bg-ink-700" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ArrowUp size={20} /></button>;
}
