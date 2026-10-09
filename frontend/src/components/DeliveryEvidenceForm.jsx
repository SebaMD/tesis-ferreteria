import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function DeliveryEvidenceForm({
  deliveryType,
  value,
  onChange,
  disabled = false,
}) {
  const [fileError, setFileError] = useState("");
  const requiresPhoto = deliveryType === "DELIVERY";
  const previewUrl = useMemo(
    () => value.proofImage ? URL.createObjectURL(value.proofImage) : "",
    [value.proofImage],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const update = (field, fieldValue) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const selectImage = (file) => {
    setFileError("");
    if (!file) {
      update("proofImage", null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setFileError("La fotografía debe ser JPG, PNG o WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setFileError("La fotografía no puede superar 5 MB.");
      return;
    }
    update("proofImage", file);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-[5px] border border-rust-200 bg-rust-50 px-4 py-3 text-sm leading-6 text-rust-700">
        Registra los datos de la persona que recibió físicamente el pedido.
        {requiresPhoto && " La fotografía debe mostrar el paquete o la entrega, no un documento de identidad."}
      </div>

      <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
        <label className="grid gap-1.5 text-sm font-bold text-ink-950">
          Nombre de quien recibe
          <input
            autoComplete="off"
            disabled={disabled}
            maxLength={240}
            onChange={(event) => update("receiverName", event.target.value)}
            placeholder="Nombre completo"
            required
            value={value.receiverName}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-ink-950">
          RUT de quien recibe
          <input
            autoComplete="off"
            disabled={disabled}
            maxLength={12}
            onChange={(event) => update("receiverRut", event.target.value)}
            placeholder="12345678-9"
            required
            value={value.receiverRut}
          />
        </label>
      </div>

      {requiresPhoto && (
        <div className="grid gap-2">
          <span className="text-sm font-bold text-ink-950">Fotografía comprobante</span>
          {previewUrl ? (
            <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              <img
                className="max-h-80 w-full object-contain"
                src={previewUrl}
                alt="Vista previa del comprobante de entrega"
              />
              <button
                className="absolute top-2 right-2 size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 shadow-sm hover:bg-slate-100"
                type="button"
                aria-label="Quitar fotografía"
                title="Quitar fotografía"
                disabled={disabled}
                onClick={() => selectImage(null)}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <label className="grid min-h-40 cursor-pointer place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-rust-400 hover:bg-rust-50">
              <span className="grid justify-items-center gap-2 text-sm text-slate-500">
                <span className="grid size-12 place-items-center rounded-full bg-white text-rust-600 shadow-sm">
                  <Camera size={23} />
                </span>
                <strong className="text-ink-950">Tomar o seleccionar fotografía</strong>
                JPG, PNG o WebP · máximo 5 MB
              </span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={disabled}
                onChange={(event) => selectImage(event.target.files?.[0] || null)}
              />
            </label>
          )}
          {fileError && <span className="flex items-center gap-1.5 text-xs font-semibold text-critical-600"><ImagePlus size={14} />{fileError}</span>}
        </div>
      )}
    </div>
  );
}
