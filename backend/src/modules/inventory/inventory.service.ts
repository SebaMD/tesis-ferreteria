import {
  createInventoryMovement,
  deleteInventoryMovementById,
  findInventoryMovementById,
  findInventoryMovements,
} from "./inventory.repository.js";
import type { InventoryMovementBody } from "./inventory.validation.js";

export async function getInventoryMovementsService() {
  return findInventoryMovements();
}

export async function getInventoryMovementByIdService(id: number) {
  const movement = await findInventoryMovementById(id);
  if (!movement) throw new Error("Movimiento de inventario no encontrado");
  return movement;
}

export async function createInventoryMovementService(data: InventoryMovementBody) {
  return createInventoryMovement(data);
}

export async function deleteInventoryMovementService(id: number) {
  return Boolean(await deleteInventoryMovementById(id));
}
