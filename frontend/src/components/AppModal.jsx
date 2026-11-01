import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const sizeClasses = {
  small: "max-w-[460px]",
  medium: "max-w-[620px]",
  large: "max-w-[780px]",
  xlarge: "max-w-[1180px]",
};

const activeModalLocks = new Set();
let originalBodyOverflow = "";

export default function AppModal({
  open,
  suspended = false,
  title,
  description,
  onClose,
  children,
  footer,
  headerActions,
  size = "medium",
  panelClassName = "",
  overlayClassName = "",
  initialFocusSelector,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || suspended) return undefined;

    const previousActiveElement = document.activeElement;
    const lock = dialogRef.current;
    if (!activeModalLocks.size) originalBodyOverflow = document.body.style.overflow;
    activeModalLocks.add(lock);
    let active = true;

    const handleKeyDown = (event) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;

      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getClientRects().length > 0 && !element.closest("[inert]"));
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) return;

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault(); firstElement.focus(); return;
      }

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
    queueMicrotask(() => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (!active || dialogs[dialogs.length - 1] !== dialogRef.current) return;
      const previous = lastFocusedRef.current;
      const initial = initialFocusSelector && dialogRef.current?.querySelector(initialFocusSelector);
      (previous?.isConnected && previous.getClientRects().length ? previous : initial && !initial.matches(':disabled') ? initial : closeButtonRef.current)?.focus();
    });

    return () => {
      active = false;
      activeModalLocks.delete(lock);
      document.body.style.overflow = activeModalLocks.size ? "hidden" : originalBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      const top = dialogs[dialogs.length - 1];
      if (!top || top.contains(previousActiveElement)) previousActiveElement?.focus?.();
    };
  }, [open, suspended, initialFocusSelector]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-900 grid place-items-center overflow-clip bg-[rgba(10,14,21,0.62)] p-6 max-[720px]:p-2.5 ${suspended ? "hidden!" : ""} ${overlayClassName}`}
      hidden={suspended}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`app-modal-panel flex max-h-[calc(100dvh-48px)] w-full flex-col overflow-hidden rounded-md border border-t-4 border-slate-200 border-t-rust-500 bg-white shadow-[0_24px_70px_rgba(10,14,21,0.3)] max-[720px]:max-h-[calc(100dvh-20px)] ${sizeClasses[size] || sizeClasses.medium} ${panelClassName}`}
        ref={dialogRef}
        onFocusCapture={event => { lastFocusedRef.current = event.target; }}
        role={suspended ? undefined : "dialog"}
        aria-modal={suspended ? undefined : true}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="flex shrink-0 items-start justify-between gap-4.5 border-b border-slate-200 px-5 py-4.5 max-[720px]:px-4">
          <div>
            <h2 className="m-0 text-[17px] font-bold text-ink-950" id={titleId}>{title}</h2>
            {description && <p className="mt-1 mb-0 text-xs leading-[1.45] text-slate-500" id={descriptionId}>{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
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
          </div>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 max-[720px]:px-4">{children}</div>
        {footer && <footer className="admin-form-actions shrink-0 border-t border-slate-200 px-5 py-3.5 max-[720px]:px-4">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
