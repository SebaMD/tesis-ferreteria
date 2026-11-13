import { sql } from "drizzle-orm";
import type { DbTransaction } from "../../db/index.js";
import { assertNoPendingIdentityCommitments, FamilyError, productHasHistory } from "./productFamilies.service.js";
import { validateEditProductBody } from "../products/products.validation.js";

export class UnitChangeError extends FamilyError {
  readonly details: { productId: number; field: "unitMeasure" };
  constructor(productId: number, reason: string) {
    super(`Producto #${productId}: ${reason}`, 409);
    this.details = { productId, field: "unitMeasure" };
  }
}

export function validateUnitEligibilityQuery(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !["unitMeasure", "expectedRevision"].includes(key))
    || typeof input.unitMeasure !== "string" || /[\u0000-\u001f\u007f]/.test(input.unitMeasure)
    || typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) {
    throw new FamilyError("Indique una unidad válida y la revisión de la familia", 400);
  }
  const parsed = validateEditProductBody({ unitMeasure: input.unitMeasure });
  if (!parsed.success) throw new FamilyError(parsed.error, 400);
  return { unitMeasure: parsed.value.unitMeasure!, expectedRevision: input.expectedRevision };
}

// The writer holds the product lock before calling this same policy. The preview
// uses savepoints only to report expected rejections without aborting its read-only transaction.
export async function assertUnitChangeAllowed(tx: DbTransaction, product: { id: number; unitMeasure: string }, unit: string) {
  if (unit === product.unitMeasure) return;
  try {
    await assertNoPendingIdentityCommitments(tx, product.id);
    if (await productHasHistory(product.id, tx)) throw new FamilyError("Tiene ventas, pedidos o movimientos de inventario. Su unidad está protegida.");
  } catch (error) {
    if (error instanceof FamilyError) throw new UnitChangeError(product.id, error.message);
    throw error;
  }
}

export async function previewUnitChange(tx: DbTransaction, product: { id: number; unitMeasure: string }, unit: string) {
  if (unit === product.unitMeasure) return { productId: product.id, unitMeasure: product.unitMeasure, state: "same" as const, reason: "Ya utiliza la unidad seleccionada; no se modificará." };
  try {
    await tx.transaction(nested => assertUnitChangeAllowed(nested, product, unit));
    return { productId: product.id, unitMeasure: product.unitMeasure, state: "eligible" as const, reason: "Sin historial ni compromisos incompatibles al consultar. Se volverá a comprobar al guardar." };
  } catch (error) {
    if (!(error instanceof UnitChangeError)) throw error;
    return { productId: product.id, unitMeasure: product.unitMeasure, state: "blocked" as const, reason: error.message };
  }
}

export async function assertUnitPreviewAdmin(tx: DbTransaction, actorId: number) {
  const actor = await tx.execute<{ allowed: boolean }>(sql`select exists(select 1 from users u join roles r on r.id=u.role_id
    where u.id=${actorId} and u.status='ACTIVE' and r.name='ADMIN') allowed`);
  if (!actor.rows[0]?.allowed) throw new FamilyError("Solo ADMIN puede consultar cambios de unidad", 403);
}
