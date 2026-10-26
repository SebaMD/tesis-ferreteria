import { useState } from "react";
import { variantAvailability } from "../helpers/productVariants.js";
import { bundleCardChoice } from "../helpers/productBundleForm.js";

export default function ProductFamilyCard({ product, detailOrigin, CardView }) {
  const [selectedId, setSelectedId] = useState(null);
  const options = product.variants || [];
  const selected = bundleCardChoice(product, selectedId);
  if (!selected) return null;
  return <CardView product={selected} displayName={product.name} detailOrigin={detailOrigin}
    detailPath={`/catalog/families/${product.id}?variant=${selected.id}`}
    optionSelector={<select aria-label={`Opciones de ${product.name}`} value={selected.id}
      onChange={event => setSelectedId(Number(event.target.value))}
      className="min-h-11 min-w-0 w-full max-w-full flex-none rounded border border-slate-300 bg-white px-2 text-xs text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-600 sm:ml-auto sm:w-auto sm:max-w-[180px] sm:flex-1">
      {options.map(v => <option key={v.id} value={v.id}>
        {v.variantValues?.map(value => value.label).join(" · ") || v.name}
        {variantAvailability({ ...v, status: true }) !== "Disponible online" ? ` — ${variantAvailability({ ...v, status: true })}` : ""}
      </option>)}
    </select>} />;
}
