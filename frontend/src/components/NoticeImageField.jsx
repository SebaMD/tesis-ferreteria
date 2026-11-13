import {useEffect,useId,useMemo,useRef} from 'react';
import {Image as ImageIcon,X} from 'lucide-react';

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export default function NoticeImageField({ currentUrl, file, onFile, removeImage, onRemove, disabled = false }) {
  const titleId = useId();
  const fileInputRef = useRef(null);
  const previewUrl = useObjectUrl(file);
  const visibleUrl = previewUrl || (!removeImage ? currentUrl : "");
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-3" aria-labelledby={titleId}>
      <h4 className="m-0 text-xs font-bold text-ink-700" id={titleId}>Imagen opcional</h4>
      <p className="m-0 text-xs leading-5 text-slate-500">
        Imagen recomendada: 1920 × 720 px (formato panorámico). Mantén el contenido principal centrado para que se vea correctamente tanto en computador como en celular.
      </p>
      <div className="relative aspect-video w-full max-w-96 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        {visibleUrl ? (
          <>
            <img className="h-full w-full object-cover" src={visibleUrl} alt="Previsualización del slide" />
            <button
              className="absolute top-2 right-2 size-9 min-h-9 border-white/60 bg-ink-950/85 p-0 text-white hover:bg-ink-950"
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Quitar imagen"
              title="Quitar imagen"
            ><X size={16} /></button>
          </>
        ) : (
          <div className="grid h-full place-items-center text-slate-500" aria-hidden="true">
            <span className="flex items-center gap-2 text-xs font-semibold"><ImageIcon size={18} /> Sin imagen seleccionada</span>
          </div>
        )}
      </div>
      <button
        className="min-h-10 w-fit max-w-full border-ink-950 bg-ink-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-ink-800"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        data-notice-image-picker
        disabled={disabled}
        aria-label={visibleUrl ? "Cambiar imagen" : "Seleccionar imagen"}
      >
        <ImageIcon size={17} /> {visibleUrl ? "Cambiar imagen" : "Seleccionar imagen"}
      </button>
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        tabIndex={-1}
        disabled={disabled}
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          onFile(event.target.files?.[0] || null);
          event.target.value = "";
        }}
      />
      <span className="text-[11px] text-slate-500">JPG, PNG o WebP · máximo 5 MB.</span>
    </section>
  );
}
