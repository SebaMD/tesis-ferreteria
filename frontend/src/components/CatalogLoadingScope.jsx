import { useLayoutEffect, useRef, useState } from "react";
import { LoadingIndicator } from "./LoadingOverlay.jsx";

export default function CatalogLoadingScope({ active, children, fullPage = false, label = "Cargando catálogo" }) {
  const region = useRef(null);
  const [center, setCenter] = useState({ left: "50%", top: "50%" });
  const [navbarBottom, setNavbarBottom] = useState(0);
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      const rect = region.current.getBoundingClientRect();
      const navBottom = document.querySelector("[data-client-navbar]")?.getBoundingClientRect().bottom || 0;
      setNavbarBottom(Math.max(0, navBottom));
      const top = fullPage ? Math.max(navBottom, 0) : Math.max(rect.top, navBottom, 0), bottom = fullPage ? window.innerHeight : Math.min(rect.bottom, window.innerHeight);
      setCenter({ left: Math.max(0, rect.left) + Math.min(rect.width, window.innerWidth) / 2,
        top: top + Math.max(0, bottom - top) / 2 });
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(region.current);
    const navbar = document.querySelector("[data-client-navbar]"); if (navbar) observer.observe(navbar);
    const footer = fullPage ? navbar?.parentElement?.querySelector("footer") : null;
    const footerWasInert = footer?.inert;
    if (footer) footer.inert = true;
    window.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update);
    return () => { if (footer) footer.inert = footerWasInert; observer.disconnect(); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [active, fullPage]);
  return <div ref={region} className="catalog-loading-scope relative isolate min-w-0" aria-busy={active}>
    <div inert={active} className="relative z-0 grid min-w-0 gap-6">{children}</div>
    {active && <>
      <div className={`catalog-loading-mask ${fullPage ? "fixed inset-x-0 bottom-0" : "absolute inset-0"} z-30 cursor-progress bg-white/70 backdrop-blur-[5px]`} style={fullPage ? { top: navbarBottom } : undefined} />
      {/* Keep fixed positioning outside the backdrop-filter containing block. */}
      <div role="status" aria-live="polite" aria-label={label} className="catalog-loading-visible-center pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-1/2" style={center}><LoadingIndicator /></div>
    </>}
  </div>;
}
