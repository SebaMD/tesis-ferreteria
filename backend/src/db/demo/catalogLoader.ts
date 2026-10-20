import { eq } from "drizzle-orm";
import type { DbTransaction } from "../index.js";
import { categoriesTable, productsTable } from "../schema/index.js";
import { applyInventoryMovement } from "../../modules/inventory/inventory.service.js";
import { DEMO_DISCLAIMER, demoCategories, demoDescription, demoProducts } from "./catalog.js";

// Called only for an empty, explicitly authorized demo database, in the same
// transaction as bootstrap and fixtures. Existing products are never upserted.
export async function loadDemoCatalog(tx: DbTransaction, adminId: number) {
  const categories = await tx.insert(categoriesTable).values(demoCategories.map((category) => ({
    name: category.name,
    description: `${DEMO_DISCLAIMER} Categoría del catálogo de referencia para desarrollo.`,
  }))).returning({ id: categoriesTable.id, name: categoriesTable.name });
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]));
  const products = [];
  for (const article of demoProducts) {
    const [product] = await tx.insert(productsTable).values({
      categoryId: categoryIds.get(article.categoryName)!,
      name: article.name,
      brand: article.brand,
      barcode: null,
      description: demoDescription(article),
      price: String(article.demoPrice),
      unitMeasure: article.unitMeasure,
      minimumStock: article.demoMinimumStock,
      currentStock: 0,
      status: article.demoStatus,
      inStoreOnly: article.demoInStoreOnly,
    }).returning();
    if (article.demoInitialStock > 0) {
      await applyInventoryMovement(tx, {
        productId: product.id,
        userId: adminId,
        movementType: "ENTRY",
        quantity: article.demoInitialStock,
        reason: "DEMO: existencias iniciales ficticias; no corresponden a inventario real de FYF",
        date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        allowInactive: true,
      });
    }
    const [loaded] = await tx.select().from(productsTable).where(eq(productsTable.id, product.id));
    products.push(loaded);
  }
  return products;
}
