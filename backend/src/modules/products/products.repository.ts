import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categoriesTable, productsTable, type NewProduct } from "../../db/schema/index.js";

const productColumns = {
    id: productsTable.id,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    name: productsTable.name,
    description: productsTable.description,
    price: productsTable.price,
    unitMeasure: productsTable.unitMeasure,
    currentStock: productsTable.currentStock,
    minimumStock: productsTable.minimumStock,
    status: productsTable.status,
    createdAt: productsTable.createdAt,
    updatedAt: productsTable.updatedAt,
};

export async function findProducts() {
    return db.select(productColumns).from(productsTable).innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id));
}

export async function findProductById(id: number) {
    const [product] = await db
        .select(productColumns)
        .from(productsTable)
        .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
        .where(eq(productsTable.id, id))
        .limit(1);
    return product;
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
    return findProductById(product.id);
}

export async function deleteProductById(id: number) {
    const [product] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning({ id: productsTable.id });
    return product ?? null;
}
