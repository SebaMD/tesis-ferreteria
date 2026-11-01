import { forwardRef, useEffect, useRef } from "react";

// Shared inline editing surface: Escape cancels this draft, not the enclosing modal.
const NoticeInlineEditor = forwardRef(function NoticeInlineEditor({ children, onCancel, busy = false, ...props }, ref) {
  const editorRef = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const editor = editorRef.current;
    return () => {
      if (trigger?.isConnected && (editor?.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <form {...props} ref={node => { editorRef.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
    className="customer-notice-editor grid min-w-0 scroll-mt-4 gap-3 rounded-md border border-rust-500 bg-rust-50/40 p-4"
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
    }}>{children}</form>;
});

export default NoticeInlineEditor;
