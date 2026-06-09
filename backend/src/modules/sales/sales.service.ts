import { db } from "../../db/index.js";
import { applyInventoryMovement } from "../inventory/inventory.service.js";
import { findProductsForSale } from "../products/products.repository.js";
import {
  createSale,
  createSaleDetails,
  findSaleById,
  findSaleDetailsForCancellation,
  findSaleForCancellation,
  findSales,
  markSaleAsCancelled,
} from "./sales.repository.js";
import type { SaleBody } from "./sales.validation.js";

export type CreateSaleData = SaleBody & {
  userId: number;
};

export class SaleError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SaleError";
  }
}

export async function getSalesService() {
  return findSales();
}

export async function getSaleByIdService(id: number) {
  const sale = await findSaleById(id);
  if (!sale) throw new Error("Venta no encontrada");
  return sale;
}

export async function createSaleService(data: CreateSaleData) {
  const createdSale = await db.transaction(async (tx) => {
    const products = await findProductsForSale(
      tx,
      data.details.map((detail) => detail.productId),
    );
    const productById = new Map(products.map((product) => [product.id, product]));

    const saleDetails = data.details.map((detail) => {
      const product = productById.get(detail.productId);

      if (!product) {
        throw new SaleError(`Producto ${detail.productId} no encontrado`, 404);
      }

      if (!product.status) {
        throw new SaleError(`El producto ${product.name} esta inactivo`, 409);
      }

      const unitPriceInCents = Math.round(Number(product.price) * 100);
      const subtotalInCents = unitPriceInCents * detail.quantity;

      return {
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: (unitPriceInCents / 100).toFixed(2),
        subtotal: (subtotalInCents / 100).toFixed(2),
        subtotalInCents,
      };
    });

    const totalInCents = saleDetails.reduce((total, detail) => total + detail.subtotalInCents, 0);
    const sale = await createSale(tx, {
      userId: data.userId,
      paymentMethod: data.paymentMethod,
      total: (totalInCents / 100).toFixed(2),
    });

    await createSaleDetails(
      tx,
      saleDetails.map((detail) => ({
        saleId: sale.id,
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: detail.subtotal,
      })),
    );

    for (const detail of saleDetails) {
      await applyInventoryMovement(tx, {
        productId: detail.productId,
        userId: data.userId,
        movementType: "EXIT",
        quantity: detail.quantity,
        reason: `Venta #${sale.id}`,
      });
    }

    return sale;
  });

  return findSaleById(createdSale.id);
}

export async function cancelSaleService(id: number, userId: number) {
  await db.transaction(async (tx) => {
    const sale = await findSaleForCancellation(tx, id);

    if (!sale) {
      throw new SaleError("Venta no encontrada", 404);
    }

    if (sale.status !== "ACTIVE") {
      throw new SaleError("La venta ya esta cancelada", 409);
    }

    const details = await findSaleDetailsForCancellation(tx, id);

    if (details.length === 0) {
      throw new SaleError("La venta no tiene detalles para restaurar", 409);
    }

    for (const detail of details) {
      await applyInventoryMovement(tx, {
        productId: detail.productId,
        userId,
        movementType: "ENTRY",
        quantity: detail.quantity,
        reason: `Cancelación de venta #${id}`,
        allowInactive: true,
      });
    }

    const cancelledSale = await markSaleAsCancelled(tx, id);

    if (!cancelledSale) {
      throw new SaleError("No se pudo cancelar la venta", 409);
    }
  });

  return findSaleById(id);
}
