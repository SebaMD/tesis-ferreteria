import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const sizeClasses = {
  small: "max-w-[460px]",
  medium: "max-w-[620px]",
  large: "max-w-[780px]",
  xlarge: "max-w-[1180px]",
};

export default function AppModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "medium",
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[900] grid place-items-center overflow-hidden bg-[rgba(10,14,21,0.62)] p-6 backdrop-blur-[4px] max-[720px]:p-2.5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`flex max-h-[calc(100dvh-48px)] w-full flex-col overflow-hidden rounded-md border border-t-4 border-slate-200 border-t-rust-500 bg-white shadow-[0_24px_70px_rgba(10,14,21,0.3)] max-[720px]:max-h-[calc(100dvh-20px)] ${sizeClasses[size] || sizeClasses.medium}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="flex shrink-0 items-start justify-between gap-[18px] border-b border-slate-200 px-5 py-[18px] max-[720px]:px-4">
          <div>
            <h2 className="m-0 text-[17px] font-bold text-ink-950" id={titleId}>{title}</h2>
            {description && <p className="mt-1 mb-0 text-xs leading-[1.45] text-slate-500" id={descriptionId}>{description}</p>}
          </div>
          <button
            className="size-10 min-h-10 shrink-0 border-slate-300 bg-white p-0 text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            title="Cerrar"
          >
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 max-[720px]:px-4">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-200 px-5 py-3.5 max-[720px]:px-4">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
