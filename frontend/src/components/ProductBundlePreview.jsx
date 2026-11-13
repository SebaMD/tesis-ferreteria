import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import AppModal from "./AppModal.jsx";
import CatalogCardSurface from "./CatalogCardSurface.jsx";
import { bundleRowLabels, bundleRowName } from "../helpers/productBundleForm.js";
import { formatClp } from "../helpers/formatters.js";
import { formatQuantityWithUnit } from "../helpers/units.js";

function PreviewImage({ file, savedUrl, name }) {
  const [temporary, setTemporary] = useState(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // The effect owns this temporary resource, including replacement and unmount.
    setTemporary({ file, url }); // eslint-disable-line react-hooks/set-state-in-effect
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const url = file ? (temporary?.file === file ? temporary.url : null) : savedUrl;
  return <div className="grid min-h-0 place-items-center overflow-hidden bg-slate-100 p-2 text-slate-500">{url ? <img src={url} alt={name} className="h-full max-h-full w-full object-contain" /> : <span className="grid justify-items-center gap-2 text-xs"><ImageOff size={36} />Sin fotografía</span>}</div>;
}

export default function ProductBundlePreview({ draft, commonFiles, categories, onClose, inline = false }) {
  const headingRef = useRef(null);
  useEffect(() => { if (inline) headingRef.current?.focus(); }, [inline]);
  const [key, setKey] = useState(draft.rows[0]?.key);
  const row = draft.rows.find(r => r.key === key) || draft.rows[0];
  const name = row ? bundleRowName(draft, row) : draft.name;
  const stock = Math.max(0, Number(row?.id ? row.currentStock : row?.initialStock) || 0);
  const price = row?.price === "" || row?.price == null ? null : Number(row.price);
  const file = row?.files[0] || (row?.useCommon ? commonFiles[0] : null);
  const savedUrl = row?.images?.find(i => i.isPrimary)?.imageUrl || row?.images?.[0]?.imageUrl;
  const state = !row?.status ? "Inactivo — no visible en el catálogo" : row.inStoreOnly ? "Solo presencial" : stock < 1 ? "Agotado" : "Disponible para venta online";
  const content = <>
    <p className="mt-0 text-xs text-slate-500">Borrador orientativo, sin promociones calculadas. No crea artículos ni reservas. El stock mostrado es {row?.id ? "físico consultado" : "inicial previsto"}; la disponibilidad definitiva se valida al comprar.</p>
    <CatalogCardSurface>
      <PreviewImage file={file} savedUrl={savedUrl} name={name} />
      <div className="grid min-w-0 content-start gap-3 p-4">
        <span className="text-xs font-bold text-rust-600">{categories.find(c => c.id === Number(draft.categoryId))?.name || "Categoría pendiente"}</span>
        <strong className="break-words">{draft.name || "Nombre pendiente"}</strong>
        {draft.brand && <span className="text-xs text-slate-500">{draft.brand}</span>}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong>{Number.isSafeInteger(price) && price >= 0 ? formatClp(price) : "Precio pendiente"}</strong>
          <label className="min-w-0 w-full text-xs sm:w-auto">Opción de vista previa<select className="w-full min-w-0" value={row?.key || ""} onChange={e => setKey(e.target.value)}>{draft.rows.map(r => <option key={r.key} value={r.key}>{bundleRowLabels(draft, r).filter(Boolean).join(" · ") || "Combinación pendiente"}</option>)}</select></label>
        </div>
        <span className="break-words text-sm">{name}</span><span className="text-sm">{formatQuantityWithUnit(stock, row?.unitMeasure ?? draft.unitMeasure)} · {state}</span>
        {(row?.description ?? draft.description) && <p className="m-0 break-words text-sm">{row?.description ?? draft.description}</p>}
      </div>
    </CatalogCardSurface>
  </>;
  return inline ? <section className="mx-auto grid w-full max-w-sm gap-3" aria-label="Vista previa — sin guardar"><h3 ref={headingRef} tabIndex={-1} className="m-0 text-lg font-bold">Vista previa — sin guardar</h3>{content}<button type="button" onClick={onClose}>Volver al formulario</button></section>
    : <AppModal open title="Vista previa — sin guardar" size="small" onClose={onClose}>{content}</AppModal>;
}
