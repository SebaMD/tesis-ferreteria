import { ImageOff } from "lucide-react";
import { useState } from "react";

export default function OrderProductImage({
  alt,
  className = "h-full w-full object-cover",
  fallbackSize = 28,
  src,
}) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
    return <ImageOff className="text-slate-400" size={fallbackSize} aria-label="Producto sin fotografía" />;
  }

  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} />;
}
