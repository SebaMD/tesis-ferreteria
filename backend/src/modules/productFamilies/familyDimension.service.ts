import {createHash} from "node:crypto";
import {asc,eq,sql} from "drizzle-orm";
import {db} from "../../db/index.js";
import {familyAttributesTable as attrs,familyAttributeOptionsTable as options,productVariantValuesTable as values,productFamilyEventsTable as events,productFamiliesTable as families,productsTable as products,usersTable as users,rolesTable as roles} from "../../db/schema/index.js";
import {bundleSnapshot} from "./productBundle.service.js";
import {FamilyError} from "./productFamilies.service.js";
import {validateAttributeMeasurement,normalizeAttributeNumber} from "./attributeMeasurements.js";

const text=(v:unknown,max:number)=>{if(typeof v!=="string"||/[\u0000-\u001f\u007f]/.test(v))throw new FamilyError("Texto inválido",400);const s=v.trim().replace(/\s+/g," ");if(!s||s.length>max)throw new FamilyError("Nombre u opción inválidos",400);return s;};
export function validateFamilyDimension(input:unknown){
 const b=input as Record<string,unknown>;
 if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["name","options","assignments","reason","confirmed","expectedRevision","operationKey","measurementKind","unitCode"].includes(k)))throw new FamilyError("Operación inválida",400);
 const name=text(b.name,60);
 const measurement=validateAttributeMeasurement(b);
 if(!Array.isArray(b.options)||b.options.length<1||b.options.length>100)throw new FamilyError("Indique entre 1 y 100 opciones",400);
 const labels=b.options.map(v=>{const label=text(v,100);return measurement.unitCode?normalizeAttributeNumber(label):label;});if(new Set(labels.map(s=>s.toLocaleLowerCase("es"))).size!==labels.length)throw new FamilyError("Opciones duplicadas",400);
 if(!Array.isArray(b.assignments)||!b.assignments.length||b.assignments.length>1000)throw new FamilyError("Asigne cada variante explícitamente",400);
 const assignments=b.assignments.map((v:unknown)=>{const a=v as Record<string,unknown>;if(!a||typeof a!=="object"||Object.keys(a).some(k=>!["productId","optionIndex"].includes(k))||!Number.isSafeInteger(a.productId)||Number(a.productId)<1||!Number.isSafeInteger(a.optionIndex)||Number(a.optionIndex)<0||Number(a.optionIndex)>=labels.length)throw new FamilyError("Asignación inválida",400);return{productId:Number(a.productId),optionIndex:Number(a.optionIndex)};}).sort((a,b)=>a.productId-b.productId);
 if(new Set(assignments.map(a=>a.productId)).size!==assignments.length)throw new FamilyError("Artículo repetido en asignaciones",400);
 if(typeof b.reason!=="string"||b.reason.trim().length<8||b.reason.trim().length>500||b.confirmed!==true||typeof b.expectedRevision!=="string"||!/^[a-f0-9]{64}$/.test(b.expectedRevision)||typeof b.operationKey!=="string"||!/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey))throw new FamilyError("Confirme motivo de 8–500 caracteres, revisión y clave de operación",400);
 return{name,...measurement,options:labels,assignments,reason:b.reason.trim(),confirmed:true,expectedRevision:b.expectedRevision,operationKey:b.operationKey};
}
export async function familyDimensionOperation(id:number,actorId:number,input?:unknown,key?:string){
 if(!Number.isSafeInteger(id)||id<1)throw new FamilyError("Familia inválida",400);
 const b=input===undefined?null:validateFamilyDimension(input),operationKey=b?.operationKey||key||"";
 if(!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey))throw new FamilyError("Clave inválida",400);
 const requestHash=b?createHash("sha256").update(JSON.stringify({familyId:id,...b})).digest("hex"):null;
 try{return await db.transaction(async tx=>{
  const [u]=await tx.select({role:roles.name,status:users.status}).from(users).innerJoin(roles,eq(roles.id,users.roleId)).where(eq(users.id,actorId));
  if(!u||u.role!=="ADMIN"||u.status!=="ACTIVE")throw new FamilyError("Solo ADMIN puede incorporar dimensiones",403);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
  const [prior]=await tx.select().from(events).where(sql`${events.next}->>'operation'='DIMENSION_ADD' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
  if(prior){if(prior.userId!==actorId)throw new FamilyError("Operación de otro administrador",403);if(prior.familyId!==id||(b&&(prior.next as {requestHash:string}).requestHash!==requestHash))throw new FamilyError("La clave ya identifica otros datos");return{...prior.next as object,replayed:true};}
  if(!b)return null;
  const [family]=await tx.select().from(families).where(eq(families.id,id)).for("update");
  if(!family)throw new FamilyError("Familia no encontrada",404);if(family.archivedAt)throw new FamilyError("Reactive la familia antes de agregar atributos");
  const members=await tx.select().from(products).where(eq(products.familyId,id)).orderBy(asc(products.id)).for("update");
  const snapshot=await bundleSnapshot(id,tx);
  if(snapshot.revision!==b.expectedRevision)throw new FamilyError("La familia o sus variantes cambiaron. Recargue y revise todas las asignaciones");
  if(snapshot.family.attributes.length>=8)throw new FamilyError("Se permiten hasta 8 atributos");
  if(snapshot.family.attributes.some(a=>a.name.trim().replace(/\s+/g," ").toLocaleLowerCase("es")===b.name.toLocaleLowerCase("es")))throw new FamilyError("Ya existe un atributo con ese nombre");
  if(members.length!==b.assignments.length||members.some((p,i)=>p.id!==b.assignments[i].productId))throw new FamilyError("Debe asignar una opción a todos los artículos actuales, incluidos los inactivos",400);
  const detached=await tx.execute<{blocked:boolean}>(sql`select fyf_dimension_has_detached_history(${id}) blocked`);if(detached.rows[0].blocked)throw new FamilyError("Hay artículos históricos desvinculados de esta familia. Deben recuperar su clasificación antes de ampliarla");
  for(const p of members){await tx.execute(sql`select fyf_assert_product_name_ready(${p.id})`);await tx.execute(sql`select fyf_verify_variant(${p.id})`);}
  const state=(await tx.execute<{state:unknown}>(sql`select fyf_dimension_state(${id}) state`)).rows[0].state;
  const [attribute]=await tx.insert(attrs).values({familyId:id,name:b.name,measurementKind:b.measurementKind??null,unitCode:b.unitCode??null,position:Math.max(-1,...snapshot.family.attributes.map(a=>a.position))+1}).returning();
  const createdOptions=await tx.insert(options).values(b.options.map((label,position)=>({attributeId:attribute.id,label,position}))).returning();
  const assignments=[];
  for(const a of b.assignments){const p=members.find(p=>p.id===a.productId)!;const optionId=createdOptions.find(o=>o.position===a.optionIndex)!.id;
   const selected=await tx.select({attributeId:values.attributeId,optionId:values.optionId}).from(values).where(eq(values.productId,p.id));
   const variantKey=[...selected,{attributeId:attribute.id,optionId}].sort((a,b)=>a.attributeId-b.attributeId).map(v=>v.optionId).join(",");assignments.push({productId:p.id,optionId,variantKey});}
  const [authorization]=await tx.insert(events).values({familyId:id,productId:null,userId:actorId,reason:b.reason,
   previous:{state,revision:snapshot.revision,transactionId:(await tx.execute<{id:string}>(sql`select pg_current_xact_id()::text id`)).rows[0].id},
   next:{operation:"DIMENSION_ADD_AUTHORIZATION",operationKey,requestHash,attribute:{id:attribute.id,family_id:attribute.familyId,name:attribute.name,position:attribute.position,...(attribute.unitCode?{measurement_kind:attribute.measurementKind,unit_code:attribute.unitCode}:{})},options:createdOptions.map(o=>({id:o.id,attribute_id:o.attributeId,label:o.label,position:o.position})),assignments}}).returning();
  for(const a of assignments){await tx.insert(values).values({productId:a.productId,familyId:id,attributeId:attribute.id,optionId:a.optionId});await tx.update(products).set({variantKey:a.variantKey,updatedAt:new Date()}).where(eq(products.id,a.productId));}
  await tx.update(families).set({updatedAt:new Date()}).where(eq(families.id,id));
  const {revision}=await bundleSnapshot(id,tx);
  const result={operation:"DIMENSION_ADD",familyId:id,operationKey,requestHash,authorizationId:authorization.id,attributeId:attribute.id,productIds:members.map(p=>p.id),revision};
  await tx.insert(events).values({familyId:id,productId:null,userId:actorId,reason:b.reason,previous:{revision:snapshot.revision},next:result});
  return{...result,replayed:false};
 });}catch(e){if(e instanceof FamilyError)throw e;const error=e as{cause?:{code?:string;message?:string};code?:string;message?:string};const detail=error.cause||error;if(detail.code==="23514")throw new FamilyError((detail.message||"No se pudo verificar la clasificación").replaceAll("corregir el nombre","ampliar los atributos").replaceAll("corregir este nombre","ampliar esta familia"));if(["23505","40P01","40001"].includes(detail.code||""))throw new FamilyError("Conflicto concurrente o combinación duplicada. No se aplicó la ampliación");throw e;}
}
