export const optionLabelStorageKey=(userId,familyId)=>`fyf-option-label-${userId}-${familyId}`;
export function pendingOptionLabel(userId,familyId,storage=sessionStorage){
 try{const saved=JSON.parse(storage.getItem(optionLabelStorageKey(userId,familyId))||"null"),t=saved?.target,b=saved?.command;
  if(t&&Number.isSafeInteger(t.attributeId)&&t.attributeId>0&&Number.isSafeInteger(t.optionId)&&t.optionId>0&&typeof t.label==="string"&&typeof t.attributeName==="string"&&b&&typeof b.label==="string"&&typeof b.reason==="string"&&/^[a-f0-9]{64}$/.test(b.expectedRevision)&&/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)&&b.confirmed===true)return saved;
 }catch{/* Stored commands are only recovered or explicitly retried. */}return null;
}
