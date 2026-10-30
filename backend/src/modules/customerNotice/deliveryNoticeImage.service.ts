import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { catalogPresentationTable as presentation, usersTable, rolesTable } from "../../db/schema/index.js";
import { saveImageFile, removeStoredImageFile } from "../../utils/imageFiles.js";

export class DeliveryNoticeImageError extends Error {
  constructor(message: string, public readonly statusCode = 409) { super(message); }
}
export function deliveryImageRevision(value: unknown) {
  if (typeof value !== "string" || !/^"(0|[1-9]\d{0,8})"$/.test(value)) throw new DeliveryNoticeImageError("Actualiza el aviso antes de guardar su imagen", 400);
  return Number(value.slice(1, -1));
}
export async function setDeliveryNoticeImage(userId: number, expectedRevision: number, image: {buffer: Buffer; mimeType: string} | null) {
  const [actor] = await db.select({role: rolesTable.name}).from(usersTable).innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id)).where(and(eq(usersTable.id,userId),eq(usersTable.status,"ACTIVE")));
  if (!actor || !["ADMIN","MANAGER"].includes(actor.role)) throw new DeliveryNoticeImageError("No tienes permiso para administrar el aviso",403);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new DeliveryNoticeImageError("Revisión inválida",400);
  const saved = image ? await saveImageFile({...image, declaredMimeType:image.mimeType, directorySegments:["customer-notices","delivery"]}) : null;
  try {
    return await db.transaction(async tx => {
      await tx.insert(presentation).values({id:1,title:"Catálogo Ferretería FYF",mainText:"Encuentra materiales y herramientas para tu próximo proyecto",secondaryText:"Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus."}).onConflictDoNothing();
      const [updated] = await tx.update(presentation).set({deliveryImagePath:saved?.relativePath ?? null,deliveryImageRevision:sql`${presentation.deliveryImageRevision}+1`,updatedByUserId:userId,updatedAt:new Date()}).where(and(eq(presentation.id,1),eq(presentation.deliveryImageRevision,expectedRevision))).returning({revision:presentation.deliveryImageRevision,imagePath:presentation.deliveryImagePath});
      if (!updated) throw new DeliveryNoticeImageError("La imagen cambió en otra sesión. Recarga los avisos antes de reintentar.");
      // Retain replaced files: no historical/shared image is deleted by this operation.
      return {revision:updated.revision,imageUrl:updated.imagePath?`/uploads/${updated.imagePath.replaceAll("\\","/")}`:null};
    });
  } catch(error) {if(saved) await removeStoredImageFile(saved.relativePath).catch(()=>undefined);throw error;}
}
