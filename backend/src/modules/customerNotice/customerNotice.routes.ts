import { raw, Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createCustomerNoticeController,
  deleteCustomerNoticeController,
  getCustomerNoticeConfiguration,
  getPublicCustomerNotice,
  removeCatalogPresentationImageController,
  removeCustomerNoticeImageController,
  reorderCustomerNoticesController,
  updateCatalogPresentationController,
  updateCustomerNoticeController,
  uploadCatalogPresentationImageController,
  uploadCustomerNoticeImageController,
} from "./customerNotice.controller.js";
import { MAX_IMAGE_FILE_SIZE } from "../../utils/imageFiles.js";
import { DeliveryNoticeImageError, deliveryImageRevision, setDeliveryNoticeImage } from "./deliveryNoticeImage.service.js";
import { ImageFileError } from "../../utils/imageFiles.js";
import { handleErrorServer } from "../../utils/helpers.js";

const router = Router();

router.get("/", getPublicCustomerNotice);
router.get("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), getCustomerNoticeConfiguration);
router.route("/configuration/delivery-image")
  .all(authenticateJwt, verifyRoles(["ADMIN","MANAGER"]))
  .post(raw({type:["image/jpeg","image/png","image/webp"],limit:MAX_IMAGE_FILE_SIZE}),async(req,res)=>{
    try {
      const revision=deliveryImageRevision(req.get("If-Match"));
      if(!Buffer.isBuffer(req.body)) throw new DeliveryNoticeImageError("Selecciona una imagen JPG, PNG o WebP",400);
      const user=(req as import("../../middlewares/authentication.middleware.js").AuthenticatedRequest).user!;
      res.json({data:await setDeliveryNoticeImage(user.id,revision,{buffer:req.body,mimeType:req.get("Content-Type")||""})});
    }catch(e){if(e instanceof DeliveryNoticeImageError || e instanceof ImageFileError){res.status(e.statusCode).json({message:e.message});return;}handleErrorServer(res,500,"No se pudo guardar la imagen del aviso automático",e);}
  })
  .delete(async(req,res)=>{
    try {
      if(req.body && Object.keys(req.body).length) throw new DeliveryNoticeImageError("La operación solo permite quitar la imagen",400);
      const user=(req as import("../../middlewares/authentication.middleware.js").AuthenticatedRequest).user!;
      res.json({data:await setDeliveryNoticeImage(user.id,deliveryImageRevision(req.get("If-Match")),null)});
    }catch(e){if(e instanceof DeliveryNoticeImageError){res.status(e.statusCode).json({message:e.message});return;}handleErrorServer(res,500,"No se pudo quitar la imagen del aviso automático",e);}
  });
router.put("/configuration/presentation", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCatalogPresentationController);
router.post(
  "/configuration/presentation/image",
  authenticateJwt,
  verifyRoles(["ADMIN", "MANAGER"]),
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_FILE_SIZE }),
  uploadCatalogPresentationImageController,
);
router.delete("/configuration/presentation/image", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), removeCatalogPresentationImageController);
router.patch("/configuration/order", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), reorderCustomerNoticesController);
router.post("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), createCustomerNoticeController);
router.post(
  "/configuration/:id/image",
  authenticateJwt,
  verifyRoles(["ADMIN", "MANAGER"]),
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_FILE_SIZE }),
  uploadCustomerNoticeImageController,
);
router.delete("/configuration/:id/image", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), removeCustomerNoticeImageController);
router.put("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCustomerNoticeController);
router.delete("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), deleteCustomerNoticeController);

export default router;
