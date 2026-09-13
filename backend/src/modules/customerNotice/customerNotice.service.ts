import { findCustomerNotice, saveCustomerNotice } from "./customerNotice.repository.js";

export async function getPublicCustomerNoticeService() {
  const notice = await findCustomerNotice();
  if (!notice?.active || !notice.title || !notice.message) return null;
  return {
    title: notice.title,
    message: notice.message,
    version: notice.updatedAt.toISOString(),
  };
}

export async function getCustomerNoticeConfigurationService() {
  const notice = await findCustomerNotice();
  return notice ?? {
    id: 1,
    title: "",
    message: "",
    active: false,
    updatedByUserId: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function updateCustomerNoticeService(
  userId: number,
  input: { title: string; message: string; active: boolean },
) {
  return saveCustomerNotice({ ...input, updatedByUserId: userId });
}
