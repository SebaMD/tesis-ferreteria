import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { clientProductFavoritesTable as favorites, productsTable } from "../../db/schema/index.js";
import { findCatalogProducts } from "../catalog/catalog.repository.js";

export async function findClientFavorites(clientId: number) {
  const rows = await db.select({ productId: favorites.productId }).from(favorites)
    .where(eq(favorites.clientId, clientId));
  if (!rows.length) return [];
  const ids = new Set(rows.map((row) => row.productId));
  // Reuse the public DTO, active-product policy and existing reservation calculation.
  return (await findCatalogProducts()).filter((product) => ids.has(product.id));
}

export async function addClientFavorite(clientId: number, productId: number) {
  const [active] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.status, true))).limit(1);
  if (!active) return false;
  await db.insert(favorites).select(db.select({
    clientId: sql<number>`${clientId}`.as("client_id"),
    productId: productsTable.id,
    createdAt: sql<Date>`now()`.as("created_at"),
  }).from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.status, true))))
    .onConflictDoNothing();
  return true;
}

export async function removeClientFavorite(clientId: number, productId: number) {
  await db.delete(favorites).where(and(eq(favorites.clientId, clientId), eq(favorites.productId, productId)));
}
