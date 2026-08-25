import { db, type DbTransaction } from "../../db/index.js";
import { applyInventoryMovement, InventoryMovementError } from "../inventory/inventory.service.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
  lockProductsForAvailability,
} from "../inventory/stockAvailability.repository.js";
import {
  createSale,
  createSaleDetails,
  createCancellationRequest,
  createCancellationRequestItems,
  decreaseReturnedQuantity,
  findCancellationRequestById,
  findCancellationRequestForUpdate,
  findCancellationRequestItemsForUpdate,
  findCancellationRequests,
  findPendingCancellationRequest,
  findSaleById,
  findSaleDetailsForReturn,
  findSaleForCancellation,
  findSales,
  increaseReturnedQuantity,
  reverseCancellationRequest,
  resolveCancellationRequest,
  updateSaleReturnStatus,
  type SaleReturnStatus,
} from "./sales.repository.js";
import type { CancellationRequestBody, CancellationReviewBody, SaleBody } from "./sales.validation.js";

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

function formatSaleFolio(id: number) {
  return `V-${String(id).padStart(6, "0")}`;
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  if ("code" in error) return error.code;

  const cause = "cause" in error ? error.cause : null;
  return cause && typeof cause === "object" && "code" in cause ? cause.code : null;
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
    const productIds = data.details.map((detail) => detail.productId);
    const products = await lockProductsForAvailability(
      tx,
      productIds,
    );
    const productById = new Map(products.map((product) => [product.id, product]));
    const reservedQuantityByProduct = await findActiveReservedQuantities(tx, productIds);

    const saleDetails = data.details.map((detail) => {
      const product = productById.get(detail.productId);

      if (!product) {
        throw new SaleError(`Producto ${detail.productId} no encontrado`, 404);
      }

      if (!product.status) {
        throw new SaleError(`El producto ${product.name} esta inactivo`, 409);
      }

      const availableStock = calculateAvailableStock(
        product.currentStock,
        reservedQuantityByProduct.get(product.id) || 0,
      );

      if (detail.quantity > availableStock) {
        throw new SaleError(
          `El stock disponible de ${product.name} cambio. Solo quedan ${availableStock} unidades sin reservar.`,
          409,
        );
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

type LockedSaleDetail = Awaited<ReturnType<typeof findSaleDetailsForReturn>>[number];

function isReturnableSaleStatus(status: string) {
  return status === "ACTIVE" || status === "PARTIALLY_RETURNED";
}

function calculateSaleReturnStatus(details: LockedSaleDetail[]): SaleReturnStatus {
  if (details.length === 0 || details.every((detail) => detail.returnedQuantity === 0)) {
    return "ACTIVE";
  }

  if (details.every((detail) => detail.returnedQuantity >= detail.quantity)) {
    return "CANCELLED";
  }

  return "PARTIALLY_RETURNED";
}

function validateRequestedDetails(
  saleDetails: LockedSaleDetail[],
  requestedDetails: CancellationRequestBody["details"],
) {
  if (saleDetails.length === 0) {
    throw new SaleError("La venta no tiene productos disponibles para devolver", 409);
  }

  const detailByProduct = new Map(saleDetails.map((detail) => [detail.productId, detail]));

  return requestedDetails.map((requestedDetail) => {
    const saleDetail = detailByProduct.get(requestedDetail.productId);

    if (!saleDetail) {
      throw new SaleError(
        `El producto ${requestedDetail.productId} no pertenece a la venta`,
        409,
      );
    }

    const availableQuantity = saleDetail.quantity - saleDetail.returnedQuantity;

    if (requestedDetail.quantity > availableQuantity) {
      throw new SaleError(
        `La cantidad solicitada para el producto ${requestedDetail.productId} supera las ${availableQuantity} unidades disponibles para devolver`,
        409,
      );
    }

    return requestedDetail;
  });
}

async function approveReturnRequest(
  tx: DbTransaction,
  data: {
    requestId: number;
    saleId: number;
    reviewedBy: number;
    adminResponse: string;
    movementReason: string;
  },
) {
  const sale = await findSaleForCancellation(tx, data.saleId);
  const request = await findCancellationRequestForUpdate(tx, data.requestId);

  if (!sale) throw new SaleError("Venta no encontrada", 404);
  if (!request || request.saleId !== data.saleId) {
    throw new SaleError("Solicitud de devolución no encontrada", 404);
  }
  if (request.status !== "PENDING") {
    throw new SaleError("La solicitud de devolución ya fue revisada", 409);
  }
  if (!isReturnableSaleStatus(sale.status)) {
    throw new SaleError("La venta ya no tiene productos disponibles para devolver", 409);
  }

  const requestItems = await findCancellationRequestItemsForUpdate(tx, data.requestId);
  const saleDetails = await findSaleDetailsForReturn(tx, data.saleId);

  if (requestItems.length === 0) {
    throw new SaleError("La solicitud no tiene productos para devolver", 409);
  }

  const requestedDetails = validateRequestedDetails(
    saleDetails,
    requestItems.map((item) => ({
      productId: item.productId,
      quantity: item.requestedQuantity,
    })),
  );
  const detailByProduct = new Map(saleDetails.map((detail) => [detail.productId, detail]));

  for (const detail of [...requestedDetails].sort((left, right) => left.productId - right.productId)) {
    await applyInventoryMovement(tx, {
      productId: detail.productId,
      userId: data.reviewedBy,
      movementType: "ENTRY",
      quantity: detail.quantity,
      reason: data.movementReason,
      allowInactive: true,
    });

    const updatedDetail = await increaseReturnedQuantity(tx, {
      saleId: data.saleId,
      productId: detail.productId,
      quantity: detail.quantity,
    });

    if (!updatedDetail) {
      throw new SaleError("La cantidad solicitada ya no está disponible para devolver", 409);
    }

    const lockedDetail = detailByProduct.get(detail.productId);
    if (lockedDetail) lockedDetail.returnedQuantity = updatedDetail.returnedQuantity;
  }

  const updatedSale = await updateSaleReturnStatus(
    tx,
    data.saleId,
    calculateSaleReturnStatus(saleDetails),
  );

  if (!updatedSale) throw new SaleError("No se pudo actualizar el estado de la venta", 409);

  const resolvedRequest = await resolveCancellationRequest(tx, {
    id: data.requestId,
    status: "APPROVED",
    reviewedBy: data.reviewedBy,
    adminResponse: data.adminResponse,
  });

  if (!resolvedRequest) {
    throw new SaleError("No se pudo aprobar la solicitud de devolución", 409);
  }
}

export async function cancelSaleService(id: number, userId: number) {
  let requestId: number;

  try {
    requestId = await db.transaction(async (tx) => {
      const sale = await findSaleForCancellation(tx, id);

      if (!sale) throw new SaleError("Venta no encontrada", 404);
      if (!isReturnableSaleStatus(sale.status)) {
        throw new SaleError("La venta ya está completamente devuelta", 409);
      }
      if (await findPendingCancellationRequest(tx, id)) {
        throw new SaleError(
          "La venta tiene una solicitud de devolución pendiente. Debe aprobarla o rechazarla.",
          409,
        );
      }

      const saleDetails = await findSaleDetailsForReturn(tx, id);
      const availableDetails = saleDetails
        .map((detail) => ({
          productId: detail.productId,
          quantity: detail.quantity - detail.returnedQuantity,
        }))
        .filter((detail) => detail.quantity > 0);

      if (availableDetails.length === 0) {
        throw new SaleError("La venta no tiene productos disponibles para devolver", 409);
      }

      const request = await createCancellationRequest(tx, {
        saleId: id,
        requestedBy: userId,
        reason: `Cancelación directa de ${formatSaleFolio(id)}`,
      });

      await createCancellationRequestItems(
        tx,
        availableDetails.map((detail) => ({
          requestId: request.id,
          productId: detail.productId,
          requestedQuantity: detail.quantity,
        })),
      );

      await approveReturnRequest(tx, {
        requestId: request.id,
        saleId: id,
        reviewedBy: userId,
        adminResponse: "Cancelación directa realizada por el administrador",
        movementReason: `Cancelación directa de venta ${formatSaleFolio(id)} · solicitud #${request.id}`,
      });

      return request.id;
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new SaleError("Ya existe una solicitud de devolución pendiente para esta venta", 409);
    }
    throw error;
  }

  return {
    sale: await findSaleById(id),
    cancellationRequest: await findCancellationRequestById(requestId),
  };
}

export async function createDirectReturnService(
  saleId: number,
  adminUserId: number,
  data: CancellationRequestBody,
) {
  let requestId: number;

  try {
    requestId = await db.transaction(async (tx) => {
      const sale = await findSaleForCancellation(tx, saleId);

      if (!sale) throw new SaleError("Venta no encontrada", 404);
      if (!isReturnableSaleStatus(sale.status)) {
        throw new SaleError("La venta no tiene productos disponibles para devolver", 409);
      }
      if (await findPendingCancellationRequest(tx, saleId)) {
        throw new SaleError(
          "La venta tiene una solicitud de devolución pendiente. Debe aprobarla o rechazarla.",
          409,
        );
      }

      const saleDetails = await findSaleDetailsForReturn(tx, saleId);
      const requestedDetails = validateRequestedDetails(saleDetails, data.details);
      const request = await createCancellationRequest(tx, {
        saleId,
        requestedBy: adminUserId,
        reason: data.reason,
      });

      await createCancellationRequestItems(
        tx,
        requestedDetails.map((detail) => ({
          requestId: request.id,
          productId: detail.productId,
          requestedQuantity: detail.quantity,
        })),
      );

      await approveReturnRequest(tx, {
        requestId: request.id,
        saleId,
        reviewedBy: adminUserId,
        adminResponse: "Devolución registrada directamente por el administrador",
        movementReason: `Devolución directa de ${formatSaleFolio(saleId)} · solicitud #${request.id}`,
      });

      return request.id;
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new SaleError("Ya existe una solicitud de devolución pendiente para esta venta", 409);
    }
    throw error;
  }

  return {
    sale: await findSaleById(saleId),
    cancellationRequest: await findCancellationRequestById(requestId),
  };
}

export async function getCancellationRequestsService() {
  return findCancellationRequests();
}

export async function createCancellationRequestService(
  saleId: number,
  requestedBy: number,
  data: CancellationRequestBody,
) {
  let requestId: number;

  try {
    requestId = await db.transaction(async (tx) => {
      const sale = await findSaleForCancellation(tx, saleId);

      if (!sale) throw new SaleError("Venta no encontrada", 404);
      if (!isReturnableSaleStatus(sale.status)) {
        throw new SaleError("La venta no tiene productos disponibles para devolver", 409);
      }
      if (await findPendingCancellationRequest(tx, saleId)) {
        throw new SaleError("Ya existe una solicitud de devolución pendiente para esta venta", 409);
      }

      const saleDetails = await findSaleDetailsForReturn(tx, saleId);
      const requestedDetails = validateRequestedDetails(saleDetails, data.details);
      const request = await createCancellationRequest(tx, {
        saleId,
        requestedBy,
        reason: data.reason,
      });

      await createCancellationRequestItems(
        tx,
        requestedDetails.map((detail) => ({
          requestId: request.id,
          productId: detail.productId,
          requestedQuantity: detail.quantity,
        })),
      );

      return request.id;
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new SaleError("Ya existe una solicitud de devolución pendiente para esta venta", 409);
    }
    throw error;
  }

  return findCancellationRequestById(requestId);
}

export async function approveCancellationRequestService(
  requestId: number,
  reviewedBy: number,
  data: CancellationReviewBody,
) {
  const existingRequest = await findCancellationRequestById(requestId);

  if (!existingRequest) throw new SaleError("Solicitud de devolución no encontrada", 404);

  await db.transaction((tx) => approveReturnRequest(tx, {
    requestId,
    saleId: existingRequest.saleId,
    reviewedBy,
    adminResponse: data.adminResponse,
    movementReason: `Devolución aprobada de ${formatSaleFolio(existingRequest.saleId)} · solicitud #${requestId}`,
  }));

  return findCancellationRequestById(requestId);
}

export async function rejectCancellationRequestService(
  requestId: number,
  reviewedBy: number,
  data: CancellationReviewBody,
) {
  await db.transaction(async (tx) => {
    const request = await findCancellationRequestForUpdate(tx, requestId);

    if (!request) throw new SaleError("Solicitud de devolución no encontrada", 404);
    if (request.status !== "PENDING") {
      throw new SaleError("La solicitud de devolución ya fue revisada", 409);
    }

    const resolvedRequest = await resolveCancellationRequest(tx, {
      id: requestId,
      status: "REJECTED",
      reviewedBy,
      adminResponse: data.adminResponse,
    });

    if (!resolvedRequest) {
      throw new SaleError("No se pudo rechazar la solicitud de devolución", 409);
    }
  });

  return findCancellationRequestById(requestId);
}

export async function undoCancellationRequestService(requestId: number, userId: number) {
  const existingRequest = await findCancellationRequestById(requestId);

  if (!existingRequest) throw new SaleError("Solicitud de devolución no encontrada", 404);

  await db.transaction(async (tx) => {
    const sale = await findSaleForCancellation(tx, existingRequest.saleId);
    const request = await findCancellationRequestForUpdate(tx, requestId);

    if (!sale) throw new SaleError("Venta no encontrada", 404);
    if (!request || request.saleId !== existingRequest.saleId) {
      throw new SaleError("Solicitud de devolución no encontrada", 404);
    }
    if (request.status !== "APPROVED") {
      throw new SaleError("Solo se puede deshacer una solicitud aprobada", 409);
    }

    const requestItems = await findCancellationRequestItemsForUpdate(tx, requestId);
    const saleDetails = await findSaleDetailsForReturn(tx, request.saleId);

    if (requestItems.length === 0) {
      throw new SaleError("La solicitud no tiene productos devueltos para revertir", 409);
    }

    const detailByProduct = new Map(saleDetails.map((detail) => [detail.productId, detail]));

    for (const item of [...requestItems].sort((left, right) => left.productId - right.productId)) {
      const saleDetail = detailByProduct.get(item.productId);

      if (!saleDetail || saleDetail.returnedQuantity < item.requestedQuantity) {
        throw new SaleError("Las cantidades devueltas de la solicitud no se pueden revertir", 409);
      }

      try {
        await applyInventoryMovement(tx, {
          productId: item.productId,
          userId,
          movementType: "EXIT",
          quantity: item.requestedQuantity,
          reason: `Reversión de devolución ${formatSaleFolio(request.saleId)} · solicitud #${requestId}`,
          allowInactive: true,
        });
      } catch (error) {
        if (
          error instanceof InventoryMovementError &&
          error.statusCode === 409
        ) {
          throw new SaleError(
            "No se puede deshacer la devolución porque no existe stock disponible suficiente.",
            409,
          );
        }
        throw error;
      }

      const updatedDetail = await decreaseReturnedQuantity(tx, {
        saleId: request.saleId,
        productId: item.productId,
        quantity: item.requestedQuantity,
      });

      if (!updatedDetail) {
        throw new SaleError("No se pudo revertir la cantidad devuelta", 409);
      }

      saleDetail.returnedQuantity = updatedDetail.returnedQuantity;
    }

    const updatedSale = await updateSaleReturnStatus(
      tx,
      request.saleId,
      calculateSaleReturnStatus(saleDetails),
    );
    if (!updatedSale) throw new SaleError("No se pudo actualizar el estado de la venta", 409);

    const reversedRequest = await reverseCancellationRequest(tx, {
      id: requestId,
      reversedBy: userId,
    });
    if (!reversedRequest) throw new SaleError("No se pudo deshacer la devolución", 409);
  });

  return {
    sale: await findSaleById(existingRequest.saleId),
    cancellationRequest: await findCancellationRequestById(requestId),
  };
}
