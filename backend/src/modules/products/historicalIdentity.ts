import { and, eq, sql, type SQLWrapper } from "drizzle-orm";
import { commercialIdentitySnapshotsTable as capture, type HistoricalIdentity } from "../../db/schema/commercialIdentitySnapshots.js";

export const historicalProductColumns = {
  productName: sql<string>`coalesce(${capture.identity}->>'name','Identidad histórica no registrada')`,
  productBarcode: sql<string | null>`${capture.identity}->>'barcode'`,
  unitMeasure: sql<string>`coalesce(${capture.identity}->>'unitMeasure','unidad no registrada')`,
  historicalIdentity: sql<HistoricalIdentity | null>`case when ${capture.id} is null then null else jsonb_build_object(
    'version',${capture.version},'origin',${capture.origin},'capturedAt',${capture.capturedAt},'identity',${capture.identity}) end`,
};
export const saleIdentityJoin = (saleId: SQLWrapper, productId: SQLWrapper) => and(eq(capture.saleId, saleId), eq(capture.productId, productId));
export const orderIdentityJoin = (orderId: SQLWrapper, productId: SQLWrapper) => and(eq(capture.orderId, orderId), eq(capture.productId, productId));

export function historicalIdentityNote(value?: HistoricalIdentity | null) {
  if (!value) return "Identidad histórica no registrada";
  if (value.origin === "ORIGINAL") return "Identidad registrada al crear la operación";
  if (value.origin === "LEGACY_PARTIAL") return `Nombre y unidad originales; demás datos de referencia capturados el ${value.capturedAt}`;
  return `Referencia posterior capturada el ${value.capturedAt}; no acredita la identidad original`;
}
