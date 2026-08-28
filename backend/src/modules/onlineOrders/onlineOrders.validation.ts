import {
  canonicalizeDeliveryCommune,
  DELIVERY_COMMUNE,
  validateCoordinatePair,
} from "../../utils/delivery.js";

export type OnlineOrderItemInput = {
  productId: number;
  quantity: number;
};

export type CreateCheckoutBody = {
  checkoutKey: string;
  items: OnlineOrderItemInput[];
  deliveryType: "PICKUP" | "DELIVERY";
  deliveryRecipientName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryCommune: string | null;
  deliveryReference: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  saveDeliveryAddress: boolean;
};

type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return { success: true as const, value: null };
  }
  if (typeof value !== "string") {
    return { success: false as const, error: `${field} debe ser texto` };
  }

  const normalized = value.trim();
  if (!normalized) return { success: true as const, value: null };
  if (normalized.length > maxLength) {
    return { success: false as const, error: `${field} no puede superar ${maxLength} caracteres` };
  }
  return { success: true as const, value: normalized };
}

export function validateCreateCheckoutBody(body: unknown): ValidationResult<CreateCheckoutBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar datos validos" };
  }

  const input = body as Record<string, unknown>;

  const allowedFields = new Set([
    "checkoutKey",
    "items",
    "deliveryType",
    "deliveryRecipientName",
    "deliveryPhone",
    "deliveryAddress",
    "deliveryCommune",
    "deliveryReference",
    "deliveryLatitude",
    "deliveryLongitude",
    "saveDeliveryAddress",
  ]);

  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      return { success: false, error: `El campo ${field} no esta permitido` };
    }
  }

  if (
    typeof input.checkoutKey !== "string"
    || !/^[a-zA-Z0-9-]{16,64}$/.test(input.checkoutKey.trim())
  ) {
    return { success: false, error: "La identificacion del checkout no es valida" };
  }

  if (!Array.isArray(input.items) || input.items.length < 1) {
    return { success: false, error: "El carrito debe contener al menos un producto" };
  }

  if (input.items.length > 100) {
    return { success: false, error: "El carrito no puede superar 100 productos diferentes" };
  }

  if (input.deliveryType !== "PICKUP" && input.deliveryType !== "DELIVERY") {
    return { success: false, error: "Debe seleccionar retiro en tienda o despacho a domicilio" };
  }

  if (input.saveDeliveryAddress !== undefined && typeof input.saveDeliveryAddress !== "boolean") {
    return { success: false, error: "La opcion de guardar la direccion no es valida" };
  }

  const recipientName = optionalText(input.deliveryRecipientName, "El nombre del destinatario", 240);
  if (!recipientName.success) return recipientName;
  const phone = optionalText(input.deliveryPhone, "El telefono de contacto", 20);
  if (!phone.success) return phone;
  const address = optionalText(input.deliveryAddress, "La direccion", 300);
  if (!address.success) return address;
  const commune = optionalText(input.deliveryCommune, "La comuna", 120);
  if (!commune.success) return commune;
  const reference = optionalText(input.deliveryReference, "La referencia", 500);
  if (!reference.success) return reference;
  const coordinates = validateCoordinatePair(
    input.deliveryLatitude,
    input.deliveryLongitude,
  );
  if (!coordinates.success) return coordinates;

  if (input.deliveryType === "DELIVERY") {
    if (!recipientName.value) {
      return { success: false, error: "El nombre del destinatario es obligatorio para despacho" };
    }
    if (!phone.value) {
      return { success: false, error: "El telefono de contacto es obligatorio para despacho" };
    }
    if (!/^[+0-9()\s-]{7,20}$/.test(phone.value)) {
      return { success: false, error: "El telefono de contacto no es valido" };
    }
    if (!address.value) {
      return { success: false, error: "La direccion es obligatoria para despacho" };
    }
    if (!commune.value || !canonicalizeDeliveryCommune(commune.value)) {
      return {
        success: false,
        error: `Por ahora los despachos solo estan disponibles en ${DELIVERY_COMMUNE}`,
      };
    }
  }

  const productIds = new Set<number>();
  const items: OnlineOrderItemInput[] = [];

  for (const detail of input.items) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      return { success: false, error: "Cada producto del carrito debe ser valido" };
    }

    const item = detail as Record<string, unknown>;

    for (const field of Object.keys(item)) {
      if (field !== "productId" && field !== "quantity") {
        return { success: false, error: `El campo ${field} no esta permitido en los productos` };
      }
    }

    const productId = positiveInteger(item.productId);
    const quantity = positiveInteger(item.quantity);

    if (!productId) return { success: false, error: "El producto debe ser valido" };
    if (!quantity) return { success: false, error: "La cantidad debe ser un entero mayor que cero" };
    if (productIds.has(productId)) {
      return { success: false, error: "Cada producto debe aparecer una sola vez en el carrito" };
    }

    productIds.add(productId);
    items.push({ productId, quantity });
  }

  return {
    success: true,
    value: {
      checkoutKey: input.checkoutKey.trim(),
      items,
      deliveryType: input.deliveryType,
      deliveryRecipientName: input.deliveryType === "DELIVERY" ? recipientName.value : null,
      deliveryPhone: input.deliveryType === "DELIVERY" ? phone.value : null,
      deliveryAddress: input.deliveryType === "DELIVERY" ? address.value : null,
      deliveryCommune: input.deliveryType === "DELIVERY" ? DELIVERY_COMMUNE : null,
      deliveryReference: input.deliveryType === "DELIVERY" ? reference.value : null,
      deliveryLatitude: input.deliveryType === "DELIVERY" ? coordinates.latitude : null,
      deliveryLongitude: input.deliveryType === "DELIVERY" ? coordinates.longitude : null,
      saveDeliveryAddress: input.deliveryType === "DELIVERY"
        && input.saveDeliveryAddress === true,
    },
  };
}
