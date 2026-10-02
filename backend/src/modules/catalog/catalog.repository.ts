import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  categoriesTable,
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
} from "../../db/schema/index.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "../inventory/stockAvailability.repository.js";
import { findProductImagesByProductIds } from "../productImages/productImages.repository.js";
import { presentProductImage } from "../productImages/productImages.presenter.js";
import { findProductById, findProducts } from "../products/products.repository.js";
import type { CatalogQuery } from "./catalog.validation.js";
import {
  catalogEffectivePriceSql,
  catalogHasActivePromotionSql,
  findActivePromotionsForProducts,
} from "../promotions/promotions.repository.js";
import {
  calculatePromotionPricing,
  presentPublicPromotion,
  type ApplicablePromotion,
} from "../promotions/promotionPricing.js";

function attachPromotion<T extends { id: number; price: string; inStoreOnly: boolean }>(
  product: T,
  promotion: ApplicablePromotion | null,
) {
  const pricing = calculatePromotionPricing(Number(product.price), 1, promotion);
  return {
    ...product,
    promotionalPrice: pricing.promotionalUnitPrice === null
      ? null
      : pricing.promotionalUnitPrice.toFixed(2),
    promotion: presentPublicPromotion(promotion),
  };
}

function toCatalogProduct(
  product: NonNullable<Awaited<ReturnType<typeof findProductById>>>,
  reservedQuantity: number,
  promotion: ApplicablePromotion | null,
) {
  return attachPromotion({
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    name: product.name,
    brand: product.brand,
    description: product.description,
    price: product.price,
    unitMeasure: product.unitMeasure,
    inStoreOnly: product.inStoreOnly,
    currentStock: product.currentStock,
    reservedQuantity,
    availableStock: calculateAvailableStock(product.currentStock, reservedQuantity),
    images: product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      position: image.position,
      isPrimary: image.isPrimary,
    })),
  }, product.inStoreOnly ? null : promotion);
}

export async function findCatalogProducts() {
  const products = await findProducts(false);
  const reservedByProduct = await findActiveReservedQuantities(
    db,
    products.map((product) => product.id),
  );
  const promotionsByProduct = await findActivePromotionsForProducts(products.map((product) => product.id));
  return products.map((product) => toCatalogProduct(
    product,
    reservedByProduct.get(product.id) || 0,
    promotionsByProduct.get(product.id) ?? null,
  ));
}

function activeReservations() {
  return db
    .select({
      productId: onlineOrderItemsTable.productId,
      reservedQuantity: sql<number>`sum(${onlineOrderItemsTable.quantity})::integer`.as("reserved_quantity"),
    })
    .from(onlineOrderItemsTable)
    .innerJoin(onlineOrdersTable, eq(onlineOrderItemsTable.orderId, onlineOrdersTable.id))
    .where(and(
      eq(onlineOrdersTable.status, "PENDING_PAYMENT"),
      gt(onlineOrdersTable.reservationExpiresAt, sql`now() - interval '2 minutes'`),
    ))
    .groupBy(onlineOrderItemsTable.productId)
    .as("active_catalog_reservations");
}

function escapedSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

async function findCatalogFacets() {
  const normalizedBrand = sql<string>`lower(regexp_replace(btrim(coalesce(${productsTable.brand}, '')), '\\s+', ' ', 'g'))`;
  const [categories, brands] = await Promise.all([
    db
      .selectDistinct({ id: categoriesTable.id, name: categoriesTable.name })
      .from(categoriesTable)
      .innerJoin(productsTable, and(
        eq(productsTable.categoryId, categoriesTable.id),
        eq(productsTable.status, true),
      ))
      .orderBy(asc(categoriesTable.name), asc(categoriesTable.id)),
    db
      .select({
        value: normalizedBrand,
        label: sql<string>`min(btrim(${productsTable.brand}))`,
      })
      .from(productsTable)
      .where(and(
        eq(productsTable.status, true),
        sql`${productsTable.brand} is not null`,
        sql`length(btrim(${productsTable.brand})) > 0`,
      ))
      .groupBy(normalizedBrand)
      .orderBy(normalizedBrand),
  ]);

  return { categories, brands };
}

export async function findCatalogProductsPage(filters: CatalogQuery) {
  const reservations = activeReservations();
  const reservedQuantity = sql<number>`coalesce(${reservations.reservedQuantity}, 0)::integer`;
  const availableStock = sql<number>`greatest(${productsTable.currentStock} - coalesce(${reservations.reservedQuantity}, 0), 0)::integer`;
  const normalizedBrand = sql<string>`lower(regexp_replace(btrim(coalesce(${productsTable.brand}, '')), '\\s+', ' ', 'g'))`;
  const promotionEffectivePrice = catalogEffectivePriceSql();
  const effectivePrice = sql<number>`case when ${productsTable.inStoreOnly} then ${productsTable.price} else ${promotionEffectivePrice} end`;
  const activePromotion = catalogHasActivePromotionSql(filters.promotionTypes);
  const hasActivePromotion = sql<boolean>`${productsTable.inStoreOnly} = false and ${activePromotion}`;
  const conditions = [eq(productsTable.status, true)];

  if (filters.search) {
    const pattern = escapedSearchPattern(filters.search);
    const searchCondition = or(
      ilike(productsTable.name, pattern),
      ilike(categoriesTable.name, pattern),
      ilike(productsTable.description, pattern),
      ilike(productsTable.brand, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (filters.categoryId !== null) conditions.push(eq(productsTable.categoryId, filters.categoryId));
  if (filters.brand) conditions.push(sql`${normalizedBrand} = ${filters.brand}`);
  if (filters.availability === "in-stock") conditions.push(sql`${availableStock} > 0`);
  if (filters.minPrice !== null) conditions.push(sql`${effectivePrice} >= ${filters.minPrice}`);
  if (filters.maxPrice !== null) conditions.push(sql`${effectivePrice} <= ${filters.maxPrice}`);
  if (filters.offers || filters.promotionTypes.length > 0) conditions.push(hasActivePromotion);

  const where = and(...conditions);
  const [{ totalItems = 0 } = { totalItems: 0 }] = await db
    .select({ totalItems: sql<number>`count(*)::integer` })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(reservations, eq(reservations.productId, productsTable.id))
    .where(where);

  const total = Number(totalItems || 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);
  const page = totalPages === 0 ? 1 : Math.min(filters.page, totalPages);
  const orderBy = filters.sort === "price-asc"
    ? [asc(effectivePrice), asc(productsTable.id)]
    : filters.sort === "price-desc"
      ? [desc(effectivePrice), asc(productsTable.id)]
      : filters.sort === "name-desc"
        ? [desc(sql`lower(${productsTable.name})`), asc(productsTable.id)]
        : [asc(sql`lower(${productsTable.name})`), asc(productsTable.id)];

  const rows = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      name: productsTable.name,
      brand: productsTable.brand,
      description: productsTable.description,
      price: productsTable.price,
      unitMeasure: productsTable.unitMeasure,
      inStoreOnly: productsTable.inStoreOnly,
      currentStock: productsTable.currentStock,
      reservedQuantity,
      availableStock,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(reservations, eq(reservations.productId, productsTable.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(filters.limit)
    .offset((page - 1) * filters.limit);

  const images = await findProductImagesByProductIds(rows.map((product) => product.id));
  const promotionsByProduct = await findActivePromotionsForProducts(rows.map((product) => product.id));
  type CatalogImage = (typeof images)[number] & { imageUrl: string };
  const imagesByProduct = new Map<number, CatalogImage[]>();
  for (const image of images) {
    const current = imagesByProduct.get(image.productId) ?? [];
    current.push(presentProductImage(image));
    imagesByProduct.set(image.productId, current);
  }

  const [facets] = await Promise.all([findCatalogFacets()]);
  return {
    items: rows.map((product) => attachPromotion({
      ...product,
      reservedQuantity: Number(product.reservedQuantity || 0),
      availableStock: Number(product.availableStock || 0),
      images: imagesByProduct.get(product.id)?.map((image) => ({
        id: image.id,
        imageUrl: image.imageUrl,
        position: image.position,
        isPrimary: image.isPrimary,
      })) ?? [],
    }, product.inStoreOnly ? null : promotionsByProduct.get(product.id) ?? null)),
    page,
    pageSize: filters.limit,
    totalItems: total,
    totalPages,
    facets,
  };
}

export async function findCatalogProductById(id: number) {
  const product = await findProductById(id, false);
  if (!product) return null;
  const reservedByProduct = await findActiveReservedQuantities(db, [product.id]);
  const promotionsByProduct = await findActivePromotionsForProducts([product.id]);
  return toCatalogProduct(
    product,
    reservedByProduct.get(product.id) || 0,
    promotionsByProduct.get(product.id) ?? null,
  );
}
