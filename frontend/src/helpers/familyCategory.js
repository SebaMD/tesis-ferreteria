export const categoryChangeKey=(userId,familyId)=>`fyf-family-category-${userId}-${familyId}`;
export function pendingCategoryChange(userId,familyId,storage=sessionStorage){
  try {const b=JSON.parse(storage.getItem(categoryChangeKey(userId,familyId))||"null");if(b&&Number.isSafeInteger(b.categoryId)&&/^[a-f0-9]{64}$/.test(b.expectedRevision)&&/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)&&typeof b.reason==="string"&&b.confirmed===true)return b;}catch{/* Never send a stored command automatically. */}return null;
}
