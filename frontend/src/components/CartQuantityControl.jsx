import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { validateCartQuantity } from "../helpers/cartQuantity.js";

export default function CartQuantityControl({ quantity, availableStock, disabled, productName, onQuantityChange }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const errorId = useId();

  const confirmQuantity = (value) => {
    const result = validateCartQuantity(value, availableStock);
    if (!result.valid) {
      setError(result.message);
    } else if (!disabled && !onQuantityChange(result.quantity)) {
      setError("No se pudo actualizar la cantidad. Revisa la disponibilidad.");
    } else {
      setError("");
    }
    setDraft(null);
  };

  return (
    <div className="grid max-w-40 gap-1.5">
      <div className="flex items-center gap-1">
        <button className="size-9 min-h-9 shrink-0 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => confirmQuantity(Math.min(quantity - 1, availableStock))} disabled={disabled || quantity <= 1} aria-label="Disminuir cantidad"><Minus size={16} /></button>
        <input
          className="min-w-0 w-16 text-center"
          type="text"
          inputMode="numeric"
          value={draft ?? String(quantity)}
          onChange={(event) => { setDraft(event.target.value); setError(""); }}
          onBlur={() => confirmQuantity(draft ?? quantity)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          disabled={disabled}
          aria-label={`Cantidad de ${productName}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button className="size-9 min-h-9 shrink-0 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => confirmQuantity(quantity + 1)} disabled={disabled || quantity >= availableStock} aria-label="Aumentar cantidad"><Plus size={16} /></button>
      </div>
      {error && <span id={errorId} className="text-xs leading-4 text-critical-600" role="alert">{error}</span>}
    </div>
  );
}
