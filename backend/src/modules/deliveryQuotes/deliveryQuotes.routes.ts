import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash } from "node:crypto";
import { authenticateJwt, type AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { handleErrorServer } from "../../utils/helpers.js";
import { validateEmailRequestBody, validatePinBody } from "../emailVerification/emailVerification.validation.js";
import { EmailVerificationError, requestDeliveryGuestVerificationService, verifyDeliveryGuestService } from "../emailVerification/emailVerification.service.js";
import { actOnDeliveryQuote, createClientDeliveryQuote, createGuestDeliveryQuote, getDeliveryQuote, getManualDeliverySettings, listDeliveryQuotes, quoteAssignees, recoverGuestDeliveryQuote, saveManualDeliverySettings, type QuoteAction } from "./deliveryQuotes.service.js";
import { DeliveryQuoteError, integer, object } from "./deliveryQuotes.validation.js";
import { checkoutDeliveryQuote, deliveryQuoteSummary, deliveryQuoteOrder, resumeDeliveryQuotePayment, closeUnpaidDeliveryQuote } from "./deliveryQuoteCheckout.service.js";
import { ensureGuestDeviceCookie } from "../onlineOrders/guestDeviceCookie.js";

const attempts=new Map<string,{start:number;count:number}>();
function guestRate(req:Request,res:Response,next:NextFunction){
  const now=Date.now(),key=createHash("sha256").update(req.ip||"unknown").digest("hex");
  for(const [k,v] of attempts)if(now-v.start>60000)attempts.delete(k);
  const bucket=attempts.get(key)||{start:now,count:0};
  if(bucket.count>=90||(!attempts.has(key)&&attempts.size>=2000)){res.setHeader("Retry-After","60");res.status(429).json({message:"Demasiados intentos. Espera antes de continuar."});return;}
  bucket.count++;attempts.set(key,bucket);next();
}
type Handler=(req:AuthenticatedRequest)=>Promise<unknown>;
const run=(handler:Handler)=>async(req:AuthenticatedRequest,res:Response)=>{
  try{const result=await handler(req);if(result&&typeof result==="object"&&"expired" in result){res.status(410).json({message:"La solicitud venció; crea una nueva evaluación",data:result});return;}res.json({data:result});}
  catch(e){if(e instanceof DeliveryQuoteError||e instanceof EmailVerificationError){if(e instanceof EmailVerificationError&&e.retryAfterSeconds)res.setHeader("Retry-After",String(e.retryAfterSeconds));res.status(e.statusCode).json({message:e.message});return;}
    const known=e as {statusCode?:number;message?:string;code?:string};if(known.statusCode&&known.statusCode>=400&&known.statusCode<600){res.status(known.statusCode).json({message:known.message,code:known.code});return;}
    handleErrorServer(res,500,"No se pudo procesar la solicitud de despacho",e);
  }
};
const id=(req:Request)=>integer(Number(req.params.id));
function header(req:Request,name:string){const value=req.get(name);if(!value)throw new DeliveryQuoteError("Acceso no válido",404);return value;}

export const guestDeliveryQuotesRouter=Router();
guestDeliveryQuotesRouter.use(guestRate,(_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
for(const [prefix,purpose] of [["verification","GUEST_DELIVERY_REQUEST"],["access","GUEST_DELIVERY_ACCESS"]] as const){
  guestDeliveryQuotesRouter.post(`/${prefix}/request`,run(async req=>{const b=validateEmailRequestBody(req.body);if(!b.success)throw new DeliveryQuoteError(b.error,400);return requestDeliveryGuestVerificationService(header(req,"X-Guest-Session"),b.value.email,purpose);}));
  guestDeliveryQuotesRouter.post(`/${prefix}/verify`,run(async req=>{const b=validatePinBody(req.body);if(!b.success)throw new DeliveryQuoteError(b.error,400);return verifyDeliveryGuestService(header(req,"X-Guest-Session"),b.value.challengeId,b.value.pin,purpose);}));
}
guestDeliveryQuotesRouter.post("/",run(req=>createGuestDeliveryQuote(header(req,"X-Guest-Session"),req.body)));
guestDeliveryQuotesRouter.post("/:id/recover-access",run(req=>{const b=object(req.body,["challengeId"]);return recoverGuestDeliveryQuote(id(req),header(req,"X-Guest-Session"),integer(b.challengeId));}));
guestDeliveryQuotesRouter.get("/:id",run(req=>getDeliveryQuote(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")})));
guestDeliveryQuotesRouter.post("/:id/cancel",run(req=>actOnDeliveryQuote(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")},"CANCEL",req.body)));
guestDeliveryQuotesRouter.get("/:id/summary",run(req=>deliveryQuoteSummary(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")})));
guestDeliveryQuotesRouter.get("/:id/order",run(req=>deliveryQuoteOrder(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")})));
guestDeliveryQuotesRouter.post("/:id/checkout",async(req,res)=>run(r=>checkoutDeliveryQuote(id(r),{guestToken:header(r,"X-Delivery-Quote-Token")},r.body,ensureGuestDeviceCookie(req,res)))(req,res));
guestDeliveryQuotesRouter.post("/:id/payment",run(req=>resumeDeliveryQuotePayment(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")})));
guestDeliveryQuotesRouter.post("/:id/close-unpaid",run(req=>closeUnpaidDeliveryQuote(id(req),{guestToken:header(req,"X-Delivery-Quote-Token")},req.body)));

const router=Router();
router.use(authenticateJwt,verifyRoles(["ADMIN","MANAGER","WAREHOUSE","CLIENT"]),(_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
router.get("/settings",verifyRoles(["ADMIN","MANAGER"]),run(req=>getManualDeliverySettings(req.user!.id)));
router.put("/settings",verifyRoles(["ADMIN","MANAGER"]),run(req=>saveManualDeliverySettings(req.user!.id,req.body)));
router.get("/assignees",verifyRoles(["ADMIN","MANAGER"]),run(req=>quoteAssignees(req.user!.id)));
router.get("/",run(req=>listDeliveryQuotes(req.user!.id,req.query.beforeId===undefined?undefined:integer(Number(req.query.beforeId)),typeof req.query.status==="string"?req.query.status:undefined)));
router.post("/",verifyRoles(["CLIENT"]),run(req=>createClientDeliveryQuote(req.user!.id,req.body)));
router.get("/:id",run(req=>getDeliveryQuote(id(req),{userId:req.user!.id})));
for(const [path,action] of [["assign","ASSIGN"],["proposals","PROPOSE"],["approve","APPROVE"],["request-changes","CORRECTIONS"],["reject","REJECT"],["cancel","CANCEL"],["revoke-guest-access","REVOKE_ACCESS"]] as Array<[string,QuoteAction]>){
  const allowed=action==="PROPOSE"?["ADMIN","MANAGER","WAREHOUSE"]:action==="CANCEL"?["ADMIN","MANAGER","CLIENT"]:["ADMIN","MANAGER"];
  router.post(`/:id/${path}`,verifyRoles(allowed),run(req=>actOnDeliveryQuote(id(req),{userId:req.user!.id},action,req.body)));
}
router.get("/:id/summary",verifyRoles(["ADMIN","MANAGER","CLIENT"]),run(req=>deliveryQuoteSummary(id(req),{userId:req.user!.id})));
router.get("/:id/order",run(req=>deliveryQuoteOrder(id(req),{userId:req.user!.id})));
router.post("/:id/checkout",verifyRoles(["CLIENT"]),run(req=>checkoutDeliveryQuote(id(req),{userId:req.user!.id},req.body)));
router.post("/:id/payment",verifyRoles(["CLIENT"]),run(req=>resumeDeliveryQuotePayment(id(req),{userId:req.user!.id})));
router.post("/:id/close-unpaid",verifyRoles(["ADMIN","MANAGER","CLIENT"]),run(req=>closeUnpaidDeliveryQuote(id(req),{userId:req.user!.id},req.body)));
export default router;
