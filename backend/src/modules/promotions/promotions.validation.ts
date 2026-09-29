import { PROMOTION_TYPES, type PromotionType } from "../../db/schema/index.js";

export type PromotionInput = {
  name: string;
  type: PromotionType;
  isActive: boolean;
  percentage: number | null;
  startsAt: Date;
  endsAt: Date | null;
  productIds: number[];
  categoryIds: number[];
};

type Result<T> = { success: true; value: T } | { success: false; error: string };

function parseDate(value: unknown, label: string, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) {
    return { success: true as const, value: null };
  }
  if (typeof value !== "string") return { success: false as const, error: `${label} no es valido` };
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { success: false as const, error: `${label} no es valido` }
    : { success: true as const, value: date };
}

function idList(value: unknown, label: string): Result<number[]> {
  if (!Array.isArray(value)) return { success: false, error: `${label} debe ser una lista` };
  const ids = [...new Set(value.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { success: false, error: `${label} contiene identificadores invalidos` };
  }
  return { success: true, value: ids };
}

export function validatePromotion(body: unknown): Result<PromotionInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar los datos de la promocion" };
  }
  const input = body as Record<string, unknown>;
  const allowed = ["name", "type", "isActive", "percentage", "startsAt", "endsAt", "productIds", "categoryIds"];
  if (!Object.keys(input).every((key) => allowed.includes(key))) {
    return { success: false, error: "La promocion contiene campos no permitidos" };
  }

  if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 160) {
    return { success: false, error: "El nombre debe contener entre 2 y 160 caracteres" };
  }
  if (typeof input.type !== "string" || !PROMOTION_TYPES.includes(input.type as PromotionType)) {
    return { success: false, error: "El tipo de promocion no es valido" };
  }
  if (typeof input.isActive !== "boolean") {
    return { success: false, error: "El estado de la promocion no es valido" };
  }

  const type = input.type as PromotionType;
  let percentage: number | null = null;
  if (type === "PERCENTAGE_DISCOUNT") {
    percentage = Number(input.percentage);
    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 99) {
      return { success: false, error: "El porcentaje debe ser un entero entre 1 y 99" };
    }
  } else if (input.percentage !== null && input.percentage !== undefined && input.percentage !== "") {
    return { success: false, error: "La promocion 2x1 no utiliza porcentaje" };
  }

  const startsAt = parseDate(input.startsAt, "El inicio de vigencia");
  if (!startsAt.success || !startsAt.value) return startsAt as Result<never>;
  const endsAt = parseDate(input.endsAt, "El termino de vigencia", true);
  if (!endsAt.success) return endsAt as Result<never>;
  if (endsAt.value && endsAt.value <= startsAt.value) {
    return { success: false, error: "El termino de vigencia debe ser posterior al inicio" };
  }

  const products = idList(input.productIds, "Los productos");
  if (!products.success) return products;
  const categories = idList(input.categoryIds, "Las categorias");
  if (!categories.success) return categories;
  if (products.value.length === 0 && categories.value.length === 0) {
    return { success: false, error: "Debe seleccionar al menos un producto o una categoria" };
  }

  return {
    success: true,
    value: {
      name: input.name.trim().replace(/\s+/g, " "),
      type,
      isActive: input.isActive,
      percentage,
      startsAt: startsAt.value,
      endsAt: endsAt.value,
      productIds: products.value,
      categoryIds: categories.value,
    },
  };
}

export function validatePromotionStatus(body: unknown): Result<boolean> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar el estado" };
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.isActive !== "boolean") {
    return { success: false, error: "El estado de la promocion no es valido" };
  }
  return { success: true, value: input.isActive };
}
