import type { NewInventoryMovement } from "../../db/schema/index.js";

export type InventoryMovementBody = Pick<NewInventoryMovement, "productId" | "userId" | "movementType" | "quantity" | "reason" | "date">;

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function int(value: unknown, field: string): { success: true; value: number } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return { success: false, error: `${field} debe ser un numero entero valido` };
  return { success: true, value: number };
}

export function validateCreateInventoryMovementBody(body: unknown): ValidationResult<InventoryMovementBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { success: false, error: "Debe enviar datos validos" };

  const input = body as Record<string, unknown>;
  const productId = int(input.productId, "El producto");
  const userId = int(input.userId, "El usuario");
  const quantity = int(input.quantity, "La cantidad");

  if (!productId.success) return { success: false, error: productId.error };
  if (!userId.success) return { success: false, error: userId.error };
  if (!quantity.success) return { success: false, error: quantity.error };

  if (input.movementType !== "ENTRY" && input.movementType !== "EXIT" && input.movementType !== "ADJUSTMENT") {
    return { success: false, error: "El tipo de movimiento debe ser: ENTRY, EXIT o ADJUSTMENT" };
  }

  let reason: string | null | undefined;
  if (input.reason !== undefined) {
    if (input.reason === null || input.reason === "") reason = null;
    else {
      if (typeof input.reason !== "string") return { success: false, error: "La razon debe ser texto" };
      reason = input.reason.trim();
    }
  }

  let date: Date | undefined;
  if (input.date !== undefined) {
    if (typeof input.date !== "string") return { success: false, error: "La fecha debe ser texto" };
    date = new Date(input.date);
    if (Number.isNaN(date.getTime())) return { success: false, error: "La fecha no es valida" };
  }

  return {
    success: true,
    value: {
      productId: productId.value,
      userId: userId.value,
      movementType: input.movementType,
      quantity: quantity.value,
      reason,
      date,
    },
  };
}
