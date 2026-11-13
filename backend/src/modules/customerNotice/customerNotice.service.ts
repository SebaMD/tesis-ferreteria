import { removeStoredImageFile, saveImageFile } from "../../utils/imageFiles.js";
import { db } from "../../db/index.js";
import { currentDeliveryPolicy } from "../deliverySettings/deliverySettings.service.js";
import { deliveryAnnouncement, publicDeliveryInformation } from "../deliverySettings/deliveryPricing.js";
import {
  createCustomerNotice,
  deleteCustomerNoticeById,
  findCatalogPresentation,
  findCustomerNoticeById,
  findCustomerNotices,
  findPublicCustomerNotices,
  reorderCustomerNotices,
  setCatalogPresentationImagePath,
  setCustomerNoticeImagePath,
  updateCatalogPresentation,
  updateCustomerNoticeById,
} from "./customerNotice.repository.js";
import type { CatalogPresentationInput, NoticeInput } from "./customerNotice.validation.js";
import { customerNoticePeriodError } from "./customerNotice.validation.js";

const DEFAULT_PRESENTATION = {
  id: 1,
  title: "Catálogo Ferretería FYF",
  mainText: "Encuentra materiales y herramientas para tu próximo proyecto",
  secondaryText: "Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.",
  imagePath: null,
};

function imageUrl(imagePath: string | null | undefined) {
  return imagePath ? `/uploads/${imagePath.replaceAll("\\", "/")}` : null;
}

function presentDelivery(announcement: ReturnType<typeof deliveryAnnouncement>, presentation: Awaited<ReturnType<typeof findCatalogPresentation>>, admin = false) {
  if (!announcement) return null;
  const savedImageUrl = imageUrl(presentation?.deliveryImagePath);
  const imageVisible = announcement.kind === "LOCAL_FIXED";
  return {...announcement,imageUrl:imageVisible?savedImageUrl:null,...(admin?{savedImageUrl,imageSuppressed:!imageVisible,revision:presentation?.deliveryImageRevision??0}: {})};
}

function presentPresentation<T extends {
  id: number;
  title: string;
  mainText: string;
  secondaryText: string;
  imagePath: string | null;
}>(presentation: T) {
  return {
    id: presentation.id,
    title: presentation.title,
    mainText: presentation.mainText,
    secondaryText: presentation.secondaryText,
    imageUrl: imageUrl(presentation.imagePath),
  };
}

function presentNotice<T extends { imagePath?: string | null }>(notice: T) {
  const { imagePath, ...safe } = notice;
  return { ...safe, imageUrl: imageUrl(imagePath) };
}

export async function getPublicCustomerNoticeService() {
  const [presentation, notices, delivery] = await Promise.all([
    findCatalogPresentation(),
    findPublicCustomerNotices(),
    db.transaction(async tx => {
      const policy = await currentDeliveryPolicy(tx);
      return { announcement: deliveryAnnouncement(policy), information: publicDeliveryInformation(policy) };
    }),
  ]);
  return {
    presentation: presentPresentation(presentation ?? DEFAULT_PRESENTATION),
    notices: notices.map(presentNotice),
    deliveryAnnouncement: presentDelivery(delivery.announcement, presentation),
    deliveryInformation: delivery.information,
  };
}

export async function getCustomerNoticeConfigurationService() {
  const [presentation, notices, policy] = await Promise.all([
    findCatalogPresentation(),
    findCustomerNotices(),
    db.transaction(tx => currentDeliveryPolicy(tx)),
  ]);
  return {
    presentation: presentPresentation(presentation ?? DEFAULT_PRESENTATION),
    notices: notices.map(presentNotice),
    deliveryAnnouncement: presentDelivery(deliveryAnnouncement(policy), presentation, true),
  };
}

export class CustomerNoticeError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "CustomerNoticeError";
  }
}

export async function createCustomerNoticeService(userId: number, input: NoticeInput) {
  const error = customerNoticePeriodError(input);
  if (error) throw new CustomerNoticeError(error, 400);
  return presentNotice(await createCustomerNotice({ ...input, userId }));
}

export async function updateCustomerNoticeService(userId: number, id: number, input: NoticeInput) {
  const current = await findCustomerNoticeById(id);
  if (!current) {
    throw new CustomerNoticeError("Aviso no encontrado", 404);
  }
  const error = customerNoticePeriodError(input, current);
  if (error) throw new CustomerNoticeError(error, 400);
  const updated = await updateCustomerNoticeById(id, { ...input, userId });
  if (!updated) throw new CustomerNoticeError("Aviso no encontrado", 404);
  return presentNotice(updated);
}

export async function reorderCustomerNoticesService(userId: number, noticeIds: number[]) {
  const reordered = await reorderCustomerNotices(noticeIds, userId);
  if (!reordered) {
    throw new CustomerNoticeError("La lista debe contener todos los avisos actuales", 400);
  }
  return reordered.map(presentNotice);
}

export async function updateCatalogPresentationService(
  userId: number,
  input: CatalogPresentationInput,
) {
  return presentPresentation(await updateCatalogPresentation({ ...input, userId }));
}

export async function uploadCustomerNoticeImageService(
  userId: number,
  id: number,
  data: { buffer: Buffer; mimeType: string },
) {
  const current = await findCustomerNoticeById(id);
  if (!current) throw new CustomerNoticeError("Aviso no encontrado", 404);
  const saved = await saveImageFile({
    buffer: data.buffer,
    declaredMimeType: data.mimeType,
    directorySegments: ["customer-notices", "notices", id],
  });
  try {
    const updated = await setCustomerNoticeImagePath(id, saved.relativePath, userId);
    if (!updated) throw new CustomerNoticeError("Aviso no encontrado", 404);
    if (current.imagePath) await removeStoredImageFile(current.imagePath).catch(() => undefined);
    return presentNotice(updated);
  } catch (error) {
    await removeStoredImageFile(saved.relativePath).catch(() => undefined);
    throw error;
  }
}

export async function removeCustomerNoticeImageService(userId: number, id: number) {
  const current = await findCustomerNoticeById(id);
  if (!current) throw new CustomerNoticeError("Aviso no encontrado", 404);
  const updated = await setCustomerNoticeImagePath(id, null, userId);
  if (current.imagePath) await removeStoredImageFile(current.imagePath).catch(() => undefined);
  return presentNotice(updated ?? current);
}

export async function uploadCatalogPresentationImageService(
  userId: number,
  data: { buffer: Buffer; mimeType: string },
) {
  const current = await findCatalogPresentation();
  if (!current) throw new CustomerNoticeError("Presentacion del catalogo no encontrada", 404);
  const saved = await saveImageFile({
    buffer: data.buffer,
    declaredMimeType: data.mimeType,
    directorySegments: ["customer-notices", "presentation"],
  });
  try {
    const updated = await setCatalogPresentationImagePath(saved.relativePath, userId);
    if (!updated) throw new CustomerNoticeError("Presentacion del catalogo no encontrada", 404);
    if (current.imagePath) await removeStoredImageFile(current.imagePath).catch(() => undefined);
    return presentPresentation(updated);
  } catch (error) {
    await removeStoredImageFile(saved.relativePath).catch(() => undefined);
    throw error;
  }
}

export async function removeCatalogPresentationImageService(userId: number) {
  const current = await findCatalogPresentation();
  if (!current) throw new CustomerNoticeError("Presentacion del catalogo no encontrada", 404);
  const updated = await setCatalogPresentationImagePath(null, userId);
  if (current.imagePath) await removeStoredImageFile(current.imagePath).catch(() => undefined);
  return presentPresentation(updated ?? current);
}

export async function deleteCustomerNoticeService(id: number) {
  const deleted = await deleteCustomerNoticeById(id);
  if (!deleted) throw new CustomerNoticeError("Aviso no encontrado", 404);
  if (deleted.imagePath) await removeStoredImageFile(deleted.imagePath).catch(() => undefined);
}
