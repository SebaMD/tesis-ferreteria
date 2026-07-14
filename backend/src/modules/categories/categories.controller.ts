import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  CategoryError,
  createCategoryService,
  deleteCategoryService,
  editCategoryService,
  getCategoriesService,
  getCategoryByIdService,
} from "./categories.service.js";
import { validateCreateCategoryBody, validateEditCategoryBody } from "./categories.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function getCategories(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Categorias obtenidas exitosamente", await getCategoriesService());
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener categorias", getErrorMessage(error));
  }
}

export async function getCategoryById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    return handleSuccess(res, 200, "Categoria encontrada", await getCategoryByIdService(id));
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "Categoria no encontrada") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al obtener categoria", message);
  }
}

export async function createCategoryController(req: Request, res: Response) {
  try {
    const validation = validateCreateCategoryBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 201, "Categoria creada exitosamente", await createCategoryService(validation.value));
  } catch (error) {
    if (error instanceof CategoryError) return handleErrorClient(res, error.statusCode, error.message);
    if (isUniqueError(error)) return handleErrorClient(res, 409, "Ya existe una categoria con estos datos");
    return handleErrorServer(res, 500, "Error al crear categoria", getErrorMessage(error));
  }
}

export async function editCategory(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    const validation = validateEditCategoryBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 200, "Categoria actualizada exitosamente", await editCategoryService(id, validation.value));
  } catch (error) {
    if (error instanceof CategoryError) return handleErrorClient(res, error.statusCode, error.message);
    const message = getErrorMessage(error);
    if (message === "Categoria no encontrada") return handleErrorClient(res, 404, message);
    if (isUniqueError(error)) return handleErrorClient(res, 409, "Ya existe una categoria con estos datos");
    return handleErrorServer(res, 500, "Error al actualizar categoria", message);
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    if (!(await deleteCategoryService(id))) return handleErrorClient(res, 404, "Categoria no encontrada");
    return handleSuccess(res, 200, "Categoria eliminada exitosamente");
  } catch (error) {
    if (error instanceof CategoryError) return handleErrorClient(res, error.statusCode, error.message);
    return handleErrorServer(res, 500, "Error al eliminar categoria", getErrorMessage(error));
  }
}
