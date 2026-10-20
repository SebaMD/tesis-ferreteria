import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  categoriesTable,
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
  productFamiliesTable,
} from "../../db/schema/index.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "../inventory/stockAvailability.repository.js";
import { findProductImagesByProductIds } from "../productImages/productImages.repository.js";
import { presentProductImage } from "../productImages/productImages.presenter.js";
import { findProductById, findProducts, findProductsByFamilyId } from "../products/products.repository.js";
import type { CatalogQuery } from "./catalog.validation.js";
import { getFamily, FamilyError } from "../productFamilies/productFamilies.service.js";
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
    familyId: product.familyId,
    familyName: product.familyName,
    variantValues: product.variantValues,
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
  const onlineEligible = sql`${productsTable.inStoreOnly} = false and ${availableStock} > 0`;
  const conditions = [eq(productsTable.status, true)];

  if (filters.search) {
    const pattern = escapedSearchPattern(filters.search);
    const searchCondition = or(
      ilike(productsTable.name, pattern),
      ilike(categoriesTable.name, pattern),
      ilike(productsTable.description, pattern),
      ilike(productsTable.brand, pattern),
      ilike(productFamiliesTable.name, pattern),
      sql`exists(select 1 from product_variant_values v join family_attribute_options o on o.id=v.option_id where v.product_id=${productsTable.id} and o.label ilike ${pattern})`,
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
  // Filter concrete SKUs first, then group BEFORE counting, sorting and pagination.
  const groupKey = sql<string>`case when ${productsTable.familyId} is null then 'p:' || ${productsTable.id} else 'f:' || ${productsTable.familyId} end`;
  const groupName = sql<string>`coalesce(${productFamiliesTable.name}, ${productsTable.name})`;
  const grouped = db.select({
    groupKey: groupKey.as("group_key"), name: groupName.as("group_name"),
    familyId: productsTable.familyId,
    representativeId: sql<number>`coalesce(min(${productsTable.id}) filter (where ${onlineEligible}), min(${productsTable.id}))`.as("representative_id"),
    fromPrice: sql<string>`min(${effectivePrice})`.as("from_price"),
    maxPrice: sql<string>`max(${effectivePrice})`.as("max_price"),
    variantCount: sql<number>`count(*)::integer`.as("variant_count"),
    hasOffers: sql<boolean>`bool_or(${hasActivePromotion})`.as("has_offers"),
    onlineFromPrice: sql<string | null>`min(${effectivePrice}) filter (where ${onlineEligible})`.as("online_from_price"),
    onlineMaxPrice: sql<string | null>`max(${effectivePrice}) filter (where ${onlineEligible})`.as("online_max_price"),
    onlineVariantCount: sql<number>`count(*) filter (where ${onlineEligible})::integer`.as("online_variant_count"),
    allInStoreOnly: sql<boolean>`bool_and(${productsTable.inStoreOnly})`.as("all_in_store_only"),
    onlineHasOffers: sql<boolean>`bool_or(${hasActivePromotion} and ${onlineEligible})`.as("online_has_offers"),
  })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(productFamiliesTable, eq(productsTable.familyId, productFamiliesTable.id))
    .leftJoin(reservations, eq(reservations.productId, productsTable.id))
    .where(where).groupBy(groupKey, groupName, productsTable.familyId).as("catalog_groups");
  const [{ totalItems }] = await db.select({ totalItems: sql<number>`count(*)::integer` }).from(grouped);

  const total = Number(totalItems || 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);
  const page = totalPages === 0 ? 1 : Math.min(filters.page, totalPages);
  const orderBy = filters.sort === "price-asc"
    ? [asc(grouped.fromPrice), asc(grouped.groupKey)]
    : filters.sort === "price-desc"
      ? [desc(grouped.fromPrice), asc(grouped.groupKey)]
      : filters.sort === "name-desc"
        ? [desc(sql`lower(${grouped.name})`), asc(grouped.groupKey)]
        : [asc(sql`lower(${grouped.name})`), asc(grouped.groupKey)];

  const pageGroups = db.select().from(grouped).orderBy(...orderBy)
    .limit(filters.limit).offset((page - 1) * filters.limit).as("page_groups");

  const rows = await db
    .select({
      id: productsTable.id,
      familyId: productsTable.familyId,
      familyName: productFamiliesTable.name,
      groupName: pageGroups.name,
      fromPrice: pageGroups.fromPrice,
      maxPrice: pageGroups.maxPrice,
      variantCount: pageGroups.variantCount,
      hasOffers: pageGroups.hasOffers,
      onlineFromPrice: pageGroups.onlineFromPrice,
      onlineMaxPrice: pageGroups.onlineMaxPrice,
      onlineVariantCount: pageGroups.onlineVariantCount,
      allInStoreOnly: pageGroups.allInStoreOnly,
      onlineHasOffers: pageGroups.onlineHasOffers,
      attributeNames: sql<string[]>`coalesce((select json_agg(a.name order by a.position, a.id) from family_attributes a where a.family_id=${productsTable.familyId}), '[]'::json)`,
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
    .innerJoin(pageGroups, eq(productsTable.id, pageGroups.representativeId))
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(productFamiliesTable, eq(productsTable.familyId, productFamiliesTable.id))
    .leftJoin(reservations, eq(reservations.productId, productsTable.id))
    .orderBy(...(filters.sort === "price-asc" ? [asc(pageGroups.fromPrice), asc(pageGroups.groupKey)]
      : filters.sort === "price-desc" ? [desc(pageGroups.fromPrice), asc(pageGroups.groupKey)]
      : filters.sort === "name-desc" ? [desc(sql`lower(${pageGroups.name})`), asc(pageGroups.groupKey)]
      : [asc(sql`lower(${pageGroups.name})`), asc(pageGroups.groupKey)]));

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
    items: rows.map((product) => {
      const images = imagesByProduct.get(product.id)?.map((image) => ({ id: image.id, imageUrl: image.imageUrl, position: image.position, isPrimary: image.isPrimary })) ?? [];
      if (product.familyId !== null) return {
        kind: "family" as const, id: product.familyId, familyId: product.familyId,
        name: product.groupName, brand: product.brand, categoryId: product.categoryId,
        categoryName: product.categoryName, representativeProductId: product.id,
        fromPrice: product.fromPrice, maxPrice: product.maxPrice, variantCount: product.variantCount, images,
        hasOffers: product.hasOffers,
        onlineFromPrice: product.onlineFromPrice, onlineMaxPrice: product.onlineMaxPrice,
        onlineVariantCount: product.onlineVariantCount, allInStoreOnly: product.allInStoreOnly,
        onlineHasOffers: product.onlineHasOffers,
        attributeNames: product.attributeNames,
        imageCaption: product.name,
      };
      const { groupName: _groupName, fromPrice: _fromPrice, maxPrice: _maxPrice, variantCount: _variantCount, hasOffers: _hasOffers,
        onlineFromPrice: _onlineFrom, onlineMaxPrice: _onlineMax, onlineVariantCount: _onlineCount,
        allInStoreOnly: _allInStore, onlineHasOffers: _onlineOffers, attributeNames: _attributes, ...sku } = product;
      return attachPromotion({
      ...sku,
      kind: "product" as const,
      reservedQuantity: Number(product.reservedQuantity || 0),
      availableStock: Number(product.availableStock || 0),
      images: imagesByProduct.get(product.id)?.map((image) => ({
        id: image.id,
        imageUrl: image.imageUrl,
        position: image.position,
        isPrimary: image.isPrimary,
      })) ?? [],
    }, product.inStoreOnly ? null : promotionsByProduct.get(product.id) ?? null);
    }),
    page,
    pageSize: filters.limit,
    totalItems: total,
    totalPages,
    facets,
  };
}

export async function findCatalogFamilyById(id: number) {
  let family;
  try { family = await getFamily(id); } catch (error) { if (error instanceof FamilyError && error.statusCode === 404) return null; throw error; }
  if (family.archivedAt) return null;
  const members = await findProductsByFamilyId(id);
  if (!members.some((p) => p.status)) return null;
  const activeIds = members.filter((p) => p.status).map((p) => p.id);
  const [reserved, promotions] = await Promise.all([findActiveReservedQuantities(db, activeIds), findActivePromotionsForProducts(activeIds)]);
  const variants = members.map((p) => p.status
    ? { ...toCatalogProduct(p, reserved.get(p.id) ?? 0, promotions.get(p.id) ?? null), status: true }
    : { id: p.id, name: p.name, familyId: id, status: false, variantValues: p.variantValues });
  return { id: family.id, name: family.name, description: family.description, categoryId: family.categoryId, brand: family.brand,
    attributes: family.attributes.map((a) => ({ id: a.id, name: a.name, options: a.options.map((o) => ({ id: o.id, label: o.label })) })), variants };
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
