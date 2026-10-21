import { formatClp, formatDate } from "./formatters.js";
import { getOnlineOrderStatus } from "./onlineOrders.js";

export function canViewAdministrativeOrder(role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function getAdministrativeOrderSections(model) {
  const buyer = model.buyer;
  const delivery = model.delivery;
  return [
    { title: "Datos generales del pedido y comprador", fields: [
      ["Folio", model.folio], ["Fecha del pedido", formatDate(model.createdAt)],
      ["Estado", getOnlineOrderStatus(model.status).label],
      ["Comprador", `${buyer.name} (${buyer.type === "CLIENT" ? "Cliente registrado" : "Invitado"})`],
      ["RUT", buyer.rut || "No registrado"], ["Correo", buyer.email || "No registrado"],
      ["Teléfono del comprador", buyer.phone || "No registrado"],
    ] },
    { title: "Entrega o retiro", fields: [
      ["Modalidad", delivery.label],
      ...(delivery.type === "DELIVERY" ? [
        ["Destinatario", delivery.recipientName || "No registrado"],
        ["Teléfono de entrega", delivery.phone || "No registrado"],
        ["Dirección", delivery.address || "No registrada"], ["Comuna", delivery.commune || "No registrada"],
        ["Referencia", delivery.reference || "Sin referencia"],
      ] : []),
    ] },
    { title: "Resumen económico", fields: [
      ["Subtotal original", formatClp(model.baseSubtotal)], ["Descuentos", formatClp(model.totalDiscount)],
      ["Despacho", model.deliveryFee == null ? "Sin cargo registrado (histórico)" : formatClp(model.deliveryFee)],
      ...(model.deliveryIsDemo ? [["Tarifa", "DEMO ficticia, no oficial de FYF"]] : []),
      ["Total del pedido", formatClp(model.total)],
    ] },
    { title: "Información de pago Webpay", fields: [
      ["Confirmación de pago", model.paymentConfirmed ? "Pago confirmado" : "No confirmado para registro de venta"],
      ["Fecha de pago registrada", model.paidAt ? formatDate(model.paidAt) : "No registrada"],
      ...(model.paymentConfirmed && model.authorizedPayment ? [
        ["Webpay buy_order", model.authorizedPayment.buyOrder],
        ["Código de autorización", model.authorizedPayment.authorizationCode || "No disponible"],
        ["Monto autorizado", formatClp(model.authorizedPayment.amount)],
        ["Fecha de transacción", model.authorizedPayment.transactionDate ? formatDate(model.authorizedPayment.transactionDate) : "No registrada"],
      ] : []),
    ] },
  ];
}

function promotionText(item) {
  if (!item.promotionType) return null;
  return `Promoción histórica: ${item.promotionName || item.promotionType}${item.promotionType === "PERCENTAGE_DISCOUNT" ? ` (${item.promotionValue}%)` : " (2x1)"}`;
}

export function formatAdministrativeOrderText(model) {
  const [general, delivery, economic, payment] = getAdministrativeOrderSections(model);
  const lines = [`FERRETERÍA FYF - Ficha administrativa ${model.folio}`, model.notice];
  const section = data => lines.push("", data.title, ...data.fields.map(([label, value]) => `${label}: ${value}`));
  section(general);
  section(delivery);
  lines.push("", "Productos comprados");
  for (const item of model.items) {
    lines.push(`${item.productName} | Cantidad: ${item.quantity} ${item.unitMeasure || "unidad"} | Precio unitario: ${formatClp(item.unitPrice)} | Descuento: ${formatClp(item.discountAmount)} | Subtotal: ${formatClp(item.subtotal)}`);
    if (item.promotionType) lines.push(promotionText(item));
  }
  section(economic);
  section(payment);
  return lines.join("\n");
}

export function printAdministrativeOrder(model) {
  const frame = document.createElement("iframe");
  frame.title = "Impresión de ficha administrativa";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const cleanup = () => frame.remove();
  try {
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) throw new Error("No se pudo abrir la impresión");
    printDocument.title = `Ficha administrativa ${model.folio}`;
    const style = printDocument.createElement("style");
    style.textContent = `@page{size:A4;margin:16mm}body{color:#111;background:#fff;font:10pt/1.4 Arial,sans-serif;margin:0}
      h1{font-size:18pt;margin:0}h2{font-size:11pt;margin:14pt 0 6pt;border-bottom:1px solid #bbb;padding-bottom:4pt;break-after:avoid}
      p{margin:4pt 0}.notice{font-size:9pt;border-left:3px solid #555;padding:6pt 8pt;margin:10pt 0}
      dl{display:grid;grid-template-columns:1fr 1fr;gap:6pt 14pt;margin:0}dl>div{break-inside:avoid}
      dt{font-size:8pt;color:#555}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}thead{display:table-header-group}
      th,td{border-bottom:1px solid #ccc;padding:6pt 4pt;text-align:right;vertical-align:top;overflow-wrap:anywhere}
      th{background:#f1f3f5}th:first-child,td:first-child{width:40%;text-align:left}tr{break-inside:avoid}
      .promotion{display:block;font-size:8pt;color:#555;margin-top:3pt}.totals{grid-template-columns:repeat(3,1fr);font-weight:bold}`;
    // Construir solo campos autorizados con textContent, nunca interpolar datos en HTML.
    const node = (tag, text, className) => {
      const element = printDocument.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    };
    const content = node("article");
    content.appendChild(node("h1", "FERRETERÍA FYF"));
    content.appendChild(node("p", `Ficha administrativa ${model.folio}`));
    content.appendChild(node("p", model.notice, "notice"));
    const addSection = (data, totals = false) => {
      const section = node("section");
      section.appendChild(node("h2", data.title));
      const fields = node("dl", undefined, totals ? "totals" : undefined);
      for (const [label, value] of data.fields) {
        const field = node("div");
        field.appendChild(node("dt", label)); field.appendChild(node("dd", value)); fields.appendChild(field);
      }
      section.appendChild(fields); content.appendChild(section);
    };
    const [general, delivery, economic, payment] = getAdministrativeOrderSections(model);
    addSection(general);
    content.appendChild(node("h2", "Productos comprados"));
    const table = node("table"), heading = node("thead"), headerRow = node("tr"), body = node("tbody");
    for (const label of ["Producto", "Cantidad", "Precio unitario", "Descuento", "Subtotal"]) headerRow.appendChild(node("th", label));
    heading.appendChild(headerRow); table.appendChild(heading);
    for (const item of model.items) {
      const row = node("tr"), product = node("td", item.productName);
      if (item.promotionType) product.appendChild(node("span", promotionText(item), "promotion"));
      row.appendChild(product);
      for (const value of [`${item.quantity} ${item.unitMeasure || "unidad"}`, formatClp(item.unitPrice), formatClp(item.discountAmount), formatClp(item.subtotal)]) row.appendChild(node("td", value));
      body.appendChild(row);
    }
    table.appendChild(body); content.appendChild(table);
    addSection(economic, true); addSection(delivery); addSection(payment);
    printDocument.head.appendChild(style);
    printDocument.body.appendChild(content);
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(cleanup, 60_000);
  } catch (error) {
    cleanup();
    throw error;
  }
}
