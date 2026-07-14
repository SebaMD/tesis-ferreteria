import {
  countProductsByCategoryId,
  createCategory,
  deleteCategoryById,
  findCategories,
  findCategoryById,
  findCategoryByName,
  updateCategoryById,
} from "./categories.repository.js";
import type { CategoryBody, EditCategoryBody } from "./categories.validation.js";

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CategoryError";
  }
}

export async function getCategoriesService() {
  return findCategories();
}

export async function getCategoryByIdService(id: number) {
  const category = await findCategoryById(id);
  if (!category) throw new Error("Categoria no encontrada");
  return category;
}

export async function createCategoryService(data: CategoryBody) {
  const duplicate = await findCategoryByName(data.name);
  if (duplicate) {
    throw new CategoryError("Ya existe una categoria con ese nombre", 409);
  }

  return createCategory(data);
}

export async function editCategoryService(id: number, data: EditCategoryBody) {
  if (data.name) {
    const duplicate = await findCategoryByName(data.name, id);
    if (duplicate) {
      throw new CategoryError("Ya existe una categoria con ese nombre", 409);
    }
  }

  const category = await updateCategoryById(id, data);
  if (!category) throw new Error("Categoria no encontrada");
  return category;
}

export async function deleteCategoryService(id: number) {
  const category = await findCategoryById(id);
  if (!category) return false;

  const productsCount = await countProductsByCategoryId(id);
  if (productsCount > 0) {
    throw new CategoryError(
      "No se puede eliminar esta categoría porque tiene productos asociados. Modifique o reasigne los productos antes de eliminarla.",
      409,
    );
  }

  return Boolean(await deleteCategoryById(id));
}
