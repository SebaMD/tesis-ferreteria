export type NoticeInput = {
  title: string;
  message: string;
  isActive: boolean;
  sortOrder: number;
  displaySeconds: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

type Result = { success: true; value: NoticeInput } | { success: false; error: string };

const ALLOWED_FIELDS = [
  "title",
  "message",
  "isActive",
  "sortOrder",
  "displaySeconds",
  "startsAt",
  "endsAt",
];

function optionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return { success: true as const, value: null };
  }
  if (typeof value !== "string") {
    return { success: false as const, error: `${field} no es una fecha valida` };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { success: false as const, error: `${field} no es una fecha valida` };
  }
  return { success: true as const, value: parsed };
}

export function validateCustomerNotice(body: unknown): Result {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar los datos del aviso" };
  }
  const input = body as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ALLOWED_FIELDS.includes(key))) {
    return { success: false, error: "El aviso contiene campos no permitidos" };
  }
  if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 120) {
    return { success: false, error: "El titulo debe contener entre 1 y 120 caracteres" };
  }
  if (typeof input.message !== "string" || input.message.trim().length < 1 || input.message.trim().length > 1000) {
    return { success: false, error: "El mensaje debe contener entre 1 y 1000 caracteres" };
  }
  if (typeof input.isActive !== "boolean") {
    return { success: false, error: "El estado del aviso no es valido" };
  }
  if (!Number.isInteger(input.sortOrder) || Number(input.sortOrder) < 0 || Number(input.sortOrder) > 9999) {
    return { success: false, error: "El orden debe ser un entero entre 0 y 9999" };
  }
  if (!Number.isInteger(input.displaySeconds) || Number(input.displaySeconds) < 3 || Number(input.displaySeconds) > 30) {
    return { success: false, error: "El tiempo de visualizacion debe estar entre 3 y 30 segundos" };
  }
  const startsAt = optionalDate(input.startsAt, "El inicio de vigencia");
  if (!startsAt.success) return startsAt;
  const endsAt = optionalDate(input.endsAt, "El termino de vigencia");
  if (!endsAt.success) return endsAt;
  if (startsAt.value && endsAt.value && endsAt.value <= startsAt.value) {
    return { success: false, error: "El termino de vigencia debe ser posterior al inicio" };
  }
  const title = input.title.trim().replace(/\s+/g, " ");
  const message = input.message.trim();
  return {
    success: true,
    value: {
      title,
      message,
      isActive: input.isActive,
      sortOrder: Number(input.sortOrder),
      displaySeconds: Number(input.displaySeconds),
      startsAt: startsAt.value,
      endsAt: endsAt.value,
    },
  };
}
