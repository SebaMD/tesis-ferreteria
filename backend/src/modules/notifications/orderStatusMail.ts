import {
  formatOrderQuantity,
  type OrderCommercialModel,
} from "../onlineOrders/orderCommercialModel.js";
import type { ClientOrderMailEvent, MailContent } from "./notifications.service.js";
import { escapeMailHtml } from "./purchaseConfirmedMail.js";

type StatusPresentation = { label: string; summary: string };

function presentation(event: ClientOrderMailEvent, model?: OrderCommercialModel): StatusPresentation {
  const pickup = model?.delivery.type === "PICKUP";
  const values: Record<Exclude<ClientOrderMailEvent, "PURCHASE_CONFIRMED">, StatusPresentation> = {
    PREPARATION_STARTED: {
      label: "En preparación",
      summary: "Comenzamos a preparar los productos de tu pedido.",
    },
    READY_FOR_PICKUP: {
      label: "Listo para retirar",
      summary: "Tu pedido está preparado y disponible para retiro en Ferretería FYF.",
    },
    OUT_FOR_DELIVERY: {
      label: "En reparto",
      summary: "Tu pedido salió a reparto hacia la dirección registrada.",
    },
    DELIVERED: {
      label: pickup ? "Pedido retirado" : "Pedido entregado",
      summary: pickup
        ? "El retiro de tu pedido fue completado. Gracias por comprar en Ferretería FYF."
        : "La entrega de tu pedido fue completada. Gracias por comprar en Ferretería FYF.",
    },
  };
  return values[event as keyof typeof values] || {
    label: "Actualización del pedido",
    summary: "El estado de tu pedido fue actualizado.",
  };
}

export function renderOrderStatusMail(input: {
  folio: string;
  event: ClientOrderMailEvent;
  trackingUrl?: string;
  recipientType: "CLIENT" | "GUEST";
  model?: OrderCommercialModel;
}): MailContent {
  const status = presentation(input.event, input.model);
  const modality = input.model?.delivery.label || "Pedido online";
  const buyerName = input.model?.buyer.name || "cliente";
  const safeUrl = input.trackingUrl ? escapeMailHtml(input.trackingUrl) : "";
  const itemSummary = input.model?.items.slice(0, 3).map((item) => (
    `${item.productName} (${formatOrderQuantity(item.quantity, item.unitMeasure)})`
  )) || [];
  const remainingItems = Math.max(0, (input.model?.items.length || 0) - itemSummary.length);
  const trackingText = input.trackingUrl
    ? `Revisa tu pedido: ${input.trackingUrl}`
    : input.recipientType === "GUEST"
      ? "Conserva tu enlace seguro de seguimiento para revisar el pedido."
      : "Puedes revisar el detalle en Mis compras.";

  const text = [
    "Ferretería FYF",
    "",
    `Hola ${buyerName}:`,
    status.summary,
    "",
    `Folio: ${input.folio}`,
    `Estado: ${status.label}`,
    `Modalidad: ${modality}`,
    ...(itemSummary.length ? ["Productos:", ...itemSummary.map((item) => `- ${item}`)] : []),
    ...(remainingItems ? [`- y ${remainingItems} producto${remainingItems === 1 ? "" : "s"} más`] : []),
    "",
    trackingText,
  ].join("\n");

  const productRows = itemSummary.map((item) => `<tr><td style="padding:7px 0;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;">${escapeMailHtml(item)}</td></tr>`).join("");
  const moreRow = remainingItems
    ? `<tr><td style="padding:7px 0;color:#64748b;font-size:12px;">y ${remainingItems} producto${remainingItems === 1 ? "" : "s"} más</td></tr>`
    : "";
  const action = input.trackingUrl
    ? `<p style="margin:22px 0 0;text-align:center;"><a href="${safeUrl}" style="display:inline-block;padding:11px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:5px;font-weight:700;">${input.recipientType === "GUEST" ? "Ver seguimiento seguro" : "Ver mis compras"}</a></p>`
    : "";

  return {
    subject: `${status.label} · Ferretería FYF · ${input.folio}`,
    text,
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4f6;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="width:100%;max-width:580px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr><td style="padding:20px 24px;background:#9a3412;color:#ffffff;font-size:19px;font-weight:800;">FERRETERÍA FYF</td></tr>
          <tr><td style="padding:26px 24px;">
            <p style="margin:0 0 8px;color:#b45309;font-size:12px;font-weight:800;text-transform:uppercase;">Actualización de tu compra</p>
            <h1 style="margin:0 0 12px;font-size:22px;">${escapeMailHtml(status.label)}</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">Hola ${escapeMailHtml(buyerName)}. ${escapeMailHtml(status.summary)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;">
              <tr><td style="padding:12px;color:#6b7280;font-size:12px;"><strong>Folio</strong><br><span style="color:#111827;font-size:14px;font-weight:700;">${escapeMailHtml(input.folio)}</span></td><td style="padding:12px;color:#6b7280;font-size:12px;"><strong>Modalidad</strong><br><span style="color:#111827;font-size:14px;font-weight:700;">${escapeMailHtml(modality)}</span></td></tr>
            </table>
            ${itemSummary.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-top:16px;"><tr><td style="padding:0 0 6px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;">Resumen del pedido</td></tr>${productRows}${moreRow}</table>` : ""}
            ${action}
          </td></tr>
          <tr><td style="padding:15px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:1.5;text-align:center;">Este correo informa un cambio real del estado de tu pedido. Revisa el enlace para consultar su detalle.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
