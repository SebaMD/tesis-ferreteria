const ORDER_STATUS = {
  PENDING_PAYMENT: {
    label: "Pendiente de pago",
    tone: "warning",
    description: "El pago fue iniciado y la reserva se mantiene mientras la sesión siga vigente.",
  },
  PAID: {
    label: "Pago confirmado",
    tone: "success",
    description: "El pago fue confirmado y el pedido espera comenzar su preparación.",
  },
  PAYMENT_FAILED: {
    label: "Pago fallido",
    tone: "critical",
    description: "Webpay no autorizó el pago. Puedes volver al carrito o reintentarlo desde Mis pedidos.",
  },
  CANCELLED: {
    label: "Cancelado",
    tone: "neutral",
    description: "El proceso de pago fue cancelado y la reserva de stock fue liberada.",
  },
  EXPIRED: {
    label: "Reserva expirada",
    tone: "neutral",
    description: "La sesión de pago venció y la reserva de stock fue liberada.",
  },
  PAYMENT_REVIEW: {
    label: "Pago en revisión",
    tone: "warning",
    description: "Webpay autorizó el pago, pero el pedido requiere revisión. No realices un nuevo pago.",
  },
  PREPARING: {
    label: "Preparando pedido",
    tone: "info",
    description: "El equipo de bodega está preparando los productos de tu pedido.",
  },
  READY_FOR_PICKUP: {
    label: "Listo para retirar",
    tone: "success",
    description: "Tu pedido está listo para retirar en la ferretería.",
  },
  READY_FOR_DELIVERY: {
    label: "Listo para despacho",
    tone: "info",
    description: "Tu pedido está preparado y espera salir a reparto.",
  },
  OUT_FOR_DELIVERY: {
    label: "En reparto",
    tone: "info",
    description: "Tu pedido está en reparto hacia la dirección indicada.",
  },
  DELIVERED: {
    label: "Pedido entregado",
    tone: "success",
    description: "El pedido fue entregado correctamente.",
  },
};

const PAYMENT_STATUS = {
  CREATED: { label: "Pago iniciado", tone: "warning" },
  PROCESSING: { label: "Confirmando pago", tone: "warning" },
  AUTHORIZED: { label: "Pago autorizado", tone: "success" },
  FAILED: { label: "Pago rechazado", tone: "critical" },
  CANCELLED: { label: "Pago cancelado", tone: "neutral" },
  EXPIRED: { label: "Pago expirado", tone: "neutral" },
};

const FALLBACK_STATUS = { label: "Estado pendiente", tone: "neutral" };
const OPERATIONAL_ORDER_STATUSES = new Set([
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

export function formatOnlineOrderFolio(id) {
  return `P-${String(id || 0).padStart(6, "0")}`;
}

export function getOnlineOrderStatus(status) {
  return ORDER_STATUS[status] || { ...FALLBACK_STATUS, label: String(status || "Sin estado") };
}

export function getOnlinePaymentStatus(status) {
  return PAYMENT_STATUS[status] || { ...FALLBACK_STATUS, label: String(status || "Sin estado") };
}

export function isOnlineOrderPaid(status) {
  return OPERATIONAL_ORDER_STATUSES.has(status);
}

export function getOnlineOrderDeliveryType(deliveryType) {
  return deliveryType === "DELIVERY"
    ? { label: "Despacho a domicilio", shortLabel: "Despacho" }
    : { label: "Retiro en tienda", shortLabel: "Retiro" };
}

export { getOnlineAvailableStock } from "./productAvailability.js";

export function submitWebpayForm({ token, url }) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Webpay no entregó un token válido");
  }

  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    throw new Error("Webpay no entregó una URL válida");
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error("La URL de Webpay no utiliza un protocolo permitido");
  }

  const form = document.createElement("form");
  const tokenInput = document.createElement("input");

  form.method = "POST";
  form.action = targetUrl.toString();
  form.acceptCharset = "UTF-8";
  form.hidden = true;

  tokenInput.type = "hidden";
  tokenInput.name = "token_ws";
  tokenInput.value = token.trim();

  form.appendChild(tokenInput);
  document.body.appendChild(form);
  form.submit();
}

export const redirectToWebpay = submitWebpayForm;
