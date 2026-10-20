import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { getCatalogProductByIdService, getCatalogProductsService } from "./catalog.service.js";
import { validateCatalogQuery } from "./catalog.validation.js";
import { findCatalogFamilyById } from "./catalog.repository.js";

export async function getCatalogFamily(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "Familia inválida");
  try {
    const family = await findCatalogFamilyById(id);
    return family ? handleSuccess(res, 200, "Familia encontrada", family) : handleErrorClient(res, 404, "Familia no disponible");
  } catch { return handleErrorServer(res, 500, "No se pudo obtener la familia"); }
}

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function getCatalogProducts(req: Request, res: Response) {
  const validation = validateCatalogQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    return handleErrorClient(res, 400, "Parametros de catalogo invalidos", validation.error);
  }

  try {
    return handleSuccess(
      res,
      200,
      "Catalogo obtenido exitosamente",
      await getCatalogProductsService(validation.value),
    );
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo obtener el catalogo", message(error));
  }
}

export async function getCatalogProductById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id del producto debe ser valido");

    return handleSuccess(
      res,
      200,
      "Producto encontrado",
      await getCatalogProductByIdService(id),
    );
  } catch (error) {
    const errorMessage = message(error);
    if (errorMessage === "Producto no encontrado") {
      return handleErrorClient(res, 404, errorMessage);
    }
    return handleErrorServer(res, 500, "No se pudo obtener el producto", errorMessage);
  }
}
