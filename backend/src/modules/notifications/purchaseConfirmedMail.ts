import {
  formatOrderDate,
  formatOrderMoney,
  formatOrderQuantity,
  type OrderCommercialModel,
} from "../onlineOrders/orderCommercialModel.js";

export type RenderedMailContent = {
  subject: string;
  text: string;
  html: string;
};

export function escapeMailHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deliveryAddress(model: OrderCommercialModel) {
  return [model.delivery.address, model.delivery.commune].filter(Boolean).join(", ");
}

export function renderPurchaseConfirmedMail(
  model: OrderCommercialModel,
  trackingUrl?: string,
): RenderedMailContent {
  const safeTrackingUrl = trackingUrl ? escapeMailHtml(trackingUrl) : "";
  const textItems = model.items.map((item) => (
    `- ${item.productName}: ${formatOrderQuantity(item.quantity, item.unitMeasure)} · `
      + `${formatOrderMoney(item.unitPrice)} c/u · ${formatOrderMoney(item.subtotal)}`
  )).join("\n");
  const address = model.delivery.type === "DELIVERY" ? deliveryAddress(model) : "";
  const recipient = model.delivery.type === "DELIVERY"
    ? model.delivery.recipientName || model.buyer.name
    : "";
  const trackingText = trackingUrl
    ? `\nSeguimiento seguro: ${trackingUrl}`
    : "\nPuedes revisar el estado en Mis compras.";

  const text = [
    `Hola ${model.buyer.name}:`,
    "",
    "Gracias por tu compra en Ferretería FYF.",
    `Folio: ${model.folio}`,
    `Fecha: ${formatOrderDate(model.purchaseDate)}`,
    "",
    "Productos:",
    textItems,
    "",
    `Total: ${formatOrderMoney(model.total)}`,
    `Modalidad: ${model.delivery.label}`,
    ...(recipient ? [`Destinatario: ${recipient}`] : []),
    ...(address ? [`Dirección de entrega: ${address}`] : []),
    "",
    "Te enviaremos correos cuando cambie el estado de tu pedido.",
    trackingText.trimStart(),
    "",
    "Este es un comprobante de compra; no corresponde a una boleta, factura ni documento tributario.",
  ].join("\n");

  const itemRows = model.items.map((item) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeMailHtml(item.productName)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;white-space:nowrap;">${escapeMailHtml(formatOrderQuantity(item.quantity, item.unitMeasure))}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;white-space:nowrap;">${escapeMailHtml(formatOrderMoney(item.unitPrice))}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;white-space:nowrap;font-weight:700;">${escapeMailHtml(formatOrderMoney(item.subtotal))}</td>
    </tr>`).join("");
  const trackingAction = trackingUrl
    ? `<p style="margin:22px 0 0;text-align:center;"><a href="${safeTrackingUrl}" style="display:inline-block;padding:11px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:5px;font-weight:700;">${model.buyer.type === "GUEST" ? "Ver seguimiento seguro" : "Ver mis compras"}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4f6;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr><td style="padding:26px 28px 14px;text-align:center;">
            <div style="font-size:20px;font-weight:800;letter-spacing:.02em;">FERRETERÍA FYF</div>
            <div style="margin-top:5px;color:#6b7280;font-size:13px;">Comprobante de compra</div>
          </td></tr>
          <tr><td style="padding:10px 28px 24px;">
            <p style="margin:0 0 12px;font-size:16px;">Hola ${escapeMailHtml(model.buyer.name)}:</p>
            <p style="margin:0 0 8px;font-size:15px;line-height:1.55;"><strong>Gracias por tu compra.</strong> Confirmamos el pago de tu pedido.</p>
            <p style="margin:0 0 22px;color:#4b5563;font-size:14px;line-height:1.55;">Te enviaremos correos cuando cambie el estado de tu pedido.</p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-bottom:18px;background:#f9fafb;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:12px;color:#6b7280;font-size:12px;"><strong>Folio</strong><br><span style="color:#111827;font-size:14px;">${escapeMailHtml(model.folio)}</span></td>
                <td style="padding:12px;color:#6b7280;font-size:12px;"><strong>Fecha</strong><br><span style="color:#111827;font-size:14px;">${escapeMailHtml(formatOrderDate(model.purchaseDate))}</span></td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="background:#f3f4f6;">
                <th align="left" style="padding:9px 8px;color:#374151;">Producto</th>
                <th align="right" style="padding:9px 8px;color:#374151;">Cantidad</th>
                <th align="right" style="padding:9px 8px;color:#374151;">Precio</th>
                <th align="right" style="padding:9px 8px;color:#374151;">Subtotal</th>
              </tr></thead>
              <tbody>${itemRows}</tbody>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-top:16px;">
              <tr><td style="padding:5px 0;color:#4b5563;font-size:14px;">Modalidad</td><td align="right" style="padding:5px 0;font-size:14px;font-weight:700;">${escapeMailHtml(model.delivery.label)}</td></tr>
              ${recipient ? `<tr><td style="padding:5px 0;color:#4b5563;font-size:14px;vertical-align:top;">Destinatario</td><td align="right" style="padding:5px 0;font-size:14px;">${escapeMailHtml(recipient)}</td></tr>` : ""}
              ${address ? `<tr><td style="padding:5px 0;color:#4b5563;font-size:14px;vertical-align:top;">Dirección</td><td align="right" style="padding:5px 0;font-size:14px;">${escapeMailHtml(address)}</td></tr>` : ""}
              <tr><td style="padding:14px 0 5px;border-top:2px solid #111827;font-size:16px;font-weight:700;">TOTAL</td><td align="right" style="padding:14px 0 5px;border-top:2px solid #111827;font-size:20px;font-weight:800;">${escapeMailHtml(formatOrderMoney(model.total))}</td></tr>
            </table>

            ${trackingAction}
          </td></tr>
          <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:1.5;text-align:center;">
            Este documento es un comprobante de compra y no corresponde a una boleta, factura ni documento tributario.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: `Compra confirmada · Ferretería FYF · ${model.folio}`,
    text,
    html,
  };
}
