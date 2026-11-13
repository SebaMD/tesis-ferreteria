export type NoticeInput = {
  title: string;
  message: string;
  isActive: boolean;
  displaySeconds: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type CatalogPresentationInput = {
  title: string;
  mainText: string;
  secondaryText: string;
};

type Result = { success: true; value: NoticeInput } | { success: false; error: string };

const ALLOWED_FIELDS = [
  "title",
  "message",
  "isActive",
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
  // Requests must identify an instant, not a date in the server's local zone.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return { success: false as const, error: `${field} debe ser una fecha válida con zona horaria explícita` };
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || hour > 23 || minute > 59 || (second || 0) > 59) {
    return { success: false as const, error: `${field} no es una fecha válida` };
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
  if (!Number.isInteger(input.displaySeconds) || Number(input.displaySeconds) < 3 || Number(input.displaySeconds) > 30) {
    return { success: false, error: "El tiempo de visualizacion debe estar entre 3 y 30 segundos" };
  }
  const startsAt = optionalDate(input.startsAt, "El inicio de vigencia");
  if (!startsAt.success) return startsAt;
  const endsAt = optionalDate(input.endsAt, "El termino de vigencia");
  if (!endsAt.success) return endsAt;
  if (startsAt.value && endsAt.value && endsAt.value <= startsAt.value) {
    return { success: false, error: "La fecha de término debe ser posterior a la fecha y hora de inicio" };
  }
  const title = input.title.trim().replace(/\s+/g, " ");
  const message = input.message.trim();
  return {
    success: true,
    value: {
      title,
      message,
      isActive: input.isActive,
      displaySeconds: Number(input.displaySeconds),
      startsAt: startsAt.value,
      endsAt: endsAt.value,
    },
  };
}

export function customerNoticePeriodError(
  input: Pick<NoticeInput, "startsAt" | "endsAt">,
  original: Pick<NoticeInput, "startsAt" | "endsAt"> | null = null,
  now = new Date(),
): string | null {
  const start = input.startsAt?.getTime();
  const end = input.endsAt?.getTime();
  if (start !== undefined && !Number.isFinite(start)) return "La fecha de inicio no es válida";
  if (end !== undefined && !Number.isFinite(end)) return "La fecha de término no es válida";
  if (start !== undefined && start !== original?.startsAt?.getTime() && Math.floor(start / 60_000) < Math.floor(now.getTime() / 60_000)) {
    return "La fecha de inicio no puede ser anterior a la fecha y hora actuales";
  }
  if (start !== undefined && end !== undefined && end <= start) return "La fecha de término debe ser posterior a la fecha y hora de inicio";
  // An unchanged immediate-start historical period remains editable, not reprogrammed.
  const historicalEnd = original && !original.startsAt && end === original.endsAt?.getTime();
  if (start === undefined && end !== undefined && !historicalEnd && end <= now.getTime()) {
    return "La fecha de término debe ser posterior a la fecha y hora actuales";
  }
  return null;
}

export function validateCatalogPresentation(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false as const, error: "Debe ingresar los datos de la presentacion" };
  }
  const input = body as Record<string, unknown>;
  const allowedFields = ["title", "mainText", "secondaryText"];
  if (!Object.keys(input).every((key) => allowedFields.includes(key))) {
    return { success: false as const, error: "La presentacion contiene campos no permitidos" };
  }
  if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 120) {
    return { success: false as const, error: "El titulo debe contener entre 1 y 120 caracteres" };
  }
  if (typeof input.mainText !== "string" || input.mainText.trim().length < 1 || input.mainText.trim().length > 220) {
    return { success: false as const, error: "El texto principal debe contener entre 1 y 220 caracteres" };
  }
  if (typeof input.secondaryText !== "string" || input.secondaryText.trim().length < 1 || input.secondaryText.trim().length > 600) {
    return { success: false as const, error: "El texto secundario debe contener entre 1 y 600 caracteres" };
  }
  return {
    success: true as const,
    value: {
      title: input.title.trim().replace(/\s+/g, " "),
      mainText: input.mainText.trim(),
      secondaryText: input.secondaryText.trim(),
    },
  };
}

export function validateCustomerNoticeOrder(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false as const, error: "Debe ingresar el nuevo orden" };
  }
  const input = body as Record<string, unknown>;
  if (!Object.keys(input).every((key) => key === "noticeIds") || !Array.isArray(input.noticeIds)) {
    return { success: false as const, error: "Debe ingresar una lista valida de avisos" };
  }
  const noticeIds = input.noticeIds.map(Number);
  if (
    noticeIds.some((id) => !Number.isInteger(id) || id < 1)
    || new Set(noticeIds).size !== noticeIds.length
  ) {
    return { success: false as const, error: "La lista de avisos no es valida" };
  }
  return { success: true as const, value: noticeIds };
}
