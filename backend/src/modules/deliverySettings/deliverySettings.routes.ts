import { Router } from "express";
import { authenticateJwt, type AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { getDeliverySettings, saveDeliverySettings } from "./deliverySettings.service.js";
import { DeliveryPolicyError } from "./deliveryPricing.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]));
router.get("/", async (_req, res, next) => { try { res.setHeader("Cache-Control", "no-store"); res.json({ data: await getDeliverySettings() }); } catch (e) { next(e); } });
router.put("/", async (req: AuthenticatedRequest, res, next) => {
  try { res.json({ data: await saveDeliverySettings(req.user!.id, req.body) }); }
  catch (e) { if (e instanceof DeliveryPolicyError) res.status(e.statusCode).json({ message: e.message }); else next(e); }
});
export default router;
