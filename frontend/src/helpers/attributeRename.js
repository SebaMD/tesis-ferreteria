export const attributeRenameStorageKey = (userId, familyId) => `fyf-attribute-rename-${userId}-${familyId}`;
export function readPendingAttributeRename(userId, familyId, storage = sessionStorage) {
  try {
    const value = JSON.parse(storage.getItem(attributeRenameStorageKey(userId, familyId)) || "null");
    if (value && Number.isSafeInteger(value.id) && value.id > 0 && typeof value.name === "string"
      && typeof value.body?.operationKey === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(value.body.operationKey)
      && typeof value.body.expectedRevision === "string" && /^[a-f0-9]{64}$/.test(value.body.expectedRevision)
      && typeof value.body.name === "string" && typeof value.body.reason === "string" && value.body.confirmed === true) return value;
  } catch { /* Unavailable storage must never cause an automatic write or replay. */ }
  return null;
}
