import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import fyfLogo from "../assets/fyf-logo.png";

export default function BrandLogo({ className = "" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        className={`inline-flex min-h-0 shrink-0 overflow-hidden rounded-full border-0 bg-transparent p-0 hover:bg-transparent focus-visible:outline-white ${className}`}
        type="button"
        onClick={() => setOpen(true)}
        title="Ampliar logo"
        aria-label="Ampliar logo de Comercializadora FYF"
      >
        <img className="block size-full object-contain" src={fyfLogo} alt="Logo Comercializadora FYF" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-[rgba(10,14,21,0.68)] p-6 backdrop-blur-[10px]" role="dialog" aria-modal="true" aria-label="Logo Comercializadora FYF" onMouseDown={() => setOpen(false)}>
          <div className="relative w-[min(72vmin,680px)] max-w-full max-h-[88vh]" onMouseDown={(event) => event.stopPropagation()}>
            <img className="block w-full max-h-[88vh] object-contain" src={fyfLogo} alt="Logo ampliado de Comercializadora FYF" />
            <button className="absolute top-2 right-2 size-[42px] min-h-[42px] rounded-full border-white/45 bg-[rgba(16,21,31,0.82)] p-0 text-white hover:bg-ink-950" type="button" onClick={() => setOpen(false)} aria-label="Cerrar logo ampliado" title="Cerrar">
              <X size={22} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
