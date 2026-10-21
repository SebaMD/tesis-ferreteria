import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import ProductPurchaseControls from "../components/ProductPurchaseControls.jsx";
import ProductEstimatedAvailability from "../components/ProductEstimatedAvailability.jsx";
import ProductPromotionPrice from "../components/ProductPromotionPrice.jsx";
import FavoriteButton from "../components/FavoriteButton.jsx";
import { getCatalogFamilyRequest } from "../services/catalog.service.js";
import { getApiError } from "../api/httpClient.js";
import { resolveProductDetailReturn } from "../helpers/catalogNavigation.js";
import { isVariantPurchasable, variantOptionState, variantAvailability, variantLabel, familyVariantDescription } from "../helpers/productVariants.js";
import { getDisplayUnit } from "../helpers/units.js";

export default function ProductFamilyPage() {
  const { id } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("variant"));
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectionNotice, setSelectionNotice] = useState("");
  const back = resolveProductDetailReturn(location.state);
  useEffect(() => {
    let active = true;
    const load = (notify = false) => getCatalogFamilyRequest(id).then((data) => { if (active) setFamily(data); }).catch((error) => {
      if (active && error?.response?.status === 404) setFamily(null);
      if (notify) toast.error(getApiError(error, "No se pudo cargar la familia"));
    }).finally(() => { if (active) setLoading(false); });
    load(true);
    const refresh = () => load();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [id]);
  if (loading) return <main className="min-h-100"><LoadingOverlay active /></main>;
  if (!family) return <main className="mx-auto max-w-320 p-6"><h1>Familia no disponible</h1><Link to={back.to} state={back.state}>{back.label}</Link></main>;
  const selected = family.variants.find((v) => v.id === selectedId) || family.variants.find(isVariantPurchasable) || family.variants.find((v) => v.status) || family.variants[0];
  const select = (option) => {
    if (!option?.available) return;
    setSelectionNotice(option.adjusted ? `Se seleccionó una combinación existente: ${variantLabel(option.variant)}.` : "");
    setParams({ variant: String(option.variant.id) }, { replace: true, preventScrollReset: true, state: location.state });
  };
  const purchasable = isVariantPurchasable(selected);
  const description = familyVariantDescription(selected.description || family.description);
  return <main className="mx-auto grid w-full max-w-320 gap-5 px-6 py-8 max-[720px]:px-3.5">
    <Link to={back.to} state={back.state} preventScrollReset className="inline-flex w-fit items-center gap-2 text-sm font-bold text-ink-700 no-underline hover:text-rust-600"><ArrowLeft size={17} />{back.label}</Link>
    <section className="grid min-w-0 grid-cols-2 gap-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm max-[860px]:grid-cols-1 max-[620px]:p-4">
      <ProductGallery key={selected.id} images={selected.images || []} productName={selected.name} />
      <div className="grid min-w-0 content-start gap-5">
        <div>
          <span className="text-xs font-extrabold text-rust-600">{selected.categoryName}</span>
          <div className="flex items-start justify-between gap-3"><h1 className="mt-2 mb-2 min-w-0 text-3xl font-bold text-ink-950 max-[620px]:text-2xl">{family.name}</h1>{selected.status && <FavoriteButton product={selected} />}</div>
          {family.brand && <p className="text-sm text-slate-500">Marca: {family.brand}</p>}
        </div>
        {description.text && <p className="m-0 leading-7 text-slate-600">{description.text}</p>}
        <div className="grid min-w-0 gap-3" aria-label="Seleccionar variante">
          {family.attributes.map((attribute) => <fieldset key={attribute.id} className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-bold">{attribute.name}</legend>
            <div className="flex flex-wrap gap-2">{attribute.options.map((o) => {
              const option = variantOptionState(family.variants, selected, attribute.id, o.id);
              if (!option) return null;
              const pressed = selected.variantValues?.some((value) => value.optionId === o.id) || false;
              return <button key={o.id} type="button" aria-pressed={pressed} disabled={!option.available}
                aria-label={`${attribute.name}: ${o.label}${!option.available ? ` — ${option.reason}` : ""}`}
                onClick={() => select(option)}
                className={`inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-[5px] border px-3 py-2 text-left text-sm leading-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-600 ${!option.available ? "border-slate-200 bg-slate-100 text-slate-500 disabled:opacity-100" : pressed ? "border-rust-600 bg-rust-50 text-ink-950 hover:bg-rust-100" : "border-slate-300 bg-white text-ink-700 hover:border-rust-600 hover:bg-slate-50"}`}>
                {pressed && <Check size={14} className="shrink-0" aria-hidden="true" />}<span className={!option.available ? "break-words line-through" : "break-words"}>{o.label}</span>
                {!option.available && <span className="text-xs font-normal">({option.reason})</span>}
              </button>;
            })}</div>
          </fieldset>)}
          <span className="sr-only" aria-live="polite" aria-atomic="true">{variantLabel(selected)}. {variantAvailability(selected)}</span>
          {selectionNotice && <p className="m-0 text-xs text-slate-500" role="status">{selectionNotice}</p>}
        </div>
        <div className="min-h-10">{selected.status && <ProductPromotionPrice product={selected} size="detail" />}</div>
        <div className="product-availability-panel grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-4 text-sm">
          {selected.status && <span><strong>Unidad de medida:</strong> {getDisplayUnit(1, selected.unitMeasure)}</span>}
          {purchasable ? <ProductEstimatedAvailability product={selected} /> : <span className="font-bold text-critical-600">{variantAvailability(selected)}</span>}
        </div>
        <div className="mx-auto w-full max-w-md">{selected.status && <ProductPurchaseControls key={selected.id} product={selected} showBuyNow />}</div>
        <p className="m-0 text-xs leading-5 text-slate-500">Agregar al carrito no reserva stock. La disponibilidad se vuelve a validar al iniciar el pago.</p>
        {description.demo && <p className="m-0 text-xs text-slate-500">Catálogo de demostración: precios y existencias ficticios.</p>}
      </div>
    </section>
  </main>;
}
