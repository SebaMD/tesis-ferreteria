import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../../api/httpClient.js";
import { formatSaleFolio } from "../../helpers/formatters.js";
import { downloadPdf } from "../../helpers/receiptDownload.js";
import { getSaleSummaryPdfRequest } from "../../services/sales.service.js";

export default function DownloadSaleSummaryButton({ saleId }) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPdf(() => getSaleSummaryPdfRequest(saleId), `resumen-venta-${formatSaleFolio(saleId)}.pdf`);
      toast.success("Resumen de venta descargado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo descargar el resumen de venta"));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={download} disabled={downloading}>
      {downloading ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
      {downloading ? "Descargando..." : "Descargar resumen de venta (PDF)"}
    </button>
  );
}
