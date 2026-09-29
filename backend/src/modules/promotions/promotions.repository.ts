import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  categoriesTable,
  onlineOrderItemsTable,
  productsTable,
  promotionCategoriesTable,
  promotionProductsTable,
  promotionsTable,
  type NewPromotion,
  type PromotionType,
} from "../../db/schema/index.js";
import type { ApplicablePromotion } from "./promotionPricing.js";
import type { PromotionInput } from "./promotions.validation.js";

const PROMOTION_PRICING_LOCK = 7_306_021;

export async function acquirePromotionPricingLock(tx: DbTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(${PROMOTION_PRICING_LOCK})`);
}

function activeAt(at: Date) {
  return and(
    eq(promotionsTable.isActive, true),
    lte(promotionsTable.startsAt, at),
    or(isNull(promotionsTable.endsAt), gt(promotionsTable.endsAt, at)),
  );
}

const applicablePromotionColumns = {
  id: promotionsTable.id,
  name: promotionsTable.name,
  type: promotionsTable.type,
  percentage: promotionsTable.percentage,
  startsAt: promotionsTable.startsAt,
  endsAt: promotionsTable.endsAt,
};

async function activePromotionsForProducts(
  executor: Pick<typeof db, "select">,
  productIds: number[],
  at: Date,
) {
  if (productIds.length === 0) return new Map<number, ApplicablePromotion>();

  const directRows = await executor
    .select({ productId: promotionProductsTable.productId, ...applicablePromotionColumns })
    .from(promotionProductsTable)
    .innerJoin(promotionsTable, eq(promotionProductsTable.promotionId, promotionsTable.id))
    .where(and(inArray(promotionProductsTable.productId, productIds), activeAt(at)))
    .orderBy(asc(promotionsTable.id));

  const categoryRows = await executor
    .select({ productId: productsTable.id, ...applicablePromotionColumns })
    .from(productsTable)
    .innerJoin(
      promotionCategoriesTable,
      eq(productsTable.categoryId, promotionCategoriesTable.categoryId),
    )
    .innerJoin(promotionsTable, eq(promotionCategoriesTable.promotionId, promotionsTable.id))
    .where(and(inArray(productsTable.id, productIds), activeAt(at)))
    .orderBy(asc(promotionsTable.id));

  const byProduct = new Map<number, ApplicablePromotion>();
  for (const row of [...directRows, ...categoryRows]) {
    const promotion: ApplicablePromotion = {
      id: row.id,
      name: row.name,
      type: row.type,
      percentage: row.percentage,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
    const current = byProduct.get(row.productId);
    if (current && current.id !== promotion.id) {
      throw new Error(`El producto ${row.productId} tiene promociones superpuestas`);
    }
    byProduct.set(row.productId, promotion);
  }
  return byProduct;
}

export function findActivePromotionsForProducts(productIds: number[], at = new Date()) {
  return activePromotionsForProducts(db, productIds, at);
}

export function findActivePromotionsForProductsTx(
  tx: DbTransaction,
  productIds: number[],
  at = new Date(),
) {
  return activePromotionsForProducts(tx, productIds, at);
}

function activeTargetSql() {
  return sql`(
    exists (
      select 1 from ${promotionProductsTable}
      where ${promotionProductsTable.promotionId} = ${promotionsTable.id}
        and ${promotionProductsTable.productId} = ${productsTable.id}
    )
    or exists (
      select 1 from ${promotionCategoriesTable}
      where ${promotionCategoriesTable.promotionId} = ${promotionsTable.id}
        and ${promotionCategoriesTable.categoryId} = ${productsTable.categoryId}
    )
  )`;
}

export function catalogHasActivePromotionSql(types: PromotionType[] = []) {
  const typeFilter = types.length > 0 ? inArray(promotionsTable.type, types) : undefined;
  return sql<boolean>`exists (
    select 1 from ${promotionsTable}
    where ${and(
      eq(promotionsTable.isActive, true),
      lte(promotionsTable.startsAt, new Date()),
      or(isNull(promotionsTable.endsAt), gt(promotionsTable.endsAt, new Date())),
      activeTargetSql(),
      typeFilter,
    )}
  )`;
}

function catalogActivePercentageSql() {
  return sql<number | null>`(
    select ${promotionsTable.percentage}
    from ${promotionsTable}
    where ${promotionsTable.isActive} = true
      and ${promotionsTable.type} = 'PERCENTAGE_DISCOUNT'
      and ${promotionsTable.startsAt} <= now()
      and (${promotionsTable.endsAt} is null or ${promotionsTable.endsAt} > now())
      and ${activeTargetSql()}
    order by ${promotionsTable.id}
    limit 1
  )`;
}

export function catalogEffectivePriceSql() {
  const percentage = catalogActivePercentageSql();
  return sql<number>`case
    when ${percentage} is not null
      then floor((${productsTable.price} * (100 - ${percentage}) + 50) / 100)
    else ${productsTable.price}
  end`;
}

export async function findPromotions() {
  const [promotions, productTargets, categoryTargets, usages] = await Promise.all([
    db.select().from(promotionsTable).orderBy(descStartsAt(), asc(promotionsTable.id)),
    db.select({ promotionId: promotionProductsTable.promotionId, productId: promotionProductsTable.productId })
      .from(promotionProductsTable),
    db.select({ promotionId: promotionCategoriesTable.promotionId, categoryId: promotionCategoriesTable.categoryId })
      .from(promotionCategoriesTable),
    db.select({
      promotionId: onlineOrderItemsTable.promotionId,
      usageCount: sql<number>`count(*)::integer`,
    })
      .from(onlineOrderItemsTable)
      .where(sql`${onlineOrderItemsTable.promotionId} is not null`)
      .groupBy(onlineOrderItemsTable.promotionId),
  ]);

  return promotions.map((promotion) => ({
    ...promotion,
    productIds: productTargets.filter((target) => target.promotionId === promotion.id).map((target) => target.productId),
    categoryIds: categoryTargets.filter((target) => target.promotionId === promotion.id).map((target) => target.categoryId),
    usageCount: usages.find((usage) => usage.promotionId === promotion.id)?.usageCount ?? 0,
  }));
}

function descStartsAt() {
  return sql`${promotionsTable.startsAt} desc`;
}

export async function findPromotionById(id: number) {
  const [promotion] = await db.select().from(promotionsTable).where(eq(promotionsTable.id, id)).limit(1);
  if (!promotion) return null;
  const [productTargets, categoryTargets, [{ usageCount = 0 } = { usageCount: 0 }]] = await Promise.all([
    db.select({ productId: promotionProductsTable.productId }).from(promotionProductsTable)
      .where(eq(promotionProductsTable.promotionId, id)),
    db.select({ categoryId: promotionCategoriesTable.categoryId }).from(promotionCategoriesTable)
      .where(eq(promotionCategoriesTable.promotionId, id)),
    db.select({ usageCount: sql<number>`count(*)::integer` }).from(onlineOrderItemsTable)
      .where(eq(onlineOrderItemsTable.promotionId, id)),
  ]);
  return {
    ...promotion,
    productIds: productTargets.map((target) => target.productId),
    categoryIds: categoryTargets.map((target) => target.categoryId),
    usageCount: Number(usageCount || 0),
  };
}

export async function findPromotionTargets() {
  const [products, categories] = await Promise.all([
    db.select({
      id: productsTable.id,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      status: productsTable.status,
    })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .orderBy(asc(productsTable.name), asc(productsTable.id)),
    db.select({ id: categoriesTable.id, name: categoriesTable.name })
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.name), asc(categoriesTable.id)),
  ]);
  return { products, categories };
}

export async function findPromotionScopesTx(tx: DbTransaction, excludeId?: number) {
  const promotionConditions = [eq(promotionsTable.isActive, true)];
  if (excludeId) promotionConditions.push(ne(promotionsTable.id, excludeId));
  const promotions = await tx.select({
      id: promotionsTable.id,
      name: promotionsTable.name,
      startsAt: promotionsTable.startsAt,
      endsAt: promotionsTable.endsAt,
    }).from(promotionsTable).where(and(...promotionConditions));
  const productTargets = await tx.select().from(promotionProductsTable);
  const categoryTargets = await tx.select().from(promotionCategoriesTable);
  const products = await tx.select({ id: productsTable.id, name: productsTable.name, categoryId: productsTable.categoryId, status: productsTable.status })
    .from(productsTable);
  return { promotions, productTargets, categoryTargets, products };
}

export async function validateTargetRecordsTx(
  tx: DbTransaction,
  productIds: number[],
  categoryIds: number[],
) {
  const products = productIds.length
    ? await tx.select({ id: productsTable.id, name: productsTable.name, categoryId: productsTable.categoryId, status: productsTable.status })
      .from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const categories = categoryIds.length
    ? await tx.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable)
      .where(inArray(categoriesTable.id, categoryIds))
    : [];
  return { products, categories };
}

export async function insertPromotionTx(
  tx: DbTransaction,
  data: PromotionInput & { userId: number },
) {
  const values: NewPromotion = {
    name: data.name,
    type: data.type,
    isActive: data.isActive,
    percentage: data.percentage,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    createdByUserId: data.userId,
    updatedByUserId: data.userId,
  };
  const [promotion] = await tx.insert(promotionsTable).values(values).returning();
  await replacePromotionTargetsTx(tx, promotion.id, data.productIds, data.categoryIds);
  return promotion;
}

export async function updatePromotionTx(
  tx: DbTransaction,
  id: number,
  data: PromotionInput & { userId: number },
) {
  const [promotion] = await tx.update(promotionsTable).set({
    name: data.name,
    type: data.type,
    isActive: data.isActive,
    percentage: data.percentage,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    updatedByUserId: data.userId,
    updatedAt: new Date(),
  }).where(eq(promotionsTable.id, id)).returning();
  if (!promotion) return null;
  await replacePromotionTargetsTx(tx, id, data.productIds, data.categoryIds);
  return promotion;
}

async function replacePromotionTargetsTx(
  tx: DbTransaction,
  promotionId: number,
  productIds: number[],
  categoryIds: number[],
) {
  await tx.delete(promotionProductsTable).where(eq(promotionProductsTable.promotionId, promotionId));
  await tx.delete(promotionCategoriesTable).where(eq(promotionCategoriesTable.promotionId, promotionId));
  if (productIds.length) {
    await tx.insert(promotionProductsTable).values(productIds.map((productId) => ({ promotionId, productId })));
  }
  if (categoryIds.length) {
    await tx.insert(promotionCategoriesTable).values(categoryIds.map((categoryId) => ({ promotionId, categoryId })));
  }
}

export async function setPromotionStatusTx(
  tx: DbTransaction,
  id: number,
  isActive: boolean,
  userId: number,
) {
  const [promotion] = await tx.update(promotionsTable).set({
    isActive,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(promotionsTable.id, id)).returning();
  return promotion ?? null;
}

export async function findPromotionForUpdateTx(tx: DbTransaction, id: number) {
  const [promotion] = await tx.select().from(promotionsTable)
    .where(eq(promotionsTable.id, id)).limit(1).for("update");
  if (!promotion) return null;
  const products = await tx.select({ productId: promotionProductsTable.productId }).from(promotionProductsTable)
    .where(eq(promotionProductsTable.promotionId, id));
  const categories = await tx.select({ categoryId: promotionCategoriesTable.categoryId }).from(promotionCategoriesTable)
    .where(eq(promotionCategoriesTable.promotionId, id));
  const [{ usageCount = 0 } = { usageCount: 0 }] = await tx
    .select({ usageCount: sql<number>`count(*)::integer` })
    .from(onlineOrderItemsTable)
    .where(eq(onlineOrderItemsTable.promotionId, id));
  return {
    ...promotion,
    productIds: products.map((target) => target.productId),
    categoryIds: categories.map((target) => target.categoryId),
    usageCount: Number(usageCount || 0),
  };
}

export async function deletePromotionTx(tx: DbTransaction, id: number) {
  const [deleted] = await tx.delete(promotionsTable).where(eq(promotionsTable.id, id)).returning({ id: promotionsTable.id });
  return deleted ?? null;
}
