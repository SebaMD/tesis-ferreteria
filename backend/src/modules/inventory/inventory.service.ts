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

export type InventoryMovementType = "ENTRY" | "EXIT" | "ADJUSTMENT";

export type ApplyInventoryMovementData = Omit<InventoryMovementBody, "movementType"> & {
  movementType: InventoryMovementType;
  userId: number;
  allowInactive?: boolean;
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

  if (!product.status && !data.allowInactive) {
    throw new InventoryMovementError("No se pueden realizar movimientos sobre un producto inactivo", 409);
  }

  let finalStock: number;

  switch (data.movementType) {
    case "ENTRY": {
      const updatedProduct = await increaseProductStock(tx, data.productId, data.quantity, data.allowInactive);

      if (!updatedProduct) {
        throw new InventoryMovementError("El producto ya no esta disponible para realizar movimientos", 409);
      }
      finalStock = updatedProduct.currentStock;
      break;
    }
    case "EXIT": {
      const updatedProduct = await decreaseProductStock(tx, data.productId, data.quantity);

      if (!updatedProduct) {
        throw new InventoryMovementError("Stock insuficiente para realizar el movimiento", 409);
      }
      finalStock = updatedProduct.currentStock;
      break;
    }
    case "ADJUSTMENT": {
      const updatedProduct = await setProductStock(tx, data.productId, data.quantity);

      if (!updatedProduct) {
        throw new InventoryMovementError("El producto ya no esta disponible para realizar movimientos", 409);
      }
      finalStock = updatedProduct.currentStock;
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

  const movement = await createInventoryMovement(tx, movementData);

  return {
    movement,
    stock: {
      productId: product.id,
      productName: product.name,
      currentStock: finalStock,
      minimumStock: product.minimumStock,
      lowStock: finalStock <= product.minimumStock,
    },
  };
}

export async function createInventoryMovementService(data: ApplyInventoryMovementData) {
  if (data.movementType === "EXIT") {
    throw new InventoryMovementError("Los movimientos EXIT solo pueden ser generados internamente", 403);
  }

  const result = await db.transaction((tx) => applyInventoryMovement(tx, data));
  const movement = await findInventoryMovementById(result.movement.id);

  return {
    ...movement,
    stock: result.stock,
  };
}
