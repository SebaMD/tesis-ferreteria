import { isValidRut, normalizeName, normalizeRut } from "../auth/auth.validation.js";
import { normalizePhone } from "../users/users.validation.js";
import {
  canonicalizeDeliveryCommune,
  DELIVERY_COMMUNE,
  validateCoordinatePair,
} from "../../utils/delivery.js";

export type SaleDetailInput = {
  productId: number;
  quantity: number;
};

export type SaleBody = {
  paymentMethod: string;
  details: SaleDetailInput[];
  deliveryType: "IMMEDIATE" | "DELIVERY";
  delivery: {
    recipientName: string;
    recipientRut: string;
    phone: string;
    address: string;
    commune: string;
    reference: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

export type CancellationRequestBody = {
  reason: string;
  details: SaleDetailInput[];
};

export type CancellationReviewBody = {
  adminResponse: string;
};

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function int(value: unknown, field: string): { success: true; value: number } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return { success: false, error: `${field} debe ser un numero entero valido` };
  return { success: true, value: number };
}

export function validateCreateSaleBody(body: unknown): ValidationResult<SaleBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { success: false, error: "Debe enviar datos validos" };

  const input = body as Record<string, unknown>;
  const allowed = [
    "paymentMethod",
    "details",
    "deliveryType",
    "deliveryRecipientName",
    "deliveryRecipientRut",
    "deliveryPhone",
    "deliveryAddress",
    "deliveryCommune",
    "deliveryReference",
    "deliveryLatitude",
    "deliveryLongitude",
  ];

  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) return { success: false, error: `El campo ${field} no esta permitido` };
  }

  if (typeof input.paymentMethod !== "string" || input.paymentMethod.trim().length < 2) {
    return { success: false, error: "El metodo de pago es obligatorio" };
  }

  if (!Array.isArray(input.details) || input.details.length < 1) {
    return { success: false, error: "Debe agregar al menos 1 detalle de venta" };
  }

  const deliveryType = input.deliveryType === undefined
    ? "IMMEDIATE"
    : input.deliveryType;
  if (deliveryType !== "IMMEDIATE" && deliveryType !== "DELIVERY") {
    return { success: false, error: "El tipo de entrega no es valido" };
  }

  let delivery: SaleBody["delivery"] = null;
  if (deliveryType === "DELIVERY") {
    const recipientName = typeof input.deliveryRecipientName === "string"
      ? normalizeName(input.deliveryRecipientName)
      : "";
    const recipientRut = typeof input.deliveryRecipientRut === "string"
      ? normalizeRut(input.deliveryRecipientRut)
      : "";
    const phone = typeof input.deliveryPhone === "string"
      ? normalizePhone(input.deliveryPhone)
      : null;
    const address = typeof input.deliveryAddress === "string"
      ? input.deliveryAddress.trim().replace(/\s+/g, " ")
      : "";
    const commune = canonicalizeDeliveryCommune(input.deliveryCommune);
    const reference = typeof input.deliveryReference === "string"
      ? input.deliveryReference.trim().replace(/\s+/g, " ") || null
      : input.deliveryReference === undefined || input.deliveryReference === null
        ? null
        : undefined;
    const coordinates = validateCoordinatePair(
      input.deliveryLatitude,
      input.deliveryLongitude,
    );

    if (recipientName.length < 3 || recipientName.length > 240) {
      return { success: false, error: "El nombre del destinatario debe tener entre 3 y 240 caracteres" };
    }
    if (!isValidRut(recipientRut)) {
      return { success: false, error: "El RUT del destinatario no es valido" };
    }
    if (!phone) {
      return { success: false, error: "El telefono debe ser un movil chileno valido" };
    }
    if (!address || address.length > 300) {
      return { success: false, error: "La direccion es obligatoria y no puede superar 300 caracteres" };
    }
    if (!commune) {
      return {
        success: false,
        error: `Por ahora los despachos solo estan disponibles en ${DELIVERY_COMMUNE}`,
      };
    }
    if (reference === undefined || (reference && reference.length > 500)) {
      return { success: false, error: "La referencia no puede superar 500 caracteres" };
    }
    if (!coordinates.success) return coordinates;

    delivery = {
      recipientName,
      recipientRut,
      phone,
      address,
      commune: DELIVERY_COMMUNE,
      reference,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  }

  const details: SaleDetailInput[] = [];
  const productIds = new Set<number>();

  for (const detail of input.details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      return { success: false, error: "Cada detalle debe ser valido" };
    }

    const item = detail as Record<string, unknown>;
    const allowedDetailFields = ["productId", "quantity"];

    for (const field of Object.keys(item)) {
      if (!allowedDetailFields.includes(field)) {
        return { success: false, error: `El campo ${field} no esta permitido en los detalles` };
      }
    }

    const productId = int(item.productId, "El producto");
    const quantity = int(item.quantity, "La cantidad");

    if (!productId.success) return { success: false, error: productId.error };
    if (!quantity.success) return { success: false, error: quantity.error };

    if (productIds.has(productId.value)) {
      return { success: false, error: "Cada producto debe aparecer una sola vez en la venta" };
    }
    productIds.add(productId.value);

    details.push({
      productId: productId.value,
      quantity: quantity.value,
    });
  }

  return {
    success: true,
    value: {
      paymentMethod: input.paymentMethod.trim(),
      details,
      deliveryType,
      delivery,
    },
  };
}

function validateTextBody(
  body: unknown,
  field: "reason" | "adminResponse",
  label: string,
  minimumLength: number,
): ValidationResult<string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar datos validos" };
  }

  const input = body as Record<string, unknown>;

  for (const inputField of Object.keys(input)) {
    if (inputField !== field) {
      return { success: false, error: `El campo ${inputField} no esta permitido` };
    }
  }

  if (typeof input[field] !== "string") {
    return { success: false, error: `${label} es obligatorio` };
  }

  const value = input[field].trim();

  if (value.length < minimumLength) {
    return { success: false, error: `${label} debe tener al menos ${minimumLength} caracteres` };
  }

  if (value.length > 500) {
    return { success: false, error: `${label} no puede superar 500 caracteres` };
  }

  return { success: true, value };
}

export function validateCancellationRequestBody(body: unknown): ValidationResult<CancellationRequestBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar datos validos" };
  }

  const input = body as Record<string, unknown>;
  const allowed = ["reason", "details"];

  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) {
      return { success: false, error: `El campo ${field} no esta permitido` };
    }
  }

  if (typeof input.reason !== "string") {
    return { success: false, error: "El motivo es obligatorio" };
  }

  const reason = input.reason.trim();

  if (reason.length < 5) {
    return { success: false, error: "El motivo debe tener al menos 5 caracteres" };
  }

  if (reason.length > 500) {
    return { success: false, error: "El motivo no puede superar 500 caracteres" };
  }

  if (!Array.isArray(input.details) || input.details.length < 1) {
    return { success: false, error: "Debe seleccionar al menos un producto para devolver" };
  }

  const details: SaleDetailInput[] = [];
  const productIds = new Set<number>();

  for (const detail of input.details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      return { success: false, error: "Cada producto solicitado debe ser valido" };
    }

    const item = detail as Record<string, unknown>;

    for (const field of Object.keys(item)) {
      if (field !== "productId" && field !== "quantity") {
        return { success: false, error: `El campo ${field} no esta permitido en los productos solicitados` };
      }
    }

    const productId = int(item.productId, "El producto");
    const quantity = int(item.quantity, "La cantidad solicitada");

    if (!productId.success) return { success: false, error: productId.error };
    if (!quantity.success) return { success: false, error: quantity.error };

    if (productIds.has(productId.value)) {
      return { success: false, error: "Cada producto debe aparecer una sola vez en la solicitud" };
    }

    productIds.add(productId.value);
    details.push({ productId: productId.value, quantity: quantity.value });
  }

  return { success: true, value: { reason, details } };
}

export function validateCancellationReviewBody(
  body: unknown,
  requireResponse: boolean,
): ValidationResult<CancellationReviewBody> {
  if (
    !requireResponse &&
    (
      !body ||
      (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0)
    )
  ) {
    return { success: true, value: { adminResponse: "Solicitud aprobada" } };
  }

  const validation = validateTextBody(body, "adminResponse", "La respuesta del administrador", requireResponse ? 5 : 1);
  return validation.success
    ? { success: true, value: { adminResponse: validation.value } }
    : validation;
}
