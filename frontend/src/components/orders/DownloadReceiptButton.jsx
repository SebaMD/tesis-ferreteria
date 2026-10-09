import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../../api/httpClient.js";
import { formatOnlineOrderFolio, isOnlineOrderPaid } from "../../helpers/onlineOrders.js";
import { downloadReceipt } from "../../helpers/receiptDownload.js";

export default function DownloadReceiptButton({
  order,
  requestReceipt,
  className = "border-slate-300 bg-white text-ink-700 hover:bg-slate-100",
}) {
  const [downloading, setDownloading] = useState(false);
  if (!isOnlineOrderPaid(order?.status) || typeof requestReceipt !== "function") return null;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadReceipt(
        () => requestReceipt(order),
        formatOnlineOrderFolio(order.id),
      );
      toast.success("Comprobante descargado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo descargar el comprobante"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      className={className}
      type="button"
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
      {downloading ? "Descargando..." : "Descargar comprobante"}
    </button>
  );
}
