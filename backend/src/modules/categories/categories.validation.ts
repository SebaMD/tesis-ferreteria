import type { NewCategory } from "../../db/schema/index.js";

export type CategoryBody = Pick<NewCategory, "name" | "description">;
export type EditCategoryBody = Partial<CategoryBody>;

type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateBase(body: unknown, partial: boolean): ValidationResult<EditCategoryBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar datos validos" };
  }

  const input = body as Record<string, unknown>;
  const value: EditCategoryBody = {};
  const allowedFields = ["name", "description"];

  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) return { success: false, error: `El campo ${field} no esta permitido` };
  }

  if (input.name !== undefined) {
    if (typeof input.name !== "string") return { success: false, error: "El nombre debe ser texto" };
    const name = normalizeText(input.name);
    if (name.length < 2 || name.length > 100) {
      return { success: false, error: "El nombre debe tener entre 2 y 100 caracteres" };
    }
    value.name = name;
  }

  if (input.description !== undefined) {
    if (input.description === null || input.description === "") value.description = null;
    else {
      if (typeof input.description !== "string") return { success: false, error: "La descripcion debe ser texto" };
      value.description = normalizeText(input.description);
    }
  }

  if (!partial && !value.name) return { success: false, error: "El nombre es obligatorio" };
  if (partial && Object.keys(value).length === 0) {
    return { success: false, error: "Debe especificar al menos 1 parametro valido" };
  }

  return { success: true, value };
}

export function validateCreateCategoryBody(body: unknown): ValidationResult<CategoryBody> {
  const result = validateBase(body, false);
  if (!result.success) return result;
  return { success: true, value: result.value as CategoryBody };
}

export function validateEditCategoryBody(body: unknown): ValidationResult<EditCategoryBody> {
  return validateBase(body, true);
}
