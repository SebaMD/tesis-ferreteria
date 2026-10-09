import { db, type DbTransaction } from "../../db/index.js";
import {
  acquirePromotionPricingLock,
  deletePromotionTx,
  findPromotionById,
  findPromotionForUpdateTx,
  findPromotions,
  findPromotionScopesTx,
  findPromotionTargets,
  insertPromotionTx,
  setPromotionStatusTx,
  updatePromotionTx,
  validateTargetRecordsTx,
} from "./promotions.repository.js";
import type { PromotionInput } from "./promotions.validation.js";

export class PromotionError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PromotionError";
  }
}

function intervalsOverlap(
  left: { startsAt: Date; endsAt: Date | null },
  right: { startsAt: Date; endsAt: Date | null },
) {
  const leftEnd = left.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return left.startsAt.getTime() < rightEnd && right.startsAt.getTime() < leftEnd;
}

function presentPromotion<T extends {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
}>(promotion: T, now = new Date()) {
  const status = !promotion.isActive
    ? "INACTIVE"
    : promotion.startsAt > now
      ? "SCHEDULED"
      : promotion.endsAt && promotion.endsAt <= now
        ? "EXPIRED"
        : "ACTIVE";
  return { ...promotion, status, isIndefinite: promotion.endsAt === null };
}

async function validateTargetsAndConflicts(
  tx: DbTransaction,
  input: PromotionInput,
  excludeId?: number,
) {
  const targets = await validateTargetRecordsTx(tx, input.productIds, input.categoryIds);
  if (targets.products.length !== input.productIds.length) {
    throw new PromotionError("Uno o mas productos seleccionados no existen", 400);
  }
  if (targets.products.some((product) => !product.status)) {
    throw new PromotionError("Solo se pueden seleccionar productos activos", 409);
  }
  if (targets.categories.length !== input.categoryIds.length) {
    throw new PromotionError("Una o mas categorias seleccionadas no existen", 400);
  }

  const selectedCategories = new Set(input.categoryIds);
  const redundant = targets.products.find((product) => selectedCategories.has(product.categoryId));
  if (redundant) {
    throw new PromotionError(
      `${redundant.name} no puede seleccionarse directamente y tambien mediante su categoria`,
      409,
    );
  }
  if (!input.isActive) return;

  const scopes = await findPromotionScopesTx(tx, excludeId);
  const activeProducts = scopes.products.filter((product) => product.status);
  const candidateIds = new Set(input.productIds);
  for (const product of activeProducts) {
    if (selectedCategories.has(product.categoryId)) candidateIds.add(product.id);
  }

  for (const promotion of scopes.promotions) {
    if (!intervalsOverlap(input, promotion)) continue;
    const directIds = new Set(
      scopes.productTargets
        .filter((target) => target.promotionId === promotion.id)
        .map((target) => target.productId),
    );
    const categoryIds = new Set(
      scopes.categoryTargets
        .filter((target) => target.promotionId === promotion.id)
        .map((target) => target.categoryId),
    );
    const sharedCategory = input.categoryIds.find((categoryId) => categoryIds.has(categoryId));
    if (sharedCategory !== undefined) {
      const category = targets.categories.find((item) => item.id === sharedCategory);
      throw new PromotionError(
        `La categoria ${category?.name || sharedCategory} ya esta cubierta por la promocion "${promotion.name}" durante ese periodo`,
        409,
      );
    }
    const conflict = activeProducts.find((product) => (
      candidateIds.has(product.id)
      && (directIds.has(product.id) || categoryIds.has(product.categoryId))
    ));
    if (conflict) {
      throw new PromotionError(
        `${conflict.name} ya esta cubierto por la promocion "${promotion.name}" durante ese periodo`,
        409,
      );
    }
  }
}

export async function assertProductPromotionCompatibilityTx(
  tx: DbTransaction,
  data: { productId: number; productName: string; categoryId: number; status: boolean },
) {
  if (!data.status) return;
  await acquirePromotionPricingLock(tx);
  const scopes = await findPromotionScopesTx(tx);
  const covering = scopes.promotions.filter((promotion) => {
    const direct = scopes.productTargets.some((target) => (
      target.promotionId === promotion.id && target.productId === data.productId
    ));
    const category = scopes.categoryTargets.some((target) => (
      target.promotionId === promotion.id && target.categoryId === data.categoryId
    ));
    return direct || category;
  });
  for (let left = 0; left < covering.length; left += 1) {
    for (let right = left + 1; right < covering.length; right += 1) {
      if (intervalsOverlap(covering[left], covering[right])) {
        throw new PromotionError(
          `${data.productName} quedaria cubierto por promociones superpuestas`,
          409,
        );
      }
    }
  }
}

export async function listPromotionsService() {
  return (await findPromotions()).map((promotion) => presentPromotion(promotion));
}

export async function getPromotionService(id: number) {
  const promotion = await findPromotionById(id);
  if (!promotion) throw new PromotionError("Promocion no encontrada", 404);
  return presentPromotion(promotion);
}

export function getPromotionTargetsService() {
  return findPromotionTargets();
}

export async function createPromotionService(userId: number, input: PromotionInput) {
  const id = await db.transaction(async (tx) => {
    await acquirePromotionPricingLock(tx);
    await validateTargetsAndConflicts(tx, input);
    return (await insertPromotionTx(tx, { ...input, userId })).id;
  });
  return getPromotionService(id);
}

export async function updatePromotionService(userId: number, id: number, input: PromotionInput) {
  await db.transaction(async (tx) => {
    await acquirePromotionPricingLock(tx);
    if (!await findPromotionForUpdateTx(tx, id)) {
      throw new PromotionError("Promocion no encontrada", 404);
    }
    await validateTargetsAndConflicts(tx, input, id);
    if (!await updatePromotionTx(tx, id, { ...input, userId })) {
      throw new PromotionError("Promocion no encontrada", 404);
    }
  });
  return getPromotionService(id);
}

export async function setPromotionStatusService(userId: number, id: number, isActive: boolean) {
  await db.transaction(async (tx) => {
    await acquirePromotionPricingLock(tx);
    const current = await findPromotionForUpdateTx(tx, id);
    if (!current) throw new PromotionError("Promocion no encontrada", 404);
    if (isActive) {
      await validateTargetsAndConflicts(tx, {
        name: current.name,
        type: current.type,
        isActive,
        percentage: current.percentage,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
        productIds: current.productIds,
        categoryIds: current.categoryIds,
      }, id);
    }
    await setPromotionStatusTx(tx, id, isActive, userId);
  });
  return getPromotionService(id);
}

export async function deletePromotionService(id: number) {
  await db.transaction(async (tx) => {
    await acquirePromotionPricingLock(tx);
    const promotion = await findPromotionForUpdateTx(tx, id);
    if (!promotion) throw new PromotionError("Promocion no encontrada", 404);
    if (promotion.usageCount > 0) {
      throw new PromotionError(
        "La promocion ya fue utilizada y debe conservarse como trazabilidad. Puede desactivarla.",
        409,
      );
    }
    await deletePromotionTx(tx, id);
  });
  return { deleted: true };
}
