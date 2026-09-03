import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import FavoriteButton from "../components/FavoriteButton.jsx";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock } from "../helpers/productAvailability.js";
import ProductPurchaseControls from "../components/ProductPurchaseControls.jsx";
import { formatQuantityWithUnit, getDisplayUnit } from "../helpers/units.js";
import { getCatalogProductByIdRequest } from "../services/catalog.service.js";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProduct = (notifyError = false) => getCatalogProductByIdRequest(id)
      .then(setProduct)
      .catch((error) => {
        if ([404, 409].includes(error?.response?.status)) setProduct(null);
        if (notifyError) toast.error(getApiError(error, "No se pudo cargar el producto"));
      })
      .finally(() => setLoading(false));

    loadProduct(true);
    const refreshProduct = () => loadProduct(false);
    const refreshTimer = window.setInterval(refreshProduct, 30_000);
    window.addEventListener("focus", refreshProduct);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshProduct);
    };
  }, [id]);

  if (loading) return <main className="min-h-100"><LoadingOverlay active /></main>;

  if (!product) {
    return (
      <main className="mx-auto grid min-h-100 max-w-220 place-items-center px-6 text-center">
        <div><h1>Producto no disponible</h1><Link to="/catalog">Volver al catálogo</Link></div>
      </main>
    );
  }

  const availableStock = getOnlineAvailableStock(product);
  const hasStock = availableStock > 0;

  return (
    <main className="mx-auto grid w-full max-w-320 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <Link className="inline-flex w-fit items-center gap-2 text-sm font-bold text-ink-700 no-underline hover:text-rust-600" to="/catalog">
        <ArrowLeft size={17} /> Volver al catálogo
      </Link>
      <section className="grid grid-cols-2 gap-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm max-[860px]:grid-cols-1 max-[620px]:p-4">
        <ProductGallery key={product.id} images={product.images} productName={product.name} />
        <div className="grid content-start gap-5">
          <div>
            <span className="text-xs font-extrabold text-rust-600">{product.categoryName}</span>
            <div className="flex items-start justify-between gap-3"><h1 className="mt-2 mb-2 min-w-0 text-3xl font-bold text-ink-950 max-[620px]:text-2xl">{product.name}</h1><FavoriteButton product={product} /></div>
            {product.brand && <p className="text-sm text-slate-500">Marca: {product.brand}</p>}
            <strong className="font-mono text-3xl text-ink-950">{formatClp(product.price)}</strong>
          </div>
          <p className="m-0 leading-7 text-slate-600">{product.description || "Este producto no tiene una descripción disponible."}</p>
          <div className="grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-4 text-sm">
            <span><strong>Unidad de medida:</strong> {getDisplayUnit(1, product.unitMeasure)}</span>
            <span className={hasStock ? "font-bold text-positive-600" : "font-bold text-critical-600"}>
              {hasStock ? `Stock disponible: ${formatQuantityWithUnit(availableStock, product.unitMeasure)}` : "SIN STOCK"}
            </span>
          </div>
          <div className="w-full max-w-80">
            <ProductPurchaseControls key={product.id} product={product} />
          </div>
          <p className="m-0 text-xs leading-5 text-slate-500">Agregar al carrito no reserva stock. La disponibilidad se vuelve a validar al iniciar el pago.</p>
        </div>
      </section>
    </main>
  );
}
