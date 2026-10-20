import { Router } from "express";
import { authenticateJwt, type AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { FamilyError, getFamilyForManagement, listFamilies, saveFamily, validateFamilyBody, detachProductFamily, validateDetachFamilyBody, setFamilyArchived, validateFamilyStateBody } from "./productFamilies.service.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["ADMIN"]));
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
