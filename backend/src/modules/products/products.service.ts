import { db, type DbTransaction } from "../../db/index.js";
import { eq, sql } from "drizzle-orm";
import { productsTable } from "../../db/schema/index.js";
import { assignVariant, FamilyError, getFamily, productHasHistory } from "../productFamilies/productFamilies.service.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "../inventory/stockAvailability.repository.js";
import {
  createProductTx,
  deleteProductById,
  findProductByBarcode,
  findProductByCategoryAndName,
  findProductById,
  findProducts,
  updateProductByIdTx,
} from "./products.repository.js";
import type { EditProductBody, ProductBody } from "./products.validation.js";
import { assertProductPromotionCompatibilityTx } from "../promotions/promotions.service.js";
import { PromotionError } from "../promotions/promotions.service.js";

export class ProductError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProductError";
  }
}

async function attachAvailableStock<T extends { id: number; currentStock: number }>(products: T[]) {
  const reservedByProduct = await findActiveReservedQuantities(
    db,
    products.map((product) => product.id),
  );

  return products.map((product) => {
    const reservedQuantity = reservedByProduct.get(product.id) || 0;
    return {
      ...product,
      reservedQuantity,
      availableStock: calculateAvailableStock(product.currentStock, reservedQuantity),
    };
  });
}

export async function getProductsService(includeInactive = false) {
  return attachAvailableStock(await findProducts(includeInactive));
}

export async function getProductByIdService(id: number, includeInactive = false) {
  const product = await findProductById(id, includeInactive);
  if (!product) throw new Error("Producto no encontrado");
  return (await attachAvailableStock([product]))[0];
}

export async function getProductByBarcodeService(barcode: string) {
  const product = await findProductByBarcode(barcode);
  if (!product) throw new ProductError("No existe un producto asociado a este codigo de barra", 404);
  if (!product.status) throw new ProductError("El producto asociado a este codigo de barra esta desactivado", 409);
  return (await attachAvailableStock([product]))[0];
}

export async function createProductService(data: ProductBody, actorId: number | null = null) {
  const duplicate = await findProductByCategoryAndName(data.categoryId, data.name);
  if (duplicate) {
    throw new ProductError("Ya existe un producto con ese nombre en la categoria seleccionada", 409);
  }

  if (data.barcode && await findProductByBarcode(data.barcode)) {
    throw new ProductError("El codigo de barra ya esta asociado a otro producto", 409);
  }

  let createdId: number;
  try {
    createdId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
      const { familyId, variantOptionIds, associationReason, ...base } = data;
      const product = await createProductTx(tx, base);
      if (familyId || variantOptionIds?.length) await assignVariant(tx, product.id, familyId ?? null, variantOptionIds ?? [], actorId, associationReason ?? "Creación de variante", true);
      await assertProductPromotionCompatibilityTx(tx, {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        status: product.status,
      });
      return product.id;
    });
  } catch (error) {
    if (error instanceof PromotionError || error instanceof FamilyError) {
      throw new ProductError(error.message, error.statusCode);
    }
    throw error;
  }
  return findProductById(createdId, true);
}

export function parseProductRevision(value: string | undefined) {
  if (value === undefined) return undefined;
  let revision: unknown;
  try { revision = JSON.parse(value); } catch { throw new ProductError("Revisión de producto inválida", 400); }
  if (typeof revision !== "string" || !Number.isFinite(Date.parse(revision)) || new Date(revision).toISOString() !== revision) throw new ProductError("Revisión de producto inválida", 400);
  return revision;
}
function assertProductRevision(current: Date | null, expected: string | undefined) {
  if (expected !== undefined && current?.getTime() !== Date.parse(expected)) throw new ProductError("El producto cambió. Recarga su información antes de modificar el estado; no se aplicaron cambios.", 409);
}
export async function editProductService(id: number, data: EditProductBody, actorId: number | null = null, expectedUpdatedAt?: string) {
  const currentProduct = await findProductById(id, true);
  if (!currentProduct) throw new ProductError("Producto no encontrado", 404);

  const categoryId = data.categoryId ?? currentProduct.categoryId;
  const name = data.name ?? currentProduct.name;
  const duplicate = await findProductByCategoryAndName(categoryId, name, id);

  if (duplicate) {
    throw new ProductError("Ya existe un producto con ese nombre en la categoria seleccionada", 409);
  }

  if (data.barcode && await findProductByBarcode(data.barcode, id)) {
    throw new ProductError("El codigo de barra ya esta asociado a otro producto", 409);
  }

  try {
    await db.transaction(async (tx) => editProductInTransaction(tx, id, data, actorId, expectedUpdatedAt));
  } catch (error) {
    if (error instanceof PromotionError || error instanceof FamilyError) throw new ProductError(error.message, error.statusCode);
    throw error;
  }
  return findProductById(id, true);
}

export async function editProductInTransaction(tx: DbTransaction, id: number, data: EditProductBody, actorId: number | null, expectedUpdatedAt?: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
      const [locked] = await tx.select().from(productsTable).where(eq(productsTable.id, id)).for("update");
      if (!locked) throw new ProductError("Producto no encontrado", 404);
      assertProductRevision(locked.updatedAt, expectedUpdatedAt);
      const { familyId, variantOptionIds, associationReason, ...base } = data;
      const categoryId = data.categoryId ?? locked.categoryId;
      if (base.name !== undefined && base.name !== locked.name) throw new ProductError("Utiliza Corregir nombre para una modificación independiente y auditada", 409);
      if (await productHasHistory(id, tx) && ((base.name !== undefined && base.name !== locked.name)
        || (base.brand !== undefined && base.brand !== locked.brand)
        || (base.unitMeasure !== undefined && base.unitMeasure !== locked.unitMeasure))) {
        throw new ProductError("Producto con historial: conserve nombre, marca y unidad; cree otro producto para otro artículo", 409);
      }
      const finalFamilyId = familyId === undefined ? locked.familyId : familyId;
      if (finalFamilyId) {
        const family = await getFamily(finalFamilyId, tx);
        const nextBrand = base.brand === undefined ? locked.brand : base.brand;
        if (family.categoryId !== categoryId || (family.brand ?? "").trim().toLowerCase() !== (nextBrand ?? "").trim().toLowerCase()) throw new FamilyError("Categoría y marca incompatibles con la familia");
      }
      const prospective = {
        productId: id,
        productName: data.name ?? locked.name,
        categoryId,
        status: data.status ?? locked.status,
      };
      await assertProductPromotionCompatibilityTx(tx, prospective);
      if (Object.keys(base).length && !await updateProductByIdTx(tx, id, base)) {
        throw new ProductError("Producto no encontrado", 404);
      }
      if (familyId !== undefined || variantOptionIds !== undefined) {
        const ids = variantOptionIds ?? (locked.variantKey ? locked.variantKey.split(",").map(Number) : []);
        await assignVariant(tx, id, finalFamilyId, ids, actorId, associationReason ?? "");
      }
}

export async function deleteProductService(id: number, expectedUpdatedAt?: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [current] = await tx.select().from(productsTable).where(eq(productsTable.id, id)).for("update");
    if (!current) return false;
    assertProductRevision(current.updatedAt, expectedUpdatedAt);
    return Boolean(await deleteProductById(id, tx));
  });
}
