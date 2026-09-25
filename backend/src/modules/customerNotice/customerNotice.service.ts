import {
  createCustomerNotice,
  deleteCustomerNoticeById,
  findCustomerNoticeById,
  findCustomerNotices,
  findPublicCustomerNotices,
  updateCustomerNoticeById,
} from "./customerNotice.repository.js";
import type { NoticeInput } from "./customerNotice.validation.js";

export async function getPublicCustomerNoticeService() {
  return findPublicCustomerNotices();
}

export async function getCustomerNoticeConfigurationService() {
  return findCustomerNotices();
}

export class CustomerNoticeError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "CustomerNoticeError";
  }
}

export function createCustomerNoticeService(userId: number, input: NoticeInput) {
  return createCustomerNotice({ ...input, userId });
}

export async function updateCustomerNoticeService(userId: number, id: number, input: NoticeInput) {
  if (!await findCustomerNoticeById(id)) {
    throw new CustomerNoticeError("Aviso no encontrado", 404);
  }
  const updated = await updateCustomerNoticeById(id, { ...input, userId });
  if (!updated) throw new CustomerNoticeError("Aviso no encontrado", 404);
  return updated;
}

export async function deleteCustomerNoticeService(id: number) {
  if (!await deleteCustomerNoticeById(id)) {
    throw new CustomerNoticeError("Aviso no encontrado", 404);
  }
}
