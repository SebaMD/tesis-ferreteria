export const classificationStorageKey=(userId,productId,field)=>`fyf-simple-classification-${userId}-${productId}-${field}`;
export function pendingProductClassification(key,field,storage=sessionStorage){
 try{
  const p=JSON.parse(storage.getItem(key)||"null");
  if(!p||p.field!==field||p.confirmed!==true||typeof p.operationKey!=="string"||!/^[a-zA-Z0-9-]{20,80}$/.test(p.operationKey)
   ||typeof p.reason!=="string"||p.reason.trim().length<8||p.reason.trim().length>500
   ||typeof p.expectedRevision!=="string"||!Number.isFinite(Date.parse(p.expectedRevision))||new Date(p.expectedRevision).toISOString()!==p.expectedRevision)return null;
  if(field==="brand"?(typeof p.value!=="string"||!p.value.trim()||p.value.length>100||(p.previousValue!==null&&typeof p.previousValue!=="string"))
   :(!Number.isSafeInteger(p.value)||p.value<1||!Number.isSafeInteger(p.previousValue)||p.previousValue<1))return null;
  return p;
 }catch{return null;}
}
