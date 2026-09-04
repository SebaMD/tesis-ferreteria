import PDFDocument from "pdfkit";
import type { DispatchLabelModel } from "./logisticsLabelModels.js";

function labelRow(document: PDFKit.PDFDocument, label: string, value: string) {
  document.font("Helvetica-Bold").fontSize(9).fillColor("#374151").text(label, 54, document.y, { width: 487 });
  document.font("Helvetica").fontSize(12).fillColor("#111827").text(value, 54, document.y, { width: 487 });
  document.moveDown(0.65);
}

export function renderDispatchLabelPdf(model: DispatchLabelModel) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 54,
      info: {
        Title: `Etiqueta de despacho ${model.folio}`,
        Author: "Ferretería FYF",
        Subject: "Despacho de pedido",
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("FERRETERÍA FYF", { align: "center" })
      .moveDown(0.2)
      .fontSize(15)
      .text("Etiqueta de despacho", { align: "center" })
      .moveDown(0.9);

    document.rect(54, document.y, 487, 62).fill("#f3f4f6");
    const folioY = document.y + 14;
    document.fillColor("#111827").font("Helvetica-Bold").fontSize(17).text(model.folio, 68, folioY, { width: 220 });
    document.font("Helvetica").fontSize(9.5).text(model.modality, 300, folioY + 4, { width: 225, align: "right" });
    document.text(model.date, 300, folioY + 21, { width: 225, align: "right" });
    document.y = folioY + 72;

    labelRow(document, "Destinatario", model.recipientName);
    labelRow(document, "Teléfono", model.phone);
    labelRow(document, "Dirección", model.address);
    labelRow(document, "Comuna", model.commune);
    if (model.reference) labelRow(document, "Referencia / indicaciones", model.reference);

    document.moveDown(1.2);
    document.moveTo(54, document.y).lineTo(541, document.y).strokeColor("#d1d5db").stroke();
    const noteY = document.y + 12;
    document.font("Helvetica").fontSize(8.5).fillColor("#6b7280").text(
      "Documento operacional de entrega. No contiene información de pago ni credenciales.",
      54,
      noteY,
      { width: 487, align: "center" },
    );
    document.end();
  });
}
