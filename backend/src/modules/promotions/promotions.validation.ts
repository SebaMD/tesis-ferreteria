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
  // API dates must identify an instant, independently of the server's time zone.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return { success: false as const, error: `${label} debe ser una fecha válida con zona horaria explícita` };
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || hour > 23 || minute > 59 || (second || 0) > 59) {
    return { success: false as const, error: `${label} no es una fecha válida` };
  }
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
    return { success: false, error: "La fecha de término debe ser posterior a la fecha y hora de inicio" };
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

export function promotionPeriodError(
  input: Pick<PromotionInput, "startsAt" | "endsAt">,
  originalStart: Date | null = null,
  now = new Date(),
): string | null {
  const start = input.startsAt.getTime();
  if (!Number.isFinite(start)) return "La fecha de inicio no es válida";
  // datetime-local selects minutes: the current minute is valid, not earlier minutes.
  if (start !== originalStart?.getTime() && Math.floor(start / 60_000) < Math.floor(now.getTime() / 60_000)) {
    return "La fecha de inicio no puede ser anterior a la fecha y hora actuales";
  }
  if (input.endsAt && !Number.isFinite(input.endsAt.getTime())) return "La fecha de término no es válida";
  if (input.endsAt && input.endsAt.getTime() <= start) return "La fecha de término debe ser posterior a la fecha y hora de inicio";
  return null;
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
