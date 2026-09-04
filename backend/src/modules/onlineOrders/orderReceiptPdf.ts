import PDFDocument from "pdfkit";
import {
  formatOrderDate,
  formatOrderMoney,
  formatOrderQuantity,
  type OrderCommercialModel,
} from "./orderCommercialModel.js";

function renderTitle(document: PDFKit.PDFDocument, model: OrderCommercialModel) {
  document
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(19)
    .text("FERRETERÍA FYF", { align: "center" })
    .moveDown(0.25)
    .fontSize(15)
    .text("Comprobante de compra", { align: "center" })
    .moveDown(0.8);

  const metadataTop = document.y;
  document.font("Helvetica-Bold").fontSize(9).text("Folio", 50, metadataTop);
  document.font("Helvetica").fontSize(10).text(model.folio, 50, metadataTop + 14);
  document.font("Helvetica-Bold").fontSize(9).text("Fecha", 300, metadataTop);
  document.font("Helvetica").fontSize(10).text(formatOrderDate(model.purchaseDate), 300, metadataTop + 14, { width: 245 });
  document.x = 50;
  document.y = metadataTop + 46;
  document.moveTo(50, document.y).lineTo(545, document.y).strokeColor("#d1d5db").stroke();
  document.moveDown(1);
}

function renderBuyer(document: PDFKit.PDFDocument, model: OrderCommercialModel) {
  document.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Comprador");
  document.font("Helvetica").fontSize(10).text(model.buyer.name);
  if (model.delivery.type === "DELIVERY") {
    document.moveDown(0.35).font("Helvetica-Bold").text("Destinatario");
    document.font("Helvetica").text(model.delivery.recipientName || model.buyer.name);
  }
  document.moveDown(0.8);

  document.font("Helvetica-Bold").text("Modalidad");
  document.font("Helvetica").text(model.delivery.label);
  if (model.delivery.type === "DELIVERY") {
    const address = [model.delivery.address, model.delivery.commune].filter(Boolean).join(", ");
    document.moveDown(0.35).font("Helvetica-Bold").text("Dirección de entrega");
    document.font("Helvetica").text(address || "Dirección registrada en el pedido");
  }
  document.moveDown(1);
}

const TABLE = {
  left: 50,
  product: 225,
  quantity: 80,
  unitPrice: 95,
  subtotal: 95,
};

function renderTableHeader(document: PDFKit.PDFDocument) {
  const y = document.y;
  document.rect(TABLE.left, y, 495, 24).fill("#f3f4f6");
  document.fillColor("#374151").font("Helvetica-Bold").fontSize(8.5);
  document.text("Producto", TABLE.left + 6, y + 8, { width: TABLE.product - 12 });
  document.text("Cantidad", TABLE.left + TABLE.product, y + 8, { width: TABLE.quantity - 6, align: "right" });
  document.text("Precio unitario", TABLE.left + TABLE.product + TABLE.quantity, y + 8, { width: TABLE.unitPrice - 6, align: "right" });
  document.text("Subtotal", TABLE.left + TABLE.product + TABLE.quantity + TABLE.unitPrice, y + 8, { width: TABLE.subtotal - 6, align: "right" });
  document.y = y + 30;
}

function ensureTableSpace(document: PDFKit.PDFDocument, rowHeight: number, model: OrderCommercialModel) {
  if (document.y + rowHeight <= 750) return;
  document.addPage();
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(`Comprobante ${model.folio}`);
  document.moveDown(0.6);
  renderTableHeader(document);
}

function renderItems(document: PDFKit.PDFDocument, model: OrderCommercialModel) {
  renderTableHeader(document);
  for (const item of model.items) {
    document.font("Helvetica").fontSize(9);
    const productHeight = document.heightOfString(item.productName, { width: TABLE.product - 12 });
    const rowHeight = Math.max(28, productHeight + 12);
    ensureTableSpace(document, rowHeight, model);
    const y = document.y;
    document.fillColor("#111827").text(item.productName, TABLE.left + 6, y + 6, { width: TABLE.product - 12 });
    document.text(formatOrderQuantity(item.quantity, item.unitMeasure), TABLE.left + TABLE.product, y + 6, { width: TABLE.quantity - 6, align: "right" });
    document.text(formatOrderMoney(item.unitPrice), TABLE.left + TABLE.product + TABLE.quantity, y + 6, { width: TABLE.unitPrice - 6, align: "right" });
    document.font("Helvetica-Bold").text(formatOrderMoney(item.subtotal), TABLE.left + TABLE.product + TABLE.quantity + TABLE.unitPrice, y + 6, { width: TABLE.subtotal - 6, align: "right" });
    document.moveTo(TABLE.left, y + rowHeight).lineTo(545, y + rowHeight).strokeColor("#e5e7eb").stroke();
    document.y = y + rowHeight;
  }
}

function renderTotal(document: PDFKit.PDFDocument, model: OrderCommercialModel) {
  if (document.y > 710) document.addPage();
  document.moveDown(1);
  const totalY = document.y;
  document.font("Helvetica-Bold").fontSize(11).fillColor("#374151").text("Total", 355, totalY, { width: 80, align: "right" });
  document.fontSize(15).fillColor("#111827").text(formatOrderMoney(model.total), 435, totalY - 1, { width: 110, align: "right" });
  document.moveDown(2);
  document.font("Helvetica").fontSize(10).fillColor("#4b5563").text("Gracias por tu compra.", 50, document.y, { width: 495, align: "center" });
  document.moveDown(0.4).fontSize(8.5).fillColor("#6b7280").text(
    "Este documento es un comprobante de compra y no corresponde a una boleta, factura ni documento tributario.",
    50,
    document.y,
    { width: 495, align: "center" },
  );
}

export function renderOrderReceiptPdf(model: OrderCommercialModel) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 50, bufferPages: true, info: {
      Title: `Comprobante de compra ${model.folio}`,
      Author: "Ferretería FYF",
      Subject: "Comprobante de compra",
    } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    renderTitle(document, model);
    renderBuyer(document, model);
    renderItems(document, model);
    renderTotal(document, model);

    const pages = document.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      document.switchToPage(index);
      document.font("Helvetica").fontSize(8).fillColor("#9ca3af").text(
        `Página ${index + 1} de ${pages.count}`,
        50,
        780,
        { width: 495, align: "center", lineBreak: false },
      );
    }
    document.end();
  });
}
