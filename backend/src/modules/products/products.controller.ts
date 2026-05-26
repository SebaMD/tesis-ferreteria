import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createProductService,
  deleteProductService,
  editProductService,
  getProductByIdService,
  getProductsService,
} from "./products.service.js";
import { validateCreateProductBody, validateEditProductBody } from "./products.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function msg(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function dbConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "23503" || error.code === "23505");
}

export async function getProducts(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Productos obtenidos exitosamente", await getProductsService());
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener productos", msg(error));
  }
}

export async function getProductById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    return handleSuccess(res, 200, "Producto encontrado", await getProductByIdService(id));
  } catch (error) {
    const message = msg(error);
    if (message === "Producto no encontrado") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al obtener producto", message);
  }
}

export async function createProductController(req: Request, res: Response) {
  try {
    const validation = validateCreateProductBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 201, "Producto creado exitosamente", await createProductService(validation.value));
  } catch (error) {
    if (dbConflict(error)) return handleErrorClient(res, 409, "No se pudo guardar el producto con estos datos");
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
    const message = msg(error);
    if (message === "Producto no encontrado") return handleErrorClient(res, 404, message);
    if (dbConflict(error)) return handleErrorClient(res, 409, "No se pudo actualizar el producto con estos datos");
    return handleErrorServer(res, 500, "Error al actualizar producto", message);
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    if (!(await deleteProductService(id))) return handleErrorClient(res, 404, "Producto no encontrado");
    return handleSuccess(res, 200, "Producto eliminado exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error al eliminar producto", msg(error));
  }
}
