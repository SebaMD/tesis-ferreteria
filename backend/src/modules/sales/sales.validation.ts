export type SaleDetailInput = {
  productId: number;
  quantity: number;
  unitPrice: string;
};

export type SaleBody = {
  userId: number;
  paymentMethod: string;
  status?: string;
  date?: Date;
  details: SaleDetailInput[];
};

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function int(value: unknown, field: string): { success: true; value: number } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return { success: false, error: `${field} debe ser un numero entero valido` };
  return { success: true, value: number };
}

function money(value: unknown, field: string): { success: true; value: string } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return { success: false, error: `${field} debe ser un numero valido` };
  return { success: true, value: number.toFixed(2) };
}

export function validateCreateSaleBody(body: unknown): ValidationResult<SaleBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { success: false, error: "Debe enviar datos validos" };

  const input = body as Record<string, unknown>;
  const userId = int(input.userId, "El usuario");
  if (!userId.success) return { success: false, error: userId.error };

  if (typeof input.paymentMethod !== "string" || input.paymentMethod.trim().length < 2) {
    return { success: false, error: "El metodo de pago es obligatorio" };
  }

  let status: string | undefined;
  if (input.status !== undefined) {
    if (input.status !== "ACTIVE" && input.status !== "CANCELLED") {
      return { success: false, error: "El estado debe ser: ACTIVE o CANCELLED" };
    }
    status = input.status;
  }

  let date: Date | undefined;
  if (input.date !== undefined) {
    if (typeof input.date !== "string") return { success: false, error: "La fecha debe ser texto" };
    date = new Date(input.date);
    if (Number.isNaN(date.getTime())) return { success: false, error: "La fecha no es valida" };
  }

  if (!Array.isArray(input.details) || input.details.length < 1) {
    return { success: false, error: "Debe agregar al menos 1 detalle de venta" };
  }

  const details: SaleDetailInput[] = [];

  for (const detail of input.details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      return { success: false, error: "Cada detalle debe ser valido" };
    }

    const item = detail as Record<string, unknown>;
    const productId = int(item.productId, "El producto");
    const quantity = int(item.quantity, "La cantidad");
    const unitPrice = money(item.unitPrice, "El precio unitario");

    if (!productId.success) return { success: false, error: productId.error };
    if (!quantity.success) return { success: false, error: quantity.error };
    if (!unitPrice.success) return { success: false, error: unitPrice.error };

    details.push({
      productId: productId.value,
      quantity: quantity.value,
      unitPrice: unitPrice.value,
    });
  }

  return {
    success: true,
    value: {
      userId: userId.value,
      paymentMethod: input.paymentMethod.trim(),
      status,
      date,
      details,
    },
  };
}
