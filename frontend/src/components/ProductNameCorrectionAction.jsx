import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ProductAttributeRenameDialog from "./ProductAttributeRenameDialog.jsx";
import { readPendingProductNameCorrection } from "../helpers/productNameCorrection.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";
import useAuth from "../hooks/useAuth.js";
import AuditedValueControl from "./AuditedValueControl.jsx";

export default function ProductNameCorrectionAction({ product, dirty, busy, onRenamed, onOpenChange, onConflict = () => {}, asField = false, label = "Nombre identificable" }) {
  const { user } = useAuth();
  const [baseline, setBaseline] = useState(product);
  const [target, setTarget] = useState(() => readPendingProductNameCorrection(user.id, product.id));
  const trigger = useRef(null);
  const open = Boolean(target);
  useEffect(() => {
    if (open) onOpenChange(true);
    return () => { if (open) onOpenChange(false); };
  }, [open, onOpenChange]);
  if (user.role !== "ADMIN") return asField ? <div className="grid min-w-0 gap-1"><span className="text-sm font-semibold">{label}</span><p className="m-0 break-words text-sm">{product.name}</p></div> : null;
  const close = () => { setTarget(null); requestAnimationFrame(() => requestAnimationFrame(() => trigger.current?.focus())); };
  const begin = () => {
    if (dirty) { toast.warning("Guarda o descarta explícitamente los cambios pendientes antes de corregir el nombre. Tu borrador se conserva."); return; }
    setTarget({ id: baseline.id, name: baseline.name });
  };
  return <>
    {asField ? <AuditedValueControl label={label} value={baseline.name} action="Corregir nombre" buttonRef={trigger} disabled={busy} onClick={begin} help={dirty ? "Guarda o descarta los cambios pendientes antes de corregir el nombre." : undefined}/>
      : <button ref={trigger} type="button" className={`${secondaryButtonClass} mt-1 text-xs`} disabled={busy} onClick={begin}>Corregir nombre</button>}
    {target && <ProductAttributeRenameDialog productId={baseline.id} target={target} revision={baseline.updatedAt} userId={user.id}
      onClose={close} onConflict={onConflict} onRenamed={async result => {
        setBaseline(p => ({ ...p, name: result.name, updatedAt: result.revision }));
        close();
        try { await onRenamed(result); } catch { toast.warning("Corrección confirmada. Recarga el editor antes de guardar otros cambios."); onConflict(); }
      }}/>}
  </>;
}
