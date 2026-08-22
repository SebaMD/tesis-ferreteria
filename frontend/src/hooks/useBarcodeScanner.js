import { useEffect, useRef } from "react";

const DEFAULT_MIN_LENGTH = 6;
const DEFAULT_MAX_KEY_INTERVAL_MS = 80;
const DEFAULT_RESET_DELAY_MS = 250;

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function useBarcodeScanner({
  captureInModal = false,
  enabled = true,
  isInputAllowed,
  minLength = DEFAULT_MIN_LENGTH,
  onScan,
}) {
  const onScanRef = useRef(onScan);
  const isInputAllowedRef = useRef(isInputAllowed);
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const targetRef = useRef(null);
  const previousValueRef = useRef(undefined);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    onScanRef.current = onScan;
    isInputAllowedRef.current = isInputAllowed;
  }, [isInputAllowed, onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    const clearBuffer = () => {
      bufferRef.current = "";
      lastKeyAtRef.current = 0;
      targetRef.current = null;
      previousValueRef.current = undefined;
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };

    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;

      const editableTarget = isEditableTarget(event.target);
      const allowedInput = editableTarget && Boolean(isInputAllowedRef.current?.(event.target));
      const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));

      if (
        (editableTarget && !allowedInput)
        || (modalOpen && !captureInModal && !allowedInput)
      ) {
        clearBuffer();
        return;
      }

      const now = window.performance.now();

      if (/^\d$/.test(event.key)) {
        const changedTarget = targetRef.current && targetRef.current !== event.target;
        const exceededInterval = lastKeyAtRef.current
          && now - lastKeyAtRef.current > DEFAULT_MAX_KEY_INTERVAL_MS;
        const startsNewSequence = !bufferRef.current || changedTarget || exceededInterval;

        if (startsNewSequence) {
          bufferRef.current = "";
          previousValueRef.current = allowedInput ? event.target.value : undefined;
        }

        bufferRef.current = `${bufferRef.current}${event.key}`.slice(0, 64);
        lastKeyAtRef.current = now;
        targetRef.current = event.target;

        if (!editableTarget) event.preventDefault();
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(clearBuffer, DEFAULT_RESET_DELAY_MS);
        return;
      }

      if (event.key === "Enter" && bufferRef.current) {
        const barcode = bufferRef.current;
        const arrivedOnTime = now - lastKeyAtRef.current <= DEFAULT_RESET_DELAY_MS;
        const isCompleteScan = arrivedOnTime && barcode.length >= minLength;
        const scanTarget = targetRef.current;
        const previousValue = previousValueRef.current;
        clearBuffer();

        if (isCompleteScan) {
          event.preventDefault();
          onScanRef.current?.(barcode, { previousValue, target: scanTarget });
        }
        return;
      }

      if (event.key === "Escape") clearBuffer();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearBuffer();
    };
  }, [captureInModal, enabled, minLength]);
}
