import { db, type DbTransaction } from "../../db/index.js";
import type { NewInventoryMovement } from "../../db/schema/index.js";
import {
  decreaseProductStock,
  findProductStockById,
  increaseProductStock,
  setProductStock,
} from "../products/products.repository.js";
import {
  createInventoryMovement,
  findInventoryMovementById,
  findInventoryMovements,
} from "./inventory.repository.js";
import type { InventoryMovementBody } from "./inventory.validation.js";

export type ApplyInventoryMovementData = InventoryMovementBody & {
  userId: number;
};

export class InventoryMovementError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "InventoryMovementError";
  }
}

export async function getInventoryMovementsService() {
  return findInventoryMovements();
}

export async function getInventoryMovementByIdService(id: number) {
  const movement = await findInventoryMovementById(id);
  if (!movement) throw new Error("Movimiento de inventario no encontrado");
  return movement;
}

export async function applyInventoryMovement(tx: DbTransaction, data: ApplyInventoryMovementData) {
  const allowsZero = data.movementType === "ADJUSTMENT";

  if (!Number.isInteger(data.quantity) || (allowsZero ? data.quantity < 0 : data.quantity < 1)) {
    throw new InventoryMovementError("La cantidad del movimiento no es valida", 400);
  }

  const product = await findProductStockById(tx, data.productId);

  if (!product) {
    throw new InventoryMovementError("Producto no encontrado", 404);
  }

  if (!product.status) {
    throw new InventoryMovementError("No se pueden realizar movimientos sobre un producto inactivo", 409);
  }

  switch (data.movementType) {
    case "ENTRY": {
      const updatedProduct = await increaseProductStock(tx, data.productId, data.quantity);

      if (!updatedProduct) {
        throw new InventoryMovementError("El producto ya no esta disponible para realizar movimientos", 409);
      }
      break;
    }
    case "EXIT": {
      const updatedProduct = await decreaseProductStock(tx, data.productId, data.quantity);

      if (!updatedProduct) {
        throw new InventoryMovementError("Stock insuficiente para realizar el movimiento", 409);
      }
      break;
    }
    case "ADJUSTMENT": {
      const updatedProduct = await setProductStock(tx, data.productId, data.quantity);

      if (!updatedProduct) {
        throw new InventoryMovementError("El producto ya no esta disponible para realizar movimientos", 409);
      }
      break;
    }
  }

  const movementData: NewInventoryMovement = {
    productId: data.productId,
    userId: data.userId,
    movementType: data.movementType,
    quantity: data.quantity,
    reason: data.reason,
    date: data.date,
  };

  return createInventoryMovement(tx, movementData);
}

export async function createInventoryMovementService(data: ApplyInventoryMovementData) {
  const movement = await db.transaction((tx) => applyInventoryMovement(tx, data));
  return findInventoryMovementById(movement.id);
}
