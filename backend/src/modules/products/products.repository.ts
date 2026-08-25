import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { categoriesTable, productsTable, type NewProduct } from "../../db/schema/index.js";
import { findProductImagesByProductIds } from "../productImages/productImages.repository.js";
import { presentProductImage } from "../productImages/productImages.presenter.js";

const productColumns = {
    id: productsTable.id,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    name: productsTable.name,
    barcode: productsTable.barcode,
    description: productsTable.description,
    price: productsTable.price,
    unitMeasure: productsTable.unitMeasure,
    currentStock: productsTable.currentStock,
    minimumStock: productsTable.minimumStock,
    status: productsTable.status,
    createdAt: productsTable.createdAt,
    updatedAt: productsTable.updatedAt,
};

async function attachProductImages<T extends { id: number }>(products: T[]) {
    const images = await findProductImagesByProductIds(products.map((product) => product.id));
    type PresentedImage = (typeof images)[number] & { imageUrl: string };
    const imagesByProduct = new Map<number, PresentedImage[]>();

    for (const image of images) {
        const currentImages = imagesByProduct.get(image.productId) ?? [];
        currentImages.push(presentProductImage(image));
        imagesByProduct.set(image.productId, currentImages);
    }

    return products.map((product) => ({
        ...product,
        images: imagesByProduct.get(product.id) ?? [],
    }));
}

export async function findProducts(includeInactive = false) {
    const query = db.select(productColumns).from(productsTable).innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id));
    const products = includeInactive ? await query : await query.where(eq(productsTable.status, true));
    return attachProductImages(products);
}

export async function findProductById(id: number, includeInactive = false) {
    const conditions = [eq(productsTable.id, id)];
    if (!includeInactive) conditions.push(eq(productsTable.status, true));

    const [product] = await db
        .select(productColumns)
        .from(productsTable)
        .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
        .where(and(...conditions))
        .limit(1);
    if (!product) return null;
    const [productWithImages] = await attachProductImages([product]);
    return productWithImages;
}

export async function findProductByCategoryAndName(categoryId: number, name: string, excludeId?: number) {
    const conditions = [
        eq(productsTable.categoryId, categoryId),
        sql`lower(${productsTable.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
        conditions.push(ne(productsTable.id, excludeId));
    }

    const [product] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(...conditions))
        .limit(1);

    if (!product) return null;
    const [productWithImages] = await attachProductImages([product]);
    return productWithImages;
}

export async function findProductByBarcode(barcode: string, excludeId?: number) {
    const conditions = [eq(productsTable.barcode, barcode)];

    if (excludeId !== undefined) {
        conditions.push(ne(productsTable.id, excludeId));
    }

    const [product] = await db
        .select(productColumns)
        .from(productsTable)
        .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
        .where(and(...conditions))
        .limit(1);

    return product ?? null;
}

export async function createProduct(data: NewProduct) {
    const [product] = await db.insert(productsTable).values(data).returning({ id: productsTable.id });
    return findProductById(product.id);
}

export async function updateProductById(id: number, data: Partial<NewProduct>) {
    const [product] = await db
        .update(productsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(productsTable.id, id))
        .returning({ id: productsTable.id });
    if (!product) return null;
    return findProductById(product.id, true);
}

export async function deleteProductById(id: number) {
    const [product] = await db
        .update(productsTable)
        .set({
            status: false,
            updatedAt: new Date(),
        })
        .where(eq(productsTable.id, id))
        .returning({ id: productsTable.id });
    return product ?? null;
}

export async function findProductStockById(tx: DbTransaction, id: number) {
    const [product] = await tx
        .select({
            id: productsTable.id,
            name: productsTable.name,
            currentStock: productsTable.currentStock,
            minimumStock: productsTable.minimumStock,
            status: productsTable.status,
        })
        .from(productsTable)
        .where(eq(productsTable.id, id))
        .limit(1)
        .for("update");

    return product ?? null;
}

export async function findProductsForSale(tx: DbTransaction, ids: number[]) {
    return tx
        .select({
            id: productsTable.id,
            name: productsTable.name,
            price: productsTable.price,
            status: productsTable.status,
        })
        .from(productsTable)
        .where(inArray(productsTable.id, ids));
}

export async function increaseProductStock(
    tx: DbTransaction,
    productId: number,
    quantity: number,
    allowInactive = false,
) {
    const [product] = await tx
        .update(productsTable)
        .set({
            currentStock: sql`${productsTable.currentStock} + ${quantity}`,
            updatedAt: new Date(),
        })
        .where(allowInactive ? eq(productsTable.id, productId) : and(eq(productsTable.id, productId), eq(productsTable.status, true)))
        .returning({ id: productsTable.id, currentStock: productsTable.currentStock });

    return product ?? null;
}

export async function decreaseProductStock(
    tx: DbTransaction,
    productId: number,
    quantity: number,
    allowInactive = false,
) {
    const [product] = await tx
        .update(productsTable)
        .set({
            currentStock: sql`${productsTable.currentStock} - ${quantity}`,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(productsTable.id, productId),
                allowInactive ? undefined : eq(productsTable.status, true),
                gte(productsTable.currentStock, quantity),
            ),
        )
        .returning({ id: productsTable.id, currentStock: productsTable.currentStock });

    return product ?? null;
}

export async function setProductStock(tx: DbTransaction, productId: number, quantity: number) {
    const [product] = await tx
        .update(productsTable)
        .set({ currentStock: quantity, updatedAt: new Date() })
        .where(and(eq(productsTable.id, productId), eq(productsTable.status, true)))
        .returning({ id: productsTable.id, currentStock: productsTable.currentStock });

    return product ?? null;
}
