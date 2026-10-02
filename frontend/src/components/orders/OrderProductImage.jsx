import { ImageOff } from "lucide-react";
import { useState } from "react";

export default function OrderProductImage({
  alt,
  className = "block max-h-full max-w-full object-contain object-center p-1",
  fallbackSize = 28,
  src,
}) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
    return <ImageOff className="text-slate-400" size={fallbackSize} aria-label="Producto sin fotografía" />;
  }

  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} />;
}
