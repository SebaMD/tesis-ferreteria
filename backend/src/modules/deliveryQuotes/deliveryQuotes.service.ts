import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { historicalProductColumns } from "../products/historicalIdentity.js";
import { commercialIdentitySnapshotsTable as identityCapture } from "../../db/schema/commercialIdentitySnapshots.js";
import { deliveryQuoteRequestsTable as requests, deliveryQuoteItemsTable as items, deliveryQuoteRevisionsTable as revisions, deliveryQuoteEventsTable as events,
  guestDeliveryQuoteTokensTable as tokens, usersTable as users, rolesTable as roles, productsTable as products, deliveryPolicyRevisionsTable as policies, deliverySettingsTable as settings, emailVerificationChallengesTable as challenges } from "../../db/schema/index.js";
import { currentDeliveryPolicy } from "../deliverySettings/deliverySettings.service.js";
import { priceCheckoutItems } from "../onlineOrders/onlineOrders.service.js";
import { createGuestOrderAccessToken, hashGuestOrderAccessToken, hashGuestSessionId } from "../onlineOrders/guestOrderAccess.js";
import { DeliveryQuoteError, command, integer, text, validateFreight, validateManualSettings, validateQuoteRequest } from "./deliveryQuotes.validation.js";

type Quote = typeof requests.$inferSelect;
export type QuotePrincipal = {userId:number} | {guestToken:string};
type Actor = {id:number;role:string;emailVerifiedAt:Date|null};
const staff=["ADMIN","MANAGER"];
const terminal=["REJECTED","CANCELLED","EXPIRED","ORDER_CREATED","CLOSED_UNPAID"];
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const tokenHours=Number(process.env.DELIVERY_QUOTE_TOKEN_HOURS||168);
const accessHours=Number.isInteger(tokenHours)&&tokenHours>=1&&tokenHours<=720?tokenHours:168;
async function actor(tx:DbTransaction,id:number,allowed:string[]):Promise<Actor>{
  const [u]=await tx.select({id:users.id,role:roles.name,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).innerJoin(roles,eq(users.roleId,roles.id)).where(eq(users.id,id));
  if(!u||u.status!=="ACTIVE"||!allowed.includes(u.role)||((u.role!=="ADMIN"&&u.role!=="CLIENT")&&!u.emailVerifiedAt))throw new DeliveryQuoteError("No tienes permisos para esta operación",403);
  return u;
}
async function authorize(tx:DbTransaction,q:Quote,p:QuotePrincipal){
  if("userId" in p){
    const u=await actor(tx,p.userId,[...staff,"WAREHOUSE","CLIENT"]);
    if(staff.includes(u.role)||(u.role==="WAREHOUSE"&&q.assignedTo===u.id)||(u.role==="CLIENT"&&q.clientId===u.id))return u;
  }else{
    let hash:string;try{hash=hashGuestOrderAccessToken(p.guestToken);}catch{throw new DeliveryQuoteError("Solicitud no encontrada o acceso no válido",404);}
    const [token]=await tx.select({id:tokens.id}).from(tokens).where(and(eq(tokens.requestId,q.id),eq(tokens.tokenHash,hash),isNull(tokens.revokedAt),gt(tokens.expiresAt,new Date())));
    if(q.clientId===null&&token)return null;
  }
  throw new DeliveryQuoteError("Solicitud no encontrada o acceso no válido",404);
}
async function manualPolicy(tx:DbTransaction){
  const p=await currentDeliveryPolicy(tx);
  if(!p||p.pricingMode!=="MANUAL_QUOTE")throw new DeliveryQuoteError("La configuración manual aún no fue activada por un usuario autorizado",409);
  if(!p.deliveryEnabled)throw new DeliveryQuoteError("El despacho no está disponible por ahora",409);
  return p;
}
async function event(tx:DbTransaction,q:Quote,type:string,u:Actor|null,payload:unknown,revisionId:number|null=null,operation?:{commandKey:string;hash:string},system=false){
  await tx.insert(events).values({requestId:q.id,type,actorId:u?.id??null,actorKind:system?"SYSTEM":u?"USER":"GUEST",payload,revisionId,commandKey:operation?.commandKey??null,commandHash:operation?.hash??null});
}
async function expire(tx:DbTransaction,q:Quote){
  if(terminal.includes(q.status))return q;
  let deadline=q.evaluationExpiresAt;
  if(q.status==="APPROVED"){
    const [approval]=await tx.select().from(revisions).where(and(eq(revisions.requestId,q.id),eq(revisions.kind,"APPROVED"))).orderBy(desc(revisions.version)).limit(1);
    if(!approval?.validUntil)throw new DeliveryQuoteError("Aprobación incompleta: requiere revisión administrativa",409);
    deadline=approval.validUntil;
  }
  if(deadline.getTime()>Date.now())return q;
  const [expired]=await tx.update(requests).set({status:"EXPIRED",version:q.version+1,updatedAt:new Date()}).where(eq(requests.id,q.id)).returning();
  await event(tx,expired,"EXPIRED",null,{deadline:deadline.toISOString()},null,undefined,true);return expired;
}
async function load(tx:DbTransaction,id:number,p:QuotePrincipal){
  const [q]=await tx.select().from(requests).where(eq(requests.id,id)).for("update");
  if(!q)throw new DeliveryQuoteError("Solicitud no encontrada o acceso no válido",404);
  const u=await authorize(tx,q,p);return {q,u};
}
async function view(tx:DbTransaction,q:Quote,u:Actor|null){
  const cargo=await tx.select({productId:items.productId,quantity:items.quantity,name:items.productName,unitMeasure:items.unitMeasure,
    historicalIdentity:historicalProductColumns.historicalIdentity}).from(items).leftJoin(identityCapture,eq(identityCapture.deliveryQuoteItemId,items.id)).where(eq(items.requestId,q.id)).orderBy(items.id);
  const history=await tx.select().from(events).where(eq(events.requestId,q.id)).orderBy(events.id);
  const quotes=await tx.select().from(revisions).where(eq(revisions.requestId,q.id)).orderBy(revisions.version);
  const administrative=Boolean(u&&staff.includes(u.role));
  const warehouse=u?.role==="WAREHOUSE";
  const currentApproval=q.status==="APPROVED"?quotes.filter(r=>r.kind==="APPROVED").at(-1)?.id??null:null;
  return {id:q.id,status:q.status,version:q.version,createdAt:q.createdAt,evaluationExpiresAt:q.evaluationExpiresAt,assignedTo:q.assignedTo,
    delivery:{recipientName:q.recipientName,phone:q.phone,address:q.address,commune:q.commune,reference:q.reference,coverageVerified:false,nonUrgent:q.nonUrgent},items:cargo,
    onlinePaymentEnabled:q.status==="APPROVED",phase:"3B",stockReserved:false,currentApprovalId:currentApproval,
    ...(!warehouse?{productsEstimate:q.commercialSnapshot}:{}),
    ...(administrative?{owner:{clientId:q.clientId,guestName:q.guestName,guestEmail:q.guestEmail},policyRevisionId:q.policyRevisionId}:{}),
    revisions:administrative?quotes:quotes.filter(r=>warehouse||r.kind==="APPROVED").map(r=>({id:r.id,version:r.version,kind:r.kind,amount:r.amount,reason:r.reason,customerNote:r.customerNote,validUntil:r.validUntil,isCurrent:r.id===currentApproval,
      ...(warehouse?{vehicle:r.vehicle,distanceKm:r.distanceKm,trips:r.trips,...(r.createdBy===u?.id?{notes:r.notes}:{})}: {})})),
    events:administrative?history:history.map(e=>({id:e.id,type:e.type,createdAt:e.createdAt,...(e.type==="PROPOSED"&&warehouse&&e.actorId===u?.id?{revisionId:e.revisionId}:{})})),
  };
}
async function consumeVerification(tx:DbTransaction,challengeId:number,sessionHash:string,email:string,purpose:"GUEST_DELIVERY_REQUEST"|"GUEST_DELIVERY_ACCESS"){
  const [record]=await tx.update(challenges).set({consumedAt:new Date(),updatedAt:new Date()}).where(and(eq(challenges.id,challengeId),eq(challenges.purpose,purpose),eq(challenges.guestSessionHash,sessionHash),eq(challenges.email,email),isNull(challenges.consumedAt),sql`${challenges.verifiedAt} is not null`,gt(challenges.expiresAt,new Date()))).returning({id:challenges.id});
  if(!record)throw new DeliveryQuoteError("Verifica el correo para esta operación",403);
}
async function issueAccess(tx:DbTransaction,id:number){
  const token=createGuestOrderAccessToken();
  // Replays may issue another link without exposing stored secrets or invalidating an earlier valid response.
  const active=await tx.select({id:tokens.id}).from(tokens).where(and(eq(tokens.requestId,id),isNull(tokens.revokedAt))).orderBy(desc(tokens.id));
  if(active.length>=10)await tx.update(tokens).set({revokedAt:new Date()}).where(inArray(tokens.id,active.slice(9).map(t=>t.id)));
  const expiresAt=new Date(Date.now()+accessHours*3600000);
  await tx.insert(tokens).values({requestId:id,tokenHash:token.tokenHash,expiresAt});return {accessToken:token.token,accessExpiresAt:expiresAt};
}
async function create(input:unknown,clientId:number|null,session?:string){
  const b=validateQuoteRequest(input,clientId===null);
  let sessionHash:string|null=null;
  if(clientId===null){try{sessionHash=hashGuestSessionId(session||"");}catch{throw new DeliveryQuoteError("Sesión de invitado inválida",400);}}
  const hash=digest({...b,challengeId:undefined,requestKey:undefined});
  return db.transaction(async tx=>{
    const u=clientId===null?null:await actor(tx,clientId,["CLIENT"]);
    if(u&&!u.emailVerifiedAt)throw new DeliveryQuoteError("Verifica el correo de tu cuenta",403);
    const ownerKey=clientId===null?`guest:${b.guestEmail}`:`client:${clientId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`delivery-quote:${ownerKey}`},0))`);
    const owner=clientId===null?eq(requests.guestSessionHash,sessionHash!):eq(requests.clientId,clientId);
    const [previous]=await tx.select().from(requests).where(and(owner,eq(requests.requestKey,b.requestKey))).for("update");
    if(previous){
      if(previous.requestHash!==hash)throw new DeliveryQuoteError("La clave ya se utilizó con otros datos",409);
      const q=await expire(tx,previous);return {request:await view(tx,q,u),replayed:true,...(clientId===null?await issueAccess(tx,q.id):{})};
    }
    const policy=await manualPolicy(tx);
    const quotaOwner=clientId===null?eq(requests.guestEmail,b.guestEmail!):eq(requests.clientId,clientId);
    const recent=await tx.select({id:requests.id}).from(requests).where(and(quotaOwner,gt(requests.createdAt,new Date(Date.now()-3600000))));
    const active=await tx.select({id:requests.id}).from(requests).where(and(quotaOwner,inArray(requests.status,["REQUESTED","ASSIGNED","PROPOSED","APPROVED"]),gt(requests.evaluationExpiresAt,new Date())));
    if(recent.length>=10||active.length>=5)throw new DeliveryQuoteError("Límite de solicitudes alcanzado; consulta las existentes o intenta más tarde",429);
    if(clientId===null)await consumeVerification(tx,b.challengeId!,sessionHash!,b.guestEmail!,"GUEST_DELIVERY_REQUEST");
    const priced=await priceCheckoutItems(tx,b.items);
    const productsNet=priced.reduce((n,i)=>n+Number(i.subtotal),0);
    if(!Number.isSafeInteger(productsNet)||productsNet<=0||productsNet>9999999999)throw new DeliveryQuoteError("Importe de productos inválido",400);
    const [q]=await tx.insert(requests).values({clientId,guestName:b.guestName,guestEmail:b.guestEmail,guestSessionHash:sessionHash,requestKey:b.requestKey,requestHash:hash,
      recipientName:b.recipientName,phone:b.phone,address:b.address,commune:b.commune,reference:b.reference,nonUrgent:b.nonUrgent,policyRevisionId:policy.id,
      commercialSnapshot:{items:priced,productsNet,notPayable:true},evaluationExpiresAt:new Date(Date.now()+(policy.evaluationValidityHours??72)*3600000)}).returning();
    const current=await tx.select({id:products.id,name:products.name,unitMeasure:products.unitMeasure}).from(products).where(inArray(products.id,b.items.map(i=>i.productId)));
    await tx.insert(items).values(b.items.map(i=>({requestId:q.id,productId:i.productId,quantity:i.quantity,productName:current.find(p=>p.id===i.productId)!.name,unitMeasure:current.find(p=>p.id===i.productId)!.unitMeasure})));
    await event(tx,q,"REQUESTED",u,{policyRevisionId:policy.id,notPayable:true});
    return {request:await view(tx,q,u),replayed:false,...(clientId===null?await issueAccess(tx,q.id):{})};
  });
}
export const createClientDeliveryQuote=(id:number,input:unknown)=>create(input,id);
export const createGuestDeliveryQuote=(session:string,input:unknown)=>create(input,null,session);
export async function getDeliveryQuote(id:number,p:QuotePrincipal){return db.transaction(async tx=>{const {q,u}=await load(tx,integer(id),p);return view(tx,await expire(tx,q),u);});}
export async function listDeliveryQuotes(userId:number,beforeId?:number,status?:string){
  if(status&&!['REQUESTED','ASSIGNED','PROPOSED','APPROVED','REJECTED','CANCELLED','EXPIRED','ORDER_CREATED','CLOSED_UNPAID'].includes(status))throw new DeliveryQuoteError("Estado inválido",400);
  return db.transaction(async tx=>{
    const u=await actor(tx,userId,[...staff,"WAREHOUSE","CLIENT"]);
    const conditions=[...(u.role==="CLIENT"?[eq(requests.clientId,u.id)]:u.role==="WAREHOUSE"?[eq(requests.assignedTo,u.id)]:[]),...(beforeId?[lt(requests.id,integer(beforeId))]:[]),...(status?[eq(requests.status,status)]:[])];
    const found=await tx.select().from(requests).where(and(...conditions)).orderBy(desc(requests.id)).limit(100).for("update");
    const result=[];for(const q of found)result.push(await view(tx,await expire(tx,q),u));return result;
  });
}
export async function quoteAssignees(userId:number){return db.transaction(async tx=>{await actor(tx,userId,staff);return tx.select({id:users.id,names:users.names,surnames:users.surnames}).from(users).innerJoin(roles,eq(users.roleId,roles.id)).where(and(eq(roles.name,"WAREHOUSE"),eq(users.status,"ACTIVE"),sql`${users.emailVerifiedAt} is not null`));});}

export type QuoteAction="ASSIGN"|"PROPOSE"|"APPROVE"|"CORRECTIONS"|"REJECT"|"CANCEL"|"REVOKE_ACCESS";
export async function actOnDeliveryQuote(id:number,p:QuotePrincipal,action:QuoteAction,input:unknown){
  const parsed=action==="PROPOSE"?validateFreight(input):command(input,action==="ASSIGN"?["assigneeId","reason"]:action==="APPROVE"?["proposalRevisionId","reason"]:["reason"]);
  const hash=digest({action,input});
  return db.transaction(async tx=>{
    if(action!=="CANCEL"){
      if(!("userId" in p))throw new DeliveryQuoteError("No tienes permisos para esta operación",403);
      await actor(tx,p.userId,action==="PROPOSE"?[...staff,"WAREHOUSE"]:staff);
    }
    // Policy before request, then pricing/products; administrative policy saves never lock requests.
    const policy=action==="PROPOSE"||action==="APPROVE"?await currentDeliveryPolicy(tx):null;
    const loaded=await load(tx,integer(id),p);let q=loaded.q;const u=loaded.u;
    if(action==="CANCEL"){
      if(u&&!staff.includes(u.role)&&u.role!=="CLIENT")throw new DeliveryQuoteError("No tienes permisos para cancelar",403);
    }else if(!u||(action==="PROPOSE"?![...staff,"WAREHOUSE"].includes(u.role):!staff.includes(u.role)))throw new DeliveryQuoteError("No tienes permisos para esta operación",403);
    const [prior]=await tx.select().from(events).where(and(eq(events.requestId,q.id),eq(events.commandKey,parsed.commandKey)));
    if(prior){if(prior.commandHash!==hash||prior.actorId!==(u?.id??null))throw new DeliveryQuoteError("La clave ya se utilizó con otros datos o responsable",409);return {request:await view(tx,await expire(tx,q),u),replayed:true,revisionId:prior.revisionId};}
    const expired=await expire(tx,q);
    // Commit an expiry even when the attempted command is no longer applicable.
    if(expired.status==="EXPIRED"&&action!=="REVOKE_ACCESS")return {expired:true as const,request:await view(tx,expired,u)};
    q=expired;
    if(q.version!==parsed.expectedVersion)throw new DeliveryQuoteError("La solicitud cambió. Recarga y revisa la versión vigente",409);
    if(terminal.includes(q.status)&&action!=="REVOKE_ACCESS")throw new DeliveryQuoteError("La solicitud está cerrada",409);
    if((action==="PROPOSE"||action==="APPROVE")&&(!policy||policy.pricingMode!=="MANUAL_QUOTE"||!policy.deliveryEnabled))throw new DeliveryQuoteError("El despacho no tiene una política manual habilitada",409);
    let status=q.status,assignedTo=q.assignedTo,revisionId:number|null=null,payload:unknown;
    const operation={commandKey:parsed.commandKey,hash};
    if(action==="PROPOSE"){
      if(!["REQUESTED","ASSIGNED","PROPOSED"].includes(q.status))throw new DeliveryQuoteError("Solicita correcciones antes de reemplazar una aprobación",409);
      const freight=parsed as ReturnType<typeof validateFreight>;
      const [last]=await tx.select({version:revisions.version}).from(revisions).where(eq(revisions.requestId,q.id)).orderBy(desc(revisions.version)).limit(1);
      const {commandKey:_key,expectedVersion:_version,...data}=freight;
      const [revision]=await tx.insert(revisions).values({...data,requestId:q.id,version:(last?.version??0)+1,kind:"PROPOSAL",policyRevisionId:policy!.id,createdBy:u!.id}).returning();
      revisionId=revision.id;status="PROPOSED";assignedTo=assignedTo??u!.id;payload={revisionId};
    }else{
      const b=(parsed as ReturnType<typeof command>).b;const reason=text(b.reason,8,1000);payload={reason};
      if(action==="ASSIGN"){
        if(q.status==="APPROVED")throw new DeliveryQuoteError("Revoca la aprobación mediante correcciones antes de reasignar",409);
        const target=await actor(tx,integer(b.assigneeId),["WAREHOUSE"]);assignedTo=target.id;status="ASSIGNED";payload={reason,previousAssignee:q.assignedTo,assignedTo};
      }else if(action==="APPROVE"){
        if(q.status!=="PROPOSED")throw new DeliveryQuoteError("Solo se aprueba una propuesta vigente",409);
        const [proposal]=await tx.select().from(revisions).where(eq(revisions.requestId,q.id)).orderBy(desc(revisions.version)).limit(1);
        if(!proposal||proposal.kind!=="PROPOSAL"||proposal.id!==integer(b.proposalRevisionId))throw new DeliveryQuoteError("La propuesta cambió o pertenece a otra solicitud",409);
        const requested=await tx.select({productId:items.productId,quantity:items.quantity}).from(items).where(eq(items.requestId,q.id));
        const priced=await priceCheckoutItems(tx,requested);const productsNet=priced.reduce((sum,i)=>sum+Number(i.subtotal),0);
        if(proposal.reason==="FREE_CONDITIONAL"&&(!policy!.conditionalFreeEnabled||!q.nonUrgent||!proposal.coordinated||productsNet<Number(policy!.conditionalFreeFrom)))throw new DeliveryQuoteError("La gratuidad condicionada requiere umbral neto, coordinación y entrega no urgente; no se aprobó",409);
        const {id:_id,version,createdAt:_date,...data}=proposal;
        const [approval]=await tx.insert(revisions).values({...data,kind:"APPROVED",sourceRevisionId:proposal.id,version:version+1,policyRevisionId:policy!.id,productsNet:productsNet.toFixed(2),thresholdSnapshot:policy!.conditionalFreeFrom,
          createdBy:u!.id,validUntil:new Date(Date.now()+(policy!.approvalValidityHours??24)*3600000)}).returning();
        revisionId=approval.id;status="APPROVED";payload={reason,proposalRevisionId:proposal.id,approvedRevisionId:approval.id,notPayable:true};
      }else if(action==="CORRECTIONS"){
        if(!["PROPOSED","APPROVED"].includes(q.status))throw new DeliveryQuoteError("No existe una propuesta o aprobación para revisar",409);
        status=assignedTo?"ASSIGNED":"REQUESTED";
      }else if(action==="REJECT")status="REJECTED";
      else if(action==="CANCEL")status="CANCELLED";
      else if(action==="REVOKE_ACCESS"){
        if(q.clientId!==null)throw new DeliveryQuoteError("La solicitud no es de invitado",400);
        await tx.update(tokens).set({revokedAt:new Date()}).where(and(eq(tokens.requestId,q.id),isNull(tokens.revokedAt)));
      }else throw new DeliveryQuoteError("Acción inválida",400);
    }
    const [updated]=await tx.update(requests).set({status,assignedTo,version:q.version+1,updatedAt:new Date()}).where(eq(requests.id,q.id)).returning();
    const type=({ASSIGN:"ASSIGNED",PROPOSE:"PROPOSED",APPROVE:"APPROVED",REVOKE_ACCESS:"ACCESS_REVOKED"} as Record<string,string>)[action]??({REJECT:"REJECTED",CANCEL:"CANCELLED"} as Record<string,string>)[action]??action;
    await event(tx,updated,type,u,payload,revisionId,operation);
    return {request:await view(tx,updated,u),replayed:false,revisionId};
  });
}

export async function recoverGuestDeliveryQuote(id:number,session:string,challengeId:number){
  let sessionHash:string;try{sessionHash=hashGuestSessionId(session);}catch{throw new DeliveryQuoteError("Acceso no válido",404);}
  return db.transaction(async tx=>{
    const [q]=await tx.select().from(requests).where(eq(requests.id,integer(id))).for("update");
    if(!q||q.clientId!==null)throw new DeliveryQuoteError("Solicitud no encontrada o verificación no válida",404);
    const commandKey=`recover-access-${integer(challengeId)}`,hash=digest({challengeId,sessionHash});
    const [prior]=await tx.select().from(events).where(and(eq(events.requestId,q.id),eq(events.commandKey,commandKey)));
    if(prior){
      const [verified]=await tx.select({id:challenges.id}).from(challenges).where(and(eq(challenges.id,challengeId),eq(challenges.purpose,"GUEST_DELIVERY_ACCESS"),eq(challenges.guestSessionHash,sessionHash),eq(challenges.email,q.guestEmail!),gt(challenges.expiresAt,new Date())));
      if(prior.type!=="ACCESS_RECOVERED"||prior.commandHash!==hash||!verified)throw new DeliveryQuoteError("Solicitud no encontrada o verificación no válida",404);
      return {...await issueAccess(tx,q.id),replayed:true};
    }
    try{await consumeVerification(tx,integer(challengeId),sessionHash,q.guestEmail!,"GUEST_DELIVERY_ACCESS");}catch(e){if(e instanceof DeliveryQuoteError)throw new DeliveryQuoteError("Solicitud no encontrada o verificación no válida",404);throw e;}
    const access=await issueAccess(tx,q.id);await event(tx,q,"ACCESS_RECOVERED",null,{verified:true},null,{commandKey,hash});return {...access,replayed:false};
  });
}
export async function getManualDeliverySettings(userId:number){return db.transaction(async tx=>{await actor(tx,userId,staff);return {policy:await currentDeliveryPolicy(tx),phase:"3B",requiresApprovedFreight:true,provisionalDefaults:{conditionalFreeFrom:500000,approvalValidityHours:24,evaluationValidityHours:72}};});}
export async function saveManualDeliverySettings(userId:number,input:unknown){
  const {expectedRevisionId,...data}=validateManualSettings(input);
  return db.transaction(async tx=>{
    await actor(tx,userId,staff);await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-delivery-policy'))`);
    await tx.insert(settings).values({id:1}).onConflictDoNothing();
    const [setting]=await tx.select().from(settings).where(eq(settings.id,1)).for("update");
    if(setting.currentRevisionId!==expectedRevisionId)throw new DeliveryQuoteError("La configuración cambió. Recarga antes de guardar",409);
    const [old]=setting.currentRevisionId?await tx.select().from(policies).where(eq(policies.id,setting.currentRevisionId)):[];
    const [policy]=await tx.insert(policies).values({...data,version:(old?.version??0)+1,pricingMode:"MANUAL_QUOTE",pickupEnabled:true,flatFee:"0.00",minimumProductsTotal:null,freeShippingFrom:null,isDemo:false,createdBy:userId}).returning();
    await tx.update(settings).set({currentRevisionId:policy.id}).where(eq(settings.id,1));return policy;
  });
}

export { load as loadDeliveryQuote, expire as expireDeliveryQuote, event as recordDeliveryQuoteEvent, manualPolicy as requireManualDeliveryPolicy };
