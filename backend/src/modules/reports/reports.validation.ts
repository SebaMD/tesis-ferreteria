export type ReportDateRange = {
  from: Date;
  toExclusive: Date;
  fromLabel: string;
  toLabel: string;
  cashierId?: number;
  paymentMethod?: string;
};

type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function queryValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: unknown, field: string): ValidationResult<{ date: Date; label: string }> {
  const label = queryValue(value);

  if (!DATE_PATTERN.test(label)) {
    return { success: false, error: `${field} debe tener formato YYYY-MM-DD` };
  }

  const [year, month, day] = label.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { success: false, error: `${field} no es una fecha valida` };
  }

  return { success: true, value: { date, label } };
}

function nextDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function isFutureDate(date: Date, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date > today;
}

export function validateDailyReportQuery(
  query: unknown,
  now = new Date(),
): ValidationResult<ReportDateRange> {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { success: false, error: "Debe indicar la fecha del reporte" };
  }

  const input = query as Record<string, unknown>;
  const parsedDate = parseDate(input.date, "La fecha");
  if (!parsedDate.success) return parsedDate;
  if (isFutureDate(parsedDate.value.date, now)) {
    return { success: false, error: "La fecha no puede ser futura" };
  }

  return {
    success: true,
    value: {
      from: parsedDate.value.date,
      toExclusive: nextDay(parsedDate.value.date),
      fromLabel: parsedDate.value.label,
      toLabel: parsedDate.value.label,
    },
  };
}

export function validateSalesReportQuery(
  query: unknown,
  now = new Date(),
): ValidationResult<ReportDateRange> {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { success: false, error: "Debe indicar un rango de fechas" };
  }

  const input = query as Record<string, unknown>;
  const parsedFrom = parseDate(input.from, "La fecha desde");
  if (!parsedFrom.success) return parsedFrom;

  const parsedTo = parseDate(input.to, "La fecha hasta");
  if (!parsedTo.success) return parsedTo;

  if (parsedFrom.value.date > parsedTo.value.date) {
    return { success: false, error: "La fecha desde no puede ser posterior a la fecha hasta" };
  }
  if (isFutureDate(parsedFrom.value.date, now)) {
    return { success: false, error: "La fecha desde no puede ser futura" };
  }
  if (isFutureDate(parsedTo.value.date, now)) {
    return { success: false, error: "La fecha hasta no puede ser futura" };
  }

  const value: ReportDateRange = {
    from: parsedFrom.value.date,
    toExclusive: nextDay(parsedTo.value.date),
    fromLabel: parsedFrom.value.label,
    toLabel: parsedTo.value.label,
  };

  if (input.cashierId !== undefined && queryValue(input.cashierId) !== "") {
    const cashierId = Number(input.cashierId);
    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return { success: false, error: "El cajero debe ser un identificador valido" };
    }
    value.cashierId = cashierId;
  }

  if (input.paymentMethod !== undefined && queryValue(input.paymentMethod) !== "") {
    const paymentMethod = queryValue(input.paymentMethod);
    if (paymentMethod.length > 50) {
      return { success: false, error: "El metodo de pago no es valido" };
    }
    value.paymentMethod = paymentMethod;
  }

  return { success: true, value };
}

export function validateManagerStatisticsQuery(
  query: unknown,
  now = new Date(),
): ValidationResult<ReportDateRange> {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { success: false, error: "Debe indicar un rango de fechas" };
  }

  const input = query as Record<string, unknown>;
  const parsedFrom = parseDate(input.from, "La fecha desde");
  if (!parsedFrom.success) return parsedFrom;

  const parsedTo = parseDate(input.to, "La fecha hasta");
  if (!parsedTo.success) return parsedTo;

  if (parsedFrom.value.date > parsedTo.value.date) {
    return { success: false, error: "La fecha desde no puede ser posterior a la fecha hasta" };
  }

  if (isFutureDate(parsedTo.value.date, now)) {
    return { success: false, error: "La fecha hasta no puede ser futura" };
  }

  const rangeDays = Math.round(
    (parsedTo.value.date.getTime() - parsedFrom.value.date.getTime()) / 86_400_000,
  ) + 1;
  if (rangeDays > 366) {
    return { success: false, error: "El rango no puede superar 366 días" };
  }

  return {
    success: true,
    value: {
      from: parsedFrom.value.date,
      toExclusive: nextDay(parsedTo.value.date),
      fromLabel: parsedFrom.value.label,
      toLabel: parsedTo.value.label,
    },
  };
}
