import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categoriesTable, type NewCategory } from "../../db/schema/index.js";

export async function findCategories() {
    return db.select().from(categoriesTable);
}

export async function findCategoryById(id: number) {
    const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id)).limit(1);
    return category;
}

export async function createCategory(data: NewCategory) {
    const [category] = await db.insert(categoriesTable).values(data).returning();
    return category;
}

export async function updateCategoryById(id: number, data: Partial<NewCategory>) {
    const [category] = await db
        .update(categoriesTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(categoriesTable.id, id))
        .returning();

    return category ?? null;
}

export async function deleteCategoryById(id: number) {
    const [category] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning({ id: categoriesTable.id });
    return category ?? null;
}
