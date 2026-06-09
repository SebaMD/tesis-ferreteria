export type SaleDetailInput = {
  productId: number;
  quantity: number;
};

export type SaleBody = {
  paymentMethod: string;
  details: SaleDetailInput[];
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
  const allowed = ["paymentMethod", "details"];

  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) return { success: false, error: `El campo ${field} no esta permitido` };
  }

  if (typeof input.paymentMethod !== "string" || input.paymentMethod.trim().length < 2) {
    return { success: false, error: "El metodo de pago es obligatorio" };
  }

  if (!Array.isArray(input.details) || input.details.length < 1) {
    return { success: false, error: "Debe agregar al menos 1 detalle de venta" };
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
    },
  };
}
