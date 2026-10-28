import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ProductAttributeRenameDialog from "./ProductAttributeRenameDialog.jsx";
import { readPendingProductNameCorrection } from "../helpers/productNameCorrection.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";
import useAuth from "../hooks/useAuth.js";

export default function ProductNameCorrectionAction({ product, dirty, busy, onRenamed, onOpenChange, onConflict = () => {} }) {
  const { user } = useAuth();
  const [baseline, setBaseline] = useState(product);
  const [target, setTarget] = useState(() => readPendingProductNameCorrection(user.id, product.id));
  const trigger = useRef(null);
  const open = Boolean(target);
  useEffect(() => {
    if (open) onOpenChange(true);
    return () => { if (open) onOpenChange(false); };
  }, [open, onOpenChange]);
  if (user.role !== "ADMIN") return null;
  const close = () => { setTarget(null); requestAnimationFrame(() => requestAnimationFrame(() => trigger.current?.focus())); };
  return <>
    <button ref={trigger} type="button" className={`${secondaryButtonClass} mt-1 text-xs`} disabled={busy} onClick={() => {
      if (dirty) { toast.warning("Guarda o descarta explícitamente los cambios pendientes antes de corregir el nombre. Tu borrador se conserva."); return; }
      setTarget({ id: baseline.id, name: baseline.name });
    }}>Corregir nombre</button>
    {target && <ProductAttributeRenameDialog productId={baseline.id} target={target} revision={baseline.updatedAt} userId={user.id}
      onClose={close} onConflict={onConflict} onRenamed={async result => {
        setBaseline(p => ({ ...p, name: result.name, updatedAt: result.revision }));
        close();
        try { await onRenamed(result); } catch { toast.warning("Corrección confirmada. Recarga el editor antes de guardar otros cambios."); onConflict(); }
      }}/>}
  </>;
}
