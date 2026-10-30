import { Router } from "express";
import { authenticateJwt, type AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { AuditError, listProductAudits } from "./productAudits.service.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["ADMIN"]));
router.get("/", async (req: AuthenticatedRequest, res) => {
  try { return handleSuccess(res, 200, "Cambios administrativos registrados", await listProductAudits(req.user!.id, req.query)); }
  catch (error) {
    if (error instanceof AuditError) return handleErrorClient(res, error.statusCode, error.message);
    return handleErrorServer(res, 500, "No se pudo consultar el historial de cambios", error);
  }
});
export default router;
