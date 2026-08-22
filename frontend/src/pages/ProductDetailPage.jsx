import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import { formatClp } from "../helpers/formatters.js";
import useCart from "../hooks/useCart.js";
import { getCatalogProductByIdRequest } from "../services/catalog.service.js";

export default function ProductDetailPage() {
  const { id } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCatalogProductByIdRequest(id)
      .then(setProduct)
      .catch((error) => toast.error(getApiError(error, "No se pudo cargar el producto")))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAdd = () => {
    const result = addItem(product, Number(quantity));
    if (result.success) toast.success(`${product.name} agregado al carrito`);
    else toast.error(result.message);
  };

  if (loading) return <main className="min-h-100"><LoadingOverlay active /></main>;

  if (!product) {
    return (
      <main className="mx-auto grid min-h-100 max-w-220 place-items-center px-6 text-center">
        <div><h1>Producto no disponible</h1><Link to="/catalog">Volver al catálogo</Link></div>
      </main>
    );
  }

  const hasStock = Number(product.currentStock || 0) > 0;

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
            <h1 className="mt-2 mb-2 text-3xl font-bold text-ink-950 max-[620px]:text-2xl">{product.name}</h1>
            <strong className="font-mono text-3xl text-ink-950">{formatClp(product.price)}</strong>
          </div>
          <p className="m-0 leading-7 text-slate-600">{product.description || "Este producto no tiene una descripción disponible."}</p>
          <div className="grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-4 text-sm">
            <span><strong>Unidad de medida:</strong> {product.unitMeasure}</span>
            <span className={hasStock ? "font-bold text-positive-600" : "font-bold text-critical-600"}>
              {hasStock ? `Stock disponible: ${product.currentStock} ${product.unitMeasure}` : "SIN STOCK"}
            </span>
          </div>
          <div className="grid max-w-80 grid-cols-[110px_1fr] items-end gap-3 max-[420px]:max-w-none max-[420px]:grid-cols-1">
            <label>
              Cantidad
              <input type="number" min="1" max={product.currentStock} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!hasStock} />
            </label>
            <button type="button" onClick={handleAdd} disabled={!hasStock}>
              <ShoppingCart size={18} /> Agregar al carrito
            </button>
          </div>
          <p className="m-0 text-xs leading-5 text-slate-500">Agregar al carrito no descuenta ni reserva stock. Los pedidos online se habilitarán en una etapa posterior.</p>
        </div>
      </section>
    </main>
  );
}
