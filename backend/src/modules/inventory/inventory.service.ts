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
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "./stockAvailability.repository.js";
import type { InventoryMovementBody } from "./inventory.validation.js";

export type InventoryMovementType = "ENTRY" | "EXIT" | "ADJUSTMENT";

export type ApplyInventoryMovementData = Omit<InventoryMovementBody, "movementType"> & {
  movementType: InventoryMovementType;
  userId: number | null;
  onlineOrderId?: number | null;
  allowInactive?: boolean;
  excludedReservationOrderId?: number;
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
  const onlineOrderId = data.onlineOrderId ?? null;

  if (data.userId !== null && (!Number.isInteger(data.userId) || data.userId < 1)) {
    throw new InventoryMovementError("El usuario responsable no es valido", 400);
  }

  if (onlineOrderId !== null && (!Number.isInteger(onlineOrderId) || onlineOrderId < 1)) {
    throw new InventoryMovementError("El pedido online de origen no es valido", 400);
  }

  if (onlineOrderId !== null && data.movementType !== "EXIT") {
    throw new InventoryMovementError(
      "Un pedido online solo puede originar movimientos EXIT",
      400,
    );
  }

  if (data.userId === null && (data.movementType !== "EXIT" || onlineOrderId === null)) {
    throw new InventoryMovementError(
      "El movimiento debe identificar un usuario o un pedido online de origen",
      400,
    );
  }

  if (!Number.isInteger(data.quantity) || (allowsZero ? data.quantity < 0 : data.quantity < 1)) {
    throw new InventoryMovementError("La cantidad del movimiento no es valida", 400);
  }

  if (data.movementType === "ADJUSTMENT" && (!data.reason || !data.reason.trim())) {
    throw new InventoryMovementError("El motivo del ajuste administrativo es obligatorio", 400);
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
      const reservedByProduct = await findActiveReservedQuantities(
        tx,
        [data.productId],
        data.excludedReservationOrderId,
      );
      const availableStock = calculateAvailableStock(
        product.currentStock,
        reservedByProduct.get(data.productId) || 0,
      );

      if (data.quantity > availableStock) {
        throw new InventoryMovementError(
          "Stock insuficiente: existen unidades reservadas para pedidos online",
          409,
        );
      }

      const updatedProduct = await decreaseProductStock(
        tx,
        data.productId,
        data.quantity,
        data.allowInactive,
      );

      if (!updatedProduct) {
        throw new InventoryMovementError("Stock insuficiente para realizar el movimiento", 409);
      }
      finalStock = updatedProduct.currentStock;
      break;
    }
    case "ADJUSTMENT": {
      const reservedByProduct = await findActiveReservedQuantities(tx, [data.productId]);
      const reservedQuantity = reservedByProduct.get(data.productId) || 0;

      if (data.quantity < reservedQuantity) {
        throw new InventoryMovementError(
          `El ajuste no puede dejar menos de ${reservedQuantity} unidades reservadas para pedidos online`,
          409,
        );
      }

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
    onlineOrderId,
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
