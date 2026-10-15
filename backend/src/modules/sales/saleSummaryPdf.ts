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
    const totals = [
      `Total original: ${formatOrderMoney(model.total)}`,
      `Total devuelto: ${formatOrderMoney(model.returnedTotal)}`,
      `Total neto: ${formatOrderMoney(model.netTotal)}`,
    ].map((text) => {
      let size = 9.5;
      doc.font("Helvetica-Bold").fontSize(size);
      while (doc.widthOfString(text) > width / 3 - 18 && size > 8) {
        size -= 0.5;
        doc.fontSize(size);
      }
      return { text, size, height: doc.heightOfString(text, { width: width / 3 - 18 }) };
    });
    const totalsHeight = Math.max(20, ...totals.map((total) => total.height)) + 16;
    ensureSpace(totalsHeight);
    const totalsTop = doc.y;
    totals.forEach((total, index) => {
      doc.font("Helvetica-Bold").fontSize(total.size).fillColor("#111827")
        .text(total.text, 50 + index * width / 3 + 9, totalsTop + 8, { width: width / 3 - 18, align: "center" });
    });
    for (const index of [1, 2]) doc.moveTo(50 + index * width / 3, totalsTop + 4)
      .lineTo(50 + index * width / 3, totalsTop + totalsHeight - 4).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
    doc.x = 50;
    doc.y = totalsTop + totalsHeight + 8;
    paragraph("Las cantidades no devueltas son informativas y no constituyen autorización legal ni comercial para una devolución.");
    ensureSpace(model.returns.length ? 110 : 65);
    doc.moveTo(50, doc.y + 8).lineTo(545, doc.y + 8).lineWidth(0.6).strokeColor("#cbd5e1").stroke();
    doc.y += 20;
    paragraph("Historial de devoluciones", true, 11);
    if (!model.returns.length) paragraph("Sin solicitudes ni devoluciones registradas.");
    const wrapCardText = (text: string) => {
      doc.font("Helvetica").fontSize(9);
      const lines: string[] = [];
      for (const originalLine of text.split(/\r?\n/)) {
        let line = "";
        for (const word of originalLine.split(/\s+/).filter(Boolean)) {
          if (doc.widthOfString(word) > width - 24) {
            if (line) { lines.push(line); line = ""; }
            for (const character of Array.from(word)) {
              if (line && doc.widthOfString(line + character) > width - 24) { lines.push(line); line = ""; }
              line += character;
            }
          } else if (line && doc.widthOfString(`${line} ${word}`) > width - 24) {
            lines.push(line); line = word;
          } else line = line ? `${line} ${word}` : word;
        }
        lines.push(line);
      }
      return lines;
    };
    for (const [requestIndex, request] of model.returns.entries()) {
      const fields = [`Solicitud: ${formatOrderDate(request.requestedAt)}`];
      if (request.reviewedAt) fields.push(`Revisión: ${formatOrderDate(request.reviewedAt)}`);
      if (request.reversedAt) fields.push(`Reversión: ${formatOrderDate(request.reversedAt)}`);
      fields.push(`Motivo: ${request.reason}`);
      if (request.response) fields.push(`Respuesta: ${request.response}`);
      for (const item of request.items) fields.push(`${item.productName}: ${item.quantity} unidad(es) solicitada(s)`);
      const lines = fields.flatMap((field) => {
        const wrapped = wrapCardText(field);
        return wrapped.map((text, index) => ({ text, height: index === wrapped.length - 1 ? 16 : 12 }));
      });
      const wholeHeight = 44 + lines.reduce((sum, line) => sum + line.height, 0);
      // Mantener tarjetas cortas juntas; las extensas se dividen con encabezado de continuación.
      if (requestIndex > 0 && wholeHeight <= 685 && doc.y + wholeHeight > 735) doc.addPage();
      let offset = 0;
      while (offset < lines.length) {
        if (doc.y + 60 > 735) doc.addPage();
        const top = doc.y;
        let end = offset, bodyHeight = 0;
        while (end < lines.length && top + 44 + bodyHeight + lines[end].height <= 735) {
          bodyHeight += lines[end].height;
          end++;
        }
        const height = 44 + bodyHeight;
        doc.rect(50, top, width, height).lineWidth(0.6).strokeColor("#cbd5e1").stroke();
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827")
          .text(`Solicitud #${request.id} - ${request.status}${offset ? " (continuación)" : ""}`, 62, top + 12, { width: width - 24, lineBreak: false });
        let y = top + 32;
        doc.font("Helvetica").fontSize(9);
        for (let index = offset; index < end; index++) {
          doc.text(lines[index].text, 62, y, { width: width - 24, lineBreak: false });
          y += lines[index].height;
        }
        doc.x = 50;
        doc.y = top + height + 12;
        offset = end;
        if (offset < lines.length) doc.addPage();
      }
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
