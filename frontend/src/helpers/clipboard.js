function copyWithSelection(text, previousFocus) {
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  const container = previousFocus?.closest('[role="dialog"]') || document.body;
  try {
    container.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return typeof document.execCommand === "function" && document.execCommand("copy") === true;
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}

export async function copyText(text) {
  const previousFocus = document.activeElement;
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // The browser may still allow a user-initiated selection copy.
      }
    }
    if (!copyWithSelection(text, previousFocus)) throw new Error("No se pudo copiar al portapapeles");
  } finally {
    const restoreFocus = () => {
      if (previousFocus?.isConnected && (document.activeElement === document.body || document.activeElement === previousFocus)) previousFocus.focus({ preventScroll: true });
    };
    // A busy button becomes focusable again after the caller clears its state.
    if (previousFocus?.disabled) window.requestAnimationFrame(restoreFocus);
    else restoreFocus();
  }
}
