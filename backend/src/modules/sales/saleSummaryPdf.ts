import PDFDocument from "pdfkit";
import type { getSaleByIdService } from "./sales.service.js";
import { formatOrderDate, formatOrderMoney } from "../onlineOrders/orderCommercialModel.js";
import { INTERNAL_DOCUMENT_NOTICE } from "../../utils/internalDocuments.js";

type SaleSummarySource = Awaited<ReturnType<typeof getSaleByIdService>>;
const SALE_STATES: Record<string, string> = { ACTIVE: "Activa", PARTIALLY_RETURNED: "Devuelta parcialmente", CANCELLED: "Cancelada" };
const RETURN_STATES: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", REVERSED: "Revertida" };
const PAYMENT_METHODS: Record<string, string> = { efectivo: "Efectivo", debito: "Débito", credito: "Crédito", transferencia: "Transferencia" };

export function buildSaleSummaryModel(sale: SaleSummarySource) {
  return {
    folio: `V-${String(sale.id).padStart(6, "0")}`,
    date: sale.date,
    paymentMethod: PAYMENT_METHODS[sale.paymentMethod] ?? sale.paymentMethod,
    status: SALE_STATES[sale.status] ?? sale.status,
    // Los importes provienen de la consulta comercial existente, no del historial de solicitudes.
    total: sale.total,
    returnedTotal: sale.returnedTotal,
    netTotal: sale.netTotal,
    items: sale.details.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      returnedQuantity: item.returnedQuantity,
      remainingQuantity: item.quantity - item.returnedQuantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    returns: sale.cancellationRequests.map((request) => ({
      id: request.id,
      status: RETURN_STATES[request.status] ?? request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reversedAt: request.reversedAt,
      reason: request.reason,
      response: request.adminResponse,
      items: request.details.map((item) => ({ productName: item.productName, quantity: item.requestedQuantity })),
    })),
    notice: INTERNAL_DOCUMENT_NOTICE,
  };
}

export function renderSaleSummaryPdf(model: ReturnType<typeof buildSaleSummaryModel>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true,
      info: { Title: `Resumen de venta ${model.folio}`, Author: "Ferretería FYF" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const width = 495;
    const ensureSpace = (height: number) => { if (doc.y + height > 735) doc.addPage(); };
    const paragraph = (text: string, bold = false, size = 9) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#111827");
      ensureSpace(doc.heightOfString(text, { width }) + 8);
      doc.text(text, 50, doc.y, { width }).moveDown(0.5);
    };
    paragraph("FERRETERÍA FYF", true, 16);
    paragraph(`Resumen de venta ${model.folio}`, true, 14);
    paragraph(model.notice);
    paragraph(`Fecha de compra: ${formatOrderDate(model.date)}`);
    paragraph(`Método de pago: ${model.paymentMethod}   |   Estado: ${model.status}`);
    paragraph("Productos vendidos", true, 11);
    const columns = [165, 44, 48, 54, 80, 104];
    const row = (values: string[], heading = false) => {
      doc.font(heading ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      const height = Math.max(30, ...values.map((text, i) => doc.heightOfString(text, { width: columns[i] - 8 }) + 12));
      if (doc.y + height > 735) { doc.addPage(); if (!heading) tableHeading(); }
      const top = doc.y;
      if (heading) doc.rect(50, top, width, height).fill("#f1f5f9");
      let left = 50;
      values.forEach((text, i) => {
        doc.fillColor("#111827").font(heading ? "Helvetica-Bold" : "Helvetica").fontSize(8)
          .text(text, left + 4, top + 6, { width: columns[i] - 8, align: i ? "right" : "left" });
        left += columns[i];
      });
      doc.moveTo(50, top + height).lineTo(545, top + height).strokeColor("#cbd5e1").stroke();
      doc.x = 50;
      doc.y = top + height;
    };
    const tableHeading = () => row(["Producto", "Vendidas", "Devueltas", "No devueltas", "Precio unitario", "Subtotal original"], true);
    tableHeading();
    for (const item of model.items) row([item.productName, String(item.quantity), String(item.returnedQuantity),
      String(item.remainingQuantity), formatOrderMoney(item.unitPrice), formatOrderMoney(item.subtotal)]);
    doc.moveDown();
    paragraph(`Total original: ${formatOrderMoney(model.total)}`, true);
    paragraph(`Total devuelto: ${formatOrderMoney(model.returnedTotal)}`, true);
    paragraph(`Total neto: ${formatOrderMoney(model.netTotal)}`, true);
    paragraph("Las cantidades no devueltas son informativas y no constituyen autorización legal ni comercial para una devolución.");
    paragraph("Historial de devoluciones", true, 11);
    if (!model.returns.length) paragraph("Sin solicitudes ni devoluciones registradas.");
    for (const request of model.returns) {
      ensureSpace(75);
      paragraph(`Solicitud #${request.id} - ${request.status}`, true);
      paragraph(`Solicitud: ${formatOrderDate(request.requestedAt)}`);
      if (request.reviewedAt) paragraph(`Revisión: ${formatOrderDate(request.reviewedAt)}`);
      if (request.reversedAt) paragraph(`Reversión: ${formatOrderDate(request.reversedAt)}`);
      paragraph(`Motivo: ${request.reason}`);
      if (request.response) paragraph(`Respuesta: ${request.response}`);
      for (const item of request.items) paragraph(`${item.productName}: ${item.quantity} unidad(es) solicitada(s)`);
    }
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#64748b")
        .text(`${model.folio} - Página ${i + 1} de ${pages.count}`, 50, 780, { width, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
