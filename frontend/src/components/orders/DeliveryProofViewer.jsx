import { Camera, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../../api/httpClient.js";

export default function DeliveryProofViewer({ order, requestProof }) {
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  if (
    !order
    || order.deliveryType !== "DELIVERY"
    || order.status !== "DELIVERED"
    || !order.proofAvailable
    || typeof requestProof !== "function"
  ) return null;

  const loadProof = async () => {
    if (loading || imageUrl) return;
    setLoading(true);
    try {
      const response = await requestProof(order);
      const nextUrl = URL.createObjectURL(response.data ?? response);
      setImageUrl(nextUrl);
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cargar la evidencia de entrega"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-bold text-ink-950">Evidencia de entrega</h3>
          <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Fotografía registrada al confirmar la entrega de este pedido.</p>
        </div>
        {!imageUrl && (
          <button
            className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
            type="button"
            onClick={loadProof}
            disabled={loading}
          >
            {loading ? <RefreshCw className="animate-spin" size={17} /> : <Camera size={17} />}
            {loading ? "Cargando..." : "Ver evidencia"}
          </button>
        )}
      </div>
      {imageUrl && (
        <img
          className="max-h-110 w-full rounded-md border border-slate-200 bg-slate-50 object-contain"
          src={imageUrl}
          alt="Evidencia fotográfica de la entrega"
        />
      )}
    </section>
  );
}
