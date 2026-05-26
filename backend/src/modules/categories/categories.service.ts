import {
  createCategory,
  deleteCategoryById,
  findCategories,
  findCategoryById,
  updateCategoryById,
} from "./categories.repository.js";
import type { CategoryBody, EditCategoryBody } from "./categories.validation.js";

export async function getCategoriesService() {
  return findCategories();
}

export async function getCategoryByIdService(id: number) {
  const category = await findCategoryById(id);
  if (!category) throw new Error("Categoria no encontrada");
  return category;
}

export async function createCategoryService(data: CategoryBody) {
  return createCategory(data);
}

export async function editCategoryService(id: number, data: EditCategoryBody) {
  const category = await updateCategoryById(id, data);
  if (!category) throw new Error("Categoria no encontrada");
  return category;
}

export async function deleteCategoryService(id: number) {
  return Boolean(await deleteCategoryById(id));
}
