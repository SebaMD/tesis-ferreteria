import type { NewProduct } from "../../db/schema/index.js";

export type ProductBody = Pick<
  NewProduct,
  "categoryId" | "name" | "description" | "price" | "unitMeasure" | "minimumStock" | "status"
>;
export type EditProductBody = Partial<ProductBody>;

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function text(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function positiveInt(value: unknown, field: string, allowZero = false): { success: true; value: number } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isInteger(number) || (allowZero ? number < 0 : number < 1)) {
    return { success: false, error: `${field} debe ser un numero entero valido` };
  }
  return { success: true, value: number };
}

function money(value: unknown): { success: true; value: string } | { success: false; error: string } {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return { success: false, error: "El precio debe ser un numero valido" };
  return { success: true, value: number.toFixed(2) };
}

function validateBase(body: unknown, partial: boolean): ValidationResult<EditProductBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { success: false, error: "Debe enviar datos validos" };

  const input = body as Record<string, unknown>;
  const value: EditProductBody = {};
  const allowed = ["categoryId", "name", "description", "price", "unitMeasure", "minimumStock", "status"];

  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) return { success: false, error: `El campo ${field} no esta permitido` };
  }

  if (input.categoryId !== undefined) {
    const parsed = positiveInt(input.categoryId, "La categoria");
    if (!parsed.success) return { success: false, error: parsed.error };
    value.categoryId = parsed.value;
  }

  if (input.name !== undefined) {
    if (typeof input.name !== "string") return { success: false, error: "El nombre debe ser texto" };
    const name = text(input.name);
    if (name.length < 2 || name.length > 150) return { success: false, error: "El nombre debe tener entre 2 y 150 caracteres" };
    value.name = name;
  }

  if (input.description !== undefined) {
    if (input.description === null || input.description === "") value.description = null;
    else {
      if (typeof input.description !== "string") return { success: false, error: "La descripcion debe ser texto" };
      value.description = text(input.description);
    }
  }

  if (input.price !== undefined) {
    const parsed = money(input.price);
    if (!parsed.success) return { success: false, error: parsed.error };
    value.price = parsed.value;
  }

  if (input.unitMeasure !== undefined) {
    if (typeof input.unitMeasure !== "string") return { success: false, error: "La unidad de medida debe ser texto" };
    const unitMeasure = text(input.unitMeasure);
    if (unitMeasure.length < 1 || unitMeasure.length > 50) return { success: false, error: "La unidad de medida no es valida" };
    value.unitMeasure = unitMeasure;
  }

  if (input.minimumStock !== undefined) {
    const parsed = positiveInt(input.minimumStock, "El stock minimo", true);
    if (!parsed.success) return { success: false, error: parsed.error };
    value.minimumStock = parsed.value;
  }

  if (input.status !== undefined) {
    if (typeof input.status !== "boolean") return { success: false, error: "El estado debe ser booleano" };
    value.status = input.status;
  }

  if (!partial) {
    for (const field of ["categoryId", "name", "price", "unitMeasure"] as const) {
      if (value[field] === undefined) return { success: false, error: `El campo ${field} es obligatorio` };
    }
  }

  if (partial && Object.keys(value).length === 0) return { success: false, error: "Debe especificar al menos 1 parametro valido" };

  return { success: true, value };
}

export function validateCreateProductBody(body: unknown): ValidationResult<ProductBody> {
  const result = validateBase(body, false);
  if (!result.success) return result;
  return { success: true, value: result.value as ProductBody };
}

export function validateEditProductBody(body: unknown): ValidationResult<EditProductBody> {
  return validateBase(body, true);
}
