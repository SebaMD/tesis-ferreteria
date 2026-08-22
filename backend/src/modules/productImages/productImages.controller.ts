import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  deleteProductImageService,
  ProductImageError,
  reorderProductImagesService,
  setPrimaryProductImageService,
  uploadProductImageService,
} from "./productImages.service.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function handleProductImageError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ProductImageError) {
    return handleErrorClient(res, error.statusCode, error.message);
  }
  return handleErrorServer(res, 500, fallback, message(error));
}

export async function uploadProductImageController(req: Request, res: Response) {
  try {
    const productId = parseId(req.params.id);
    if (!productId) return handleErrorClient(res, 400, "El id del producto debe ser valido");
    if (!Buffer.isBuffer(req.body)) return handleErrorClient(res, 400, "Debe enviar una imagen valida");

    const image = await uploadProductImageService(productId, {
      buffer: req.body,
      mimeType: String(req.headers["content-type"] || "").split(";")[0],
    });
    return handleSuccess(res, 201, "Imagen agregada exitosamente", image);
  } catch (error) {
    return handleProductImageError(res, error, "No se pudo agregar la imagen");
  }
}

export async function setPrimaryProductImageController(req: Request, res: Response) {
  try {
    const productId = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);
    if (!productId || !imageId) return handleErrorClient(res, 400, "Los ids deben ser validos");

    return handleSuccess(
      res,
      200,
      "Imagen principal actualizada",
      await setPrimaryProductImageService(productId, imageId),
    );
  } catch (error) {
    return handleProductImageError(res, error, "No se pudo actualizar la imagen principal");
  }
}

export async function deleteProductImageController(req: Request, res: Response) {
  try {
    const productId = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);
    if (!productId || !imageId) return handleErrorClient(res, 400, "Los ids deben ser validos");

    return handleSuccess(
      res,
      200,
      "Imagen eliminada exitosamente",
      await deleteProductImageService(productId, imageId),
    );
  } catch (error) {
    return handleProductImageError(res, error, "No se pudo eliminar la imagen");
  }
}

export async function reorderProductImagesController(req: Request, res: Response) {
  try {
    const productId = parseId(req.params.id);
    if (!productId) return handleErrorClient(res, 400, "El id del producto debe ser valido");

    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds.map(Number) : [];
    if (
      imageIds.length === 0
      || imageIds.some((id: number) => !Number.isInteger(id) || id < 1)
      || new Set(imageIds).size !== imageIds.length
    ) {
      return handleErrorClient(res, 400, "Debe enviar una lista valida de imagenes");
    }

    return handleSuccess(
      res,
      200,
      "Orden de imagenes actualizado",
      await reorderProductImagesService(productId, imageIds),
    );
  } catch (error) {
    return handleProductImageError(res, error, "No se pudo ordenar las imagenes");
  }
}
