export const brandCorrectionKey=(userId,familyId)=>`fyf-family-brand-${userId}-${familyId}`;
export function pendingBrandCorrection(userId,familyId,storage=sessionStorage){
  try{const b=JSON.parse(storage.getItem(brandCorrectionKey(userId,familyId))||"null");if(b&&typeof b.brand==="string"&&typeof b.reason==="string"&&/^[a-f0-9]{64}$/.test(b.expectedRevision)&&/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)&&b.confirmed===true)return b;}catch{/* Never replay a stored command automatically. */}return null;
}
