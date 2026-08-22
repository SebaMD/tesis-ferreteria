import { ArrowDown, ArrowUp, ImageOff, ImagePlus, Star, Trash2, X } from "lucide-react";

export default function ProductImagesManager({
  disabled,
  images = [],
  pendingFiles = [],
  onDelete,
  onFilesSelected,
  onMove,
  onRemovePending,
  onSetPrimary,
}) {
  return (
    <section className="grid gap-3 rounded-[5px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong className="block text-sm text-ink-950">Fotografías del producto</strong>
          <span className="text-xs font-normal text-slate-500">JPG, PNG o WebP. Máximo 5 MB por archivo.</span>
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[5px] border border-ink-950 bg-ink-950 px-3 text-xs font-bold text-white">
          <ImagePlus size={17} /> Seleccionar imágenes
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={disabled}
            onChange={(event) => {
              onFilesSelected([...event.target.files]);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 max-[620px]:grid-cols-2">
          {images.map((image, index) => (
            <article className="grid gap-2 rounded-[5px] border border-slate-200 bg-white p-2" key={image.id}>
              <div className="relative aspect-square overflow-hidden rounded-[4px] bg-slate-100">
                <img className="h-full w-full object-cover" src={image.imageUrl} alt={`Fotografía ${index + 1}`} />
                {image.isPrimary && <span className="absolute top-1.5 left-1.5 rounded bg-rust-500 px-2 py-1 text-[10px] font-bold text-white">Principal</span>}
              </div>
              <div className="grid grid-cols-4 gap-1">
                <button className="size-8 min-h-8 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => onMove(index, -1)} disabled={disabled || index === 0} title="Mover antes" aria-label="Mover fotografía antes"><ArrowUp size={15} /></button>
                <button className="size-8 min-h-8 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => onMove(index, 1)} disabled={disabled || index === images.length - 1} title="Mover después" aria-label="Mover fotografía después"><ArrowDown size={15} /></button>
                <button className="size-8 min-h-8 border-slate-300 bg-white p-0 text-rust-600" type="button" onClick={() => onSetPrimary(image.id)} disabled={disabled || image.isPrimary} title="Definir como principal" aria-label="Definir como fotografía principal"><Star size={15} /></button>
                <button className="size-8 min-h-8 border-critical-600 bg-critical-600 p-0 text-white" type="button" onClick={() => onDelete(image.id)} disabled={disabled} title="Eliminar fotografía" aria-label="Eliminar fotografía"><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-24 place-items-center rounded-[5px] border border-dashed border-slate-300 bg-white text-xs font-semibold text-slate-500">
          <span className="grid justify-items-center gap-1"><ImageOff size={24} /> Sin fotografías guardadas</span>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="grid gap-1.5">
          <strong className="text-xs text-ink-700">Se subirán al guardar:</strong>
          {pendingFiles.map((file, index) => (
            <div className="flex items-center justify-between gap-2 rounded-[4px] border border-rust-200 bg-rust-50 px-2.5 py-1.5 text-xs text-rust-700" key={`${file.name}-${file.lastModified}-${index}`}>
              <span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button className="size-7 min-h-7 shrink-0 border-rust-200 bg-white p-0 text-rust-700" type="button" onClick={() => onRemovePending(index)} disabled={disabled} aria-label={`Quitar ${file.name}`}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
