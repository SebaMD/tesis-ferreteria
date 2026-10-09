import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../../api/httpClient.js";
import { downloadPdf } from "../../helpers/receiptDownload.js";

export default function DownloadLogisticsLabelButton({ order, requestLabel }) {
  const [downloading, setDownloading] = useState(false);
  const documentName = "etiqueta de preparación";

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPdf(
        () => requestLabel(order),
        `etiqueta-preparacion-${order.folio}.pdf`,
      );
      toast.success(`${documentName[0].toUpperCase()}${documentName.slice(1)} descargada`);
    } catch (error) {
      toast.error(getApiError(error, `No se pudo descargar la ${documentName}`));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
      type="button"
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
      {downloading ? "Descargando..." : "Etiqueta de preparación"}
    </button>
  );
}
