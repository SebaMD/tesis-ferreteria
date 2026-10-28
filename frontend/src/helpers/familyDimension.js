export const dimensionStorageKey=(userId,familyId)=>`fyf-family-dimension-${userId}-${familyId}`;
export function pendingDimension(userId,familyId,storage=sessionStorage){
 try{const b=JSON.parse(storage.getItem(dimensionStorageKey(userId,familyId))||"null");if(b&&typeof b.name==="string"&&typeof b.reason==="string"&&Array.isArray(b.options)&&Array.isArray(b.assignments)&&/^[a-f0-9]{64}$/.test(b.expectedRevision)&&/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)&&b.confirmed===true)return b;}catch{/* Never replay stored commands automatically. */}return null;
}
export function dimensionDraft(name,optionsText,selections,rows){
 const clean=s=>s.trim().replace(/\s+/g," ");const options=optionsText.split("\n").map(clean).filter(Boolean);
 const assignments=rows.map(row=>({productId:row.id,optionIndex:selections[row.id]===""||selections[row.id]===undefined?-1:Number(selections[row.id])}));
 const valid=clean(name).length>0&&clean(name).length<=60&&options.length>0&&options.length<=100&&options.every(s=>s.length<=100)&&new Set(options.map(s=>s.toLocaleLowerCase("es"))).size===options.length&&assignments.every(a=>Number.isInteger(a.optionIndex)&&a.optionIndex>=0&&a.optionIndex<options.length);
 return{name:clean(name),options,assignments,valid};
}
