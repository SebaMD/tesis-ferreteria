import PDFDocument from "pdfkit";
import type { PreparationLabelModel } from "./logisticsLabelModels.js";

const TABLE_LEFT = 48;
const TABLE_WIDTH = 499;

function renderHeader(document: PDFKit.PDFDocument, model: PreparationLabelModel) {
  document
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("FERRETERÍA FYF", { align: "center" })
    .moveDown(0.2)
    .fontSize(15)
    .text("Etiqueta de preparación", { align: "center" })
    .moveDown(0.8);

  document.fontSize(11).text(model.folio);
  document.font("Helvetica").fontSize(9.5).text(`Modalidad: ${model.modality}`);
  document.text(`Fecha: ${model.date}`);
  document.moveDown(0.7);
  document.moveTo(TABLE_LEFT, document.y).lineTo(TABLE_LEFT + TABLE_WIDTH, document.y).strokeColor("#d1d5db").stroke();
  document.moveDown(0.8);
}

function renderTableHeader(document: PDFKit.PDFDocument) {
  const y = document.y;
  document.rect(TABLE_LEFT, y, TABLE_WIDTH, 24).fill("#f3f4f6");
  document.fillColor("#374151").font("Helvetica-Bold").fontSize(9);
  document.text("Producto", TABLE_LEFT + 7, y + 8, { width: 360 });
  document.text("Cantidad", TABLE_LEFT + 375, y + 8, { width: 115, align: "right" });
  document.y = y + 30;
}

function ensureRowSpace(document: PDFKit.PDFDocument, rowHeight: number, model: PreparationLabelModel) {
  if (document.y + rowHeight <= 752) return;
  document.addPage();
  document.x = TABLE_LEFT;
  document.y = 48;
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(`Etiqueta de preparación · ${model.folio}`, TABLE_LEFT, document.y, { width: TABLE_WIDTH });
  document.moveDown(0.6);
  renderTableHeader(document);
}

export function renderPreparationLabelPdf(model: PreparationLabelModel) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 48,
      bufferPages: true,
      info: {
        Title: `Etiqueta de preparación ${model.folio}`,
        Author: "Ferretería FYF",
        Subject: "Preparación de pedido",
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    renderHeader(document, model);
    renderTableHeader(document);

    for (const item of model.items) {
      document.font("Helvetica").fontSize(9.5);
      const productHeight = document.heightOfString(item.productName, { width: 350 });
      const rowHeight = Math.max(30, productHeight + 13);
      ensureRowSpace(document, rowHeight, model);
      const y = document.y;
      document.fillColor("#111827").text(item.productName, TABLE_LEFT + 7, y + 6, { width: 350 });
      document.font("Helvetica-Bold").text(item.quantityLabel, TABLE_LEFT + 375, y + 6, { width: 115, align: "right" });
      document.moveTo(TABLE_LEFT, y + rowHeight).lineTo(TABLE_LEFT + TABLE_WIDTH, y + rowHeight).strokeColor("#e5e7eb").stroke();
      document.y = y + rowHeight;
    }

    const noteY = document.y + 14;
    document.font("Helvetica").fontSize(8.5).fillColor("#6b7280").text(
      "Documento operacional. No contiene datos privados de despacho.",
      TABLE_LEFT,
      noteY,
      { width: TABLE_WIDTH, align: "center" },
    );

    const pages = document.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      document.switchToPage(index);
      document.font("Helvetica").fontSize(8).fillColor("#9ca3af").text(
        `Página ${index + 1} de ${pages.count}`,
        48,
        780,
        { width: TABLE_WIDTH, align: "center", lineBreak: false },
      );
    }
    document.end();
  });
}
