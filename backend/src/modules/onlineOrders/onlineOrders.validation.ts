import {
  canonicalizeDeliveryCommune,
  DELIVERY_COMMUNE,
  validateCoordinatePair,
} from "../../utils/delivery.js";
import { isValidEmail, normalizeEmail } from "../../utils/email.js";

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

export type CreateGuestCheckoutBody = CreateCheckoutBody & {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  emailVerificationChallengeId: number;
};

export type ClientDeliveryAddressBody = {
  recipientName: string;
  phone: string;
  address: string;
  commune: string;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
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

function validateDeliveryFields(input: Record<string, unknown>, required = true) {
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
  const coordinates = validateCoordinatePair(input.deliveryLatitude, input.deliveryLongitude);
  if (!coordinates.success) return coordinates;

  if (required && !recipientName.value) {
    return { success: false as const, error: "El nombre del destinatario es obligatorio para despacho" };
  }
  if (required && !phone.value) {
    return { success: false as const, error: "El telefono de contacto es obligatorio para despacho" };
  }
  if (phone.value && !/^[+0-9()\s-]{7,20}$/.test(phone.value)) {
    return { success: false as const, error: "El telefono de contacto no es valido" };
  }
  if (required && !address.value) {
    return { success: false as const, error: "La direccion es obligatoria para despacho" };
  }
  if ((required || commune.value) && (!commune.value || !canonicalizeDeliveryCommune(commune.value))) {
    return {
      success: false as const,
      error: `Por ahora los despachos solo estan disponibles en ${DELIVERY_COMMUNE}`,
    };
  }

  return {
    success: true as const,
    value: {
      recipientName: recipientName.value,
      phone: phone.value,
      address: address.value,
      commune: DELIVERY_COMMUNE,
      reference: reference.value,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
  };
}

export function validateClientDeliveryAddressBody(body: unknown): ValidationResult<ClientDeliveryAddressBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar una direccion valida" };
  }
  const input = body as Record<string, unknown>;
  const allowed = new Set(["recipientName", "phone", "address", "commune", "reference", "latitude", "longitude"]);
  if (Object.keys(input).some((field) => !allowed.has(field))) {
    return { success: false, error: "La direccion contiene campos no permitidos" };
  }
  const validation = validateDeliveryFields({
    deliveryRecipientName: input.recipientName,
    deliveryPhone: input.phone,
    deliveryAddress: input.address,
    deliveryCommune: input.commune,
    deliveryReference: input.reference,
    deliveryLatitude: input.latitude,
    deliveryLongitude: input.longitude,
  });
  if (!validation.success) return validation;
  const { recipientName, phone, address, ...rest } = validation.value;
  if (!recipientName || !phone || !address) {
    return { success: false, error: "La direccion guardada debe incluir destinatario, telefono y direccion" };
  }
  return { success: true, value: { recipientName, phone, address, ...rest } };
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

  const deliveryValidation = validateDeliveryFields(input, input.deliveryType === "DELIVERY");
  if (!deliveryValidation.success) return deliveryValidation;
  const delivery = input.deliveryType === "DELIVERY" ? deliveryValidation : null;

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
      deliveryRecipientName: delivery?.value.recipientName ?? null,
      deliveryPhone: delivery?.value.phone ?? null,
      deliveryAddress: delivery?.value.address ?? null,
      deliveryCommune: delivery?.value.commune ?? null,
      deliveryReference: delivery?.value.reference ?? null,
      deliveryLatitude: delivery?.value.latitude ?? null,
      deliveryLongitude: delivery?.value.longitude ?? null,
      saveDeliveryAddress: input.deliveryType === "DELIVERY"
        && input.saveDeliveryAddress === true,
    },
  };
}

export function validateCreateGuestCheckoutBody(
  body: unknown,
): ValidationResult<CreateGuestCheckoutBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar datos validos" };
  }

  const input = body as Record<string, unknown>;
  const guestFields = new Set([
    "guestName",
    "guestEmail",
    "guestEmailConfirmation",
    "guestPhone",
    "emailVerificationChallengeId",
  ]);
  const checkoutFields = new Set([
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
    if (!guestFields.has(field) && !checkoutFields.has(field)) {
      return { success: false, error: `El campo ${field} no esta permitido` };
    }
  }

  if (input.saveDeliveryAddress === true) {
    return { success: false, error: "Una compra como invitado no puede guardar direcciones" };
  }

  const guestName = optionalText(input.guestName, "El nombre del comprador", 240);
  if (!guestName.success) return guestName;
  const guestEmail = optionalText(input.guestEmail, "El correo electronico", 254);
  if (!guestEmail.success) return guestEmail;
  const guestEmailConfirmation = optionalText(
    input.guestEmailConfirmation,
    "La confirmacion del correo",
    254,
  );
  if (!guestEmailConfirmation.success) return guestEmailConfirmation;
  const guestPhone = optionalText(input.guestPhone, "El telefono", 20);
  if (!guestPhone.success) return guestPhone;

  if (!guestName.value || guestName.value.length < 3) {
    return { success: false, error: "El nombre del comprador debe tener al menos 3 caracteres" };
  }
  const normalizedEmail = normalizeEmail(guestEmail.value || "");
  const normalizedEmailConfirmation = normalizeEmail(guestEmailConfirmation.value || "");
  if (!isValidEmail(normalizedEmail)) {
    return { success: false, error: "El correo electronico no es valido" };
  }
  if (normalizedEmail !== normalizedEmailConfirmation) {
    return { success: false, error: "Los correos electronicos no coinciden" };
  }
  if (!guestPhone.value || !/^[+0-9()\s-]{7,20}$/.test(guestPhone.value)) {
    return { success: false, error: "El telefono del comprador no es valido" };
  }
  const emailVerificationChallengeId = positiveInteger(input.emailVerificationChallengeId);
  if (!emailVerificationChallengeId) {
    return { success: false, error: "Debes verificar el correo antes de iniciar el pago" };
  }

  const checkoutInput = Object.fromEntries(
    [...checkoutFields].map((field) => [field, input[field]]),
  );
  checkoutInput.saveDeliveryAddress = false;
  const checkout = validateCreateCheckoutBody(checkoutInput);
  if (!checkout.success) return checkout;

  return {
    success: true,
    value: {
      ...checkout.value,
      saveDeliveryAddress: false,
      guestName: guestName.value,
      guestEmail: normalizedEmail,
      guestPhone: guestPhone.value,
      emailVerificationChallengeId,
    },
  };
}
