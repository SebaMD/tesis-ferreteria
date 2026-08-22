import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createProductService,
  deleteProductService,
  editProductService,
  getProductByBarcodeService,
  getProductByIdService,
  getProductsService,
  ProductError,
} from "./products.service.js";
import { validateBarcode, validateCreateProductBody, validateEditProductBody } from "./products.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function msg(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function dbErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  if (typeof error.code === "string") return error.code;
  return null;
}

function databaseErrorCode(error: unknown): string | null {
  const directCode = dbErrorCode(error);
  if (directCode) return directCode;

  if (typeof error === "object" && error !== null && "cause" in error) {
    return dbErrorCode(error.cause);
  }

  return null;
}

function databaseErrorConstraint(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "constraint" in error) {
    return typeof error.constraint === "string" ? error.constraint : null;
  }

  if (typeof error === "object" && error !== null && "cause" in error) {
    return databaseErrorConstraint(error.cause);
  }

  return null;
}

export async function getProducts(req: AuthenticatedRequest, res: Response) {
  try {
    const includeInactive = req.user?.role === "ADMIN" || req.user?.role === "MANAGER";
    return handleSuccess(res, 200, "Productos obtenidos exitosamente", await getProductsService(includeInactive));
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener productos", msg(error));
  }
}

export async function getProductById(req: AuthenticatedRequest, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    const includeInactive = req.user?.role === "ADMIN" || req.user?.role === "MANAGER";
    return handleSuccess(res, 200, "Producto encontrado", await getProductByIdService(id, includeInactive));
  } catch (error) {
    const message = msg(error);
    if (message === "Producto no encontrado") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al obtener producto", message);
  }
}

export async function getProductByBarcode(req: Request, res: Response) {
  try {
    const validation = validateBarcode(req.params.barcode);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Codigo de barra invalido", validation.error);
    }

    return handleSuccess(
      res,
      200,
      "Producto encontrado",
      await getProductByBarcodeService(validation.value),
    );
  } catch (error) {
    if (error instanceof ProductError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al buscar producto por codigo de barra", msg(error));
  }
}

export async function createProductController(req: Request, res: Response) {
  try {
    const validation = validateCreateProductBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 201, "Producto creado exitosamente", await createProductService(validation.value));
  } catch (error) {
    if (error instanceof ProductError) return handleErrorClient(res, error.statusCode, error.message);
    if (databaseErrorCode(error) === "23505") {
      if (databaseErrorConstraint(error) === "products_barcode_unique") {
        return handleErrorClient(res, 409, "El codigo de barra ya esta asociado a otro producto");
      }
      return handleErrorClient(res, 409, "Ya existe un producto con ese nombre en la categoria seleccionada");
    }
    if (databaseErrorCode(error) === "23503") return handleErrorClient(res, 409, "La categoria seleccionada no existe");
    return handleErrorServer(res, 500, "Error al crear producto", msg(error));
  }
}

export async function editProduct(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    const validation = validateEditProductBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 200, "Producto actualizado exitosamente", await editProductService(id, validation.value));
  } catch (error) {
    if (error instanceof ProductError) return handleErrorClient(res, error.statusCode, error.message);
    const message = msg(error);
    if (message === "Producto no encontrado") return handleErrorClient(res, 404, message);
    if (databaseErrorCode(error) === "23505") {
      if (databaseErrorConstraint(error) === "products_barcode_unique") {
        return handleErrorClient(res, 409, "El codigo de barra ya esta asociado a otro producto");
      }
      return handleErrorClient(res, 409, "Ya existe un producto con ese nombre en la categoria seleccionada");
    }
    if (databaseErrorCode(error) === "23503") return handleErrorClient(res, 409, "La categoria seleccionada no existe");
    return handleErrorServer(res, 500, "Error al actualizar producto", message);
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    if (!(await deleteProductService(id))) return handleErrorClient(res, 404, "Producto no encontrado");
    return handleSuccess(res, 200, "Producto desactivado exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error al desactivar producto", msg(error));
  }
}
