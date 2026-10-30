import { Router, raw, type NextFunction, type Request, type Response } from "express";
import { getBundleOperation, getProductBundle, getProductConversion, getFamilyUnitEligibility, saveProductBundle } from "./productBundle.service.js";
import { authenticateJwt, type AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { FamilyError, getFamilyForManagement, listFamilies, saveFamily, validateFamilyBody, detachProductFamily, validateDetachFamilyBody, setFamilyArchived, validateFamilyStateBody } from "./productFamilies.service.js";
import { getAttributeRenameOperation, renameFamilyAttribute } from "./productAttributeRename.service.js";
import { familyCategoryOperation } from "./familyCategory.service.js";
import { familyDimensionOperation } from "./familyDimension.service.js";
import { familyBrandOperation } from "./familyBrand.service.js";
import { optionLabelOperation } from "./familyOptionLabel.service.js";
import { UnitChangeError } from "./productUnitEligibility.service.js";
import { familyDeactivationOperation } from "./familyDeactivation.service.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["ADMIN"]));
router.post("/:id/deactivations", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Familia desactivada", await familyDeactivationOperation(Number(req.params.id), req.user!.id, req.body)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo confirmar la desactivación. Consulta su resultado antes de reintentar.", e); }
});
router.get("/:id/deactivations/:key", async (req: AuthenticatedRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { return handleSuccess(res, 200, "Resultado de desactivación", await familyDeactivationOperation(Number(req.params.id), req.user!.id, undefined, String(req.params.key))); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar la desactivación", e); }
});
router.get("/:id/unit-eligibility", async (req: AuthenticatedRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { return handleSuccess(res, 200, "Vista previa de unidades", await getFamilyUnitEligibility(Number(req.params.id), req.user!.id, req.query)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar la elegibilidad", e); }
});
router.post("/:id/attributes/:attributeId/options/:optionId/label-corrections", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Etiqueta corregida", await optionLabelOperation(Number(req.params.id), Number(req.params.attributeId), Number(req.params.optionId), req.user!.id, req.body)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo confirmar la etiqueta. Consulte su resultado antes de reintentar.", e); }
});
router.get("/:id/attributes/:attributeId/options/:optionId/label-corrections/:key", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Resultado de corrección", await optionLabelOperation(Number(req.params.id), Number(req.params.attributeId), Number(req.params.optionId), req.user!.id, undefined, String(req.params.key))); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar la etiqueta", e); }
});
router.post("/:id/brand-corrections", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Marca corregida", await familyBrandOperation(Number(req.params.id), req.user!.id, req.body)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo confirmar la corrección. Consulte su resultado antes de reintentar.", e); }
});
router.get("/:id/brand-corrections/:key", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Resultado de corrección", await familyBrandOperation(Number(req.params.id), req.user!.id, undefined, String(req.params.key))); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar el resultado", e); }
});
router.post("/:id/dimension-additions",async(req:AuthenticatedRequest,res)=>{
 try{return handleSuccess(res,200,"Atributo incorporado",await familyDimensionOperation(Number(req.params.id),req.user!.id,req.body));}
 catch(e){if(e instanceof FamilyError)return handleErrorClient(res,e.statusCode,e.message);return handleErrorServer(res,500,"No se pudo confirmar la ampliación. Consulte el resultado antes de reintentar.",e);}
});
router.get("/:id/dimension-additions/:key",async(req:AuthenticatedRequest,res)=>{
 try{return handleSuccess(res,200,"Resultado de ampliación",await familyDimensionOperation(Number(req.params.id),req.user!.id,undefined,String(req.params.key)));}
 catch(e){if(e instanceof FamilyError)return handleErrorClient(res,e.statusCode,e.message);return handleErrorServer(res,500,"No se pudo consultar el resultado",e);}
});
router.post("/:id/category-changes", async (req: AuthenticatedRequest,res)=>{
  try{return handleSuccess(res,200,"Categoría actualizada",await familyCategoryOperation(Number(req.params.id),req.user!.id,req.body));}
  catch(e){if(e instanceof FamilyError)return handleErrorClient(res,e.statusCode,e.message);return handleErrorServer(res,500,"No se pudo confirmar la reclasificación. Consulte su resultado antes de reintentar.",e);}
});
router.get("/:id/category-changes/:key",async(req:AuthenticatedRequest,res)=>{
  try{return handleSuccess(res,200,"Resultado de reclasificación",await familyCategoryOperation(Number(req.params.id),req.user!.id,undefined,String(req.params.key)));}
  catch(e){if(e instanceof FamilyError)return handleErrorClient(res,e.statusCode,e.message);return handleErrorServer(res,500,"No se pudo consultar el resultado",e);}
});
router.post("/:id/attributes/:attributeId/rename", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Nombre del atributo actualizado", await renameFamilyAttribute(Number(req.params.id), Number(req.params.attributeId), req.body, req.user!.id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo confirmar el renombrado. Consulte su resultado antes de reintentar.", e); }
});
router.get("/:id/attributes/:attributeId/rename-operations/:key", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Resultado del renombrado", await getAttributeRenameOperation(Number(req.params.id), Number(req.params.attributeId), String(req.params.key), req.user!.id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar el renombrado", e); }
});
router.get("/conversion/:id", async (req, res) => {
  try { const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("ID inválido", 400);
    return handleSuccess(res, 200, "Producto original para conversión", await getProductConversion(id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo revisar la conversión", e); }
});
router.get("/operations/:key", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Resultado de la operación", await getBundleOperation(String(req.params.key), req.user!.id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar la operación", e); }
});
router.get("/:id/bundle", async (req, res) => {
  try { const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("ID inválido", 400);
    return handleSuccess(res, 200, "Familia y variantes", await getProductBundle(id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorServer(res, 500, "No se pudo consultar la familia", e); }
});
// A dedicated bounded parser keeps image payloads out of the general JSON limit.
const bundleBodyParser = raw({ type: "application/vnd.fyf.product-bundle+json", limit: "22mb" });
function parseBundleBody(req: Request, res: Response, next: NextFunction) {
  bundleBodyParser(req, res, (error) => {
    if (!error) { next(); return; }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      handleErrorClient(res, 413, "El conjunto de productos e imágenes no puede superar 22 MB");
      return;
    }
    next(error);
  });
}
router.post("/bundle", parseBundleBody, async (req: AuthenticatedRequest, res) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) { try { body = JSON.parse(body.toString("utf8")); } catch { throw new FamilyError("JSON inválido", 400); } }
    return handleSuccess(res, 200, "Familia y variantes guardadas", await saveProductBundle(body, req.user!.id));
  } catch (e) {
    const known = e as { statusCode?: number; message?: string };
    if (known.statusCode && known.statusCode >= 400 && known.statusCode < 500) {
      return handleErrorClient(res, known.statusCode, known.message ?? "Revise los datos", e instanceof UnitChangeError ? e.details : undefined);
    }
    return handleErrorServer(res, 500, "No se pudo guardar el conjunto. Consulte el resultado antes de reintentar.", e);
  }
});
router.post("/variants/:id/detach", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("ID inválido", 400);
    const result = await detachProductFamily(id, validateDetachFamilyBody(req.body), req.user!.id);
    return handleSuccess(res, 200, "Producto desvinculado sin modificar sus datos comerciales", result);
  } catch (e) {
    if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message);
    return handleErrorServer(res, 500, "No se pudo desvincular el producto", e);
  }
});
router.get("/", async (_req, res) => { try { return handleSuccess(res, 200, "Familias", await listFamilies()); } catch (e) { return handleErrorServer(res, 500, "No se pudieron consultar las familias", e); } });
router.post("/", async (req, res) => {
  try { const id = await saveFamily(validateFamilyBody(req.body)); return handleSuccess(res, 201, "Familia creada", await getFamilyForManagement(id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorClient(res, 409, "No se pudo guardar: revise nombre único y categoría existente"); }
});
router.patch("/:id", async (req, res) => {
  try { const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) throw new FamilyError("ID inválido", 400);
    await saveFamily(validateFamilyBody(req.body), id); return handleSuccess(res, 200, "Familia actualizada", await getFamilyForManagement(id)); }
  catch (e) { if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message); return handleErrorClient(res, 409, "No se pudo guardar la familia; no se modificaron sus variantes"); }
});
for (const action of ["archive", "reactivate"] as const) {
  router.post(`/:id/${action}`, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("ID inválido", 400);
      const body = validateFamilyStateBody(req.body);
      await setFamilyArchived(id, action === "archive", req.user!.id, body.expectedUpdatedAt);
      return handleSuccess(res, 200, action === "archive" ? "Familia archivada" : "Familia reactivada", await getFamilyForManagement(id));
    } catch (e) {
      if (e instanceof FamilyError) return handleErrorClient(res, e.statusCode, e.message);
      return handleErrorServer(res, 500, "No se pudo cambiar el estado de la familia", e);
    }
  });
}
router.delete("/:id", (_req, res) => {
  res.set("Allow", "PATCH");
  return handleErrorClient(res, 405, "La eliminación física de familias no está permitida. Utilice el archivado.");
});
export default router;
