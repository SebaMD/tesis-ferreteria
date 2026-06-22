import { PAYMENT_METHODS } from "./options.js";

export const MOVEMENT_LABELS = {
  ENTRY: "Entrada",
  EXIT: "Salida por venta",
  ADJUSTMENT: "Ajuste administrativo",
};

export const SALE_STATUS_LABELS = {
  ACTIVE: "Activa",
  CANCELLED: "Cancelada",
};

export function getSaleStatusLabel(status) {
  return SALE_STATUS_LABELS[status] || status;
}

export function getPaymentMethodLabel(value = "") {
  return PAYMENT_METHODS.find((method) => method.value === String(value).toLowerCase())?.label || value;
}
