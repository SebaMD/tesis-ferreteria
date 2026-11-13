export const PROMOTION_START_PAST = 'La fecha de inicio no puede ser anterior a la fecha y hora actuales';
export const PROMOTION_END_ORDER = 'La fecha de término debe ser posterior a la fecha y hora de inicio';

export function localDateTime(value = Date.now()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function parsePromotionLocalDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number);
  const date = new Date(value);
  // Reject normalized dates and nonexistent local times at DST transitions.
  return Number.isFinite(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute ? date : null;
}

export function promotionDates(form, original, now = Date.now()) {
  const startUnchanged = Boolean(original?.startsAt && form.startsAt === localDateTime(original.startsAt));
  const endUnchanged = Boolean(original?.endsAt && form.endsAt === localDateTime(original.endsAt));
  const startsAt = startUnchanged ? new Date(original.startsAt) : parsePromotionLocalDate(form.startsAt);
  const endsAt = endUnchanged ? new Date(original.endsAt) : form.endsAt ? parsePromotionLocalDate(form.endsAt) : null;
  const errors = {};
  if (!startsAt) errors.startsAt = 'La fecha de inicio no es válida';
  else if (!startUnchanged && Math.floor(startsAt.getTime() / 60_000) < Math.floor(now / 60_000)) errors.startsAt = PROMOTION_START_PAST;
  if (form.endsAt && !endsAt) errors.endsAt = 'La fecha de término no es válida';
  else if (endsAt && startsAt && endsAt.getTime() <= startsAt.getTime()) errors.endsAt = PROMOTION_END_ORDER;
  return { startsAt, endsAt, startUnchanged, errors };
}
