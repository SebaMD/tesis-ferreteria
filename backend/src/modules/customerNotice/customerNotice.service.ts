import { removeStoredImageFile, saveImageFile } from "../../utils/imageFiles.js";
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
  const [presentation, notices] = await Promise.all([
    findCatalogPresentation(),
    findPublicCustomerNotices(),
  ]);
  return {
    presentation: presentPresentation(presentation ?? DEFAULT_PRESENTATION),
    notices: notices.map(presentNotice),
  };
}

export async function getCustomerNoticeConfigurationService() {
  const [presentation, notices] = await Promise.all([
    findCatalogPresentation(),
    findCustomerNotices(),
  ]);
  return {
    presentation: presentPresentation(presentation ?? DEFAULT_PRESENTATION),
    notices: notices.map(presentNotice),
  };
}

export class CustomerNoticeError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "CustomerNoticeError";
  }
}

export async function createCustomerNoticeService(userId: number, input: NoticeInput) {
  return presentNotice(await createCustomerNotice({ ...input, userId }));
}

export async function updateCustomerNoticeService(userId: number, id: number, input: NoticeInput) {
  if (!await findCustomerNoticeById(id)) {
    throw new CustomerNoticeError("Aviso no encontrado", 404);
  }
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
