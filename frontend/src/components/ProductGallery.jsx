import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useState } from "react";

export default function ProductGallery({ images = [], productName }) {
  const primaryIndex = Math.max(images.findIndex((image) => image.isPrimary), 0);
  const [selectedIndex, setSelectedIndex] = useState(primaryIndex);
  const selectedImage = images[selectedIndex] || images[0] || null;

  const showPrevious = () => {
    setSelectedIndex((current) => (current - 1 + images.length) % images.length);
  };

  const showNext = () => {
    setSelectedIndex((current) => (current + 1) % images.length);
  };

  return (
    <div className="grid gap-3">
      <div className="relative grid aspect-square max-h-135 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {selectedImage ? (
          <img className="h-full w-full object-contain" src={selectedImage.imageUrl} alt={`${productName}, fotografía ${selectedIndex + 1}`} />
        ) : (
          <span className="grid justify-items-center gap-2 text-sm font-semibold text-slate-500">
            <ImageOff size={48} /> Producto sin fotografías
          </span>
        )}
        {images.length > 1 && (
          <>
            <button className="absolute left-3 size-10 min-h-10 rounded-full border-slate-300 bg-white/95 p-0 text-ink-700 shadow" type="button" onClick={showPrevious} aria-label="Fotografía anterior">
              <ChevronLeft size={20} />
            </button>
            <button className="absolute right-3 size-10 min-h-10 rounded-full border-slate-300 bg-white/95 p-0 text-ink-700 shadow" type="button" onClick={showNext} aria-label="Fotografía siguiente">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Miniaturas del producto">
          {images.map((image, index) => (
            <button className={`size-17 min-h-17 shrink-0 overflow-hidden border-2 bg-white p-0 ${index === selectedIndex ? "border-rust-500" : "border-slate-200"}`} type="button" key={image.id} onClick={() => setSelectedIndex(index)} aria-label={`Mostrar fotografía ${index + 1}`} aria-pressed={index === selectedIndex}>
              <img className="h-full w-full object-cover" src={image.imageUrl} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
