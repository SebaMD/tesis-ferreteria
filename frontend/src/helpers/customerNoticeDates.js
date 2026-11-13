import { localDateTime, parsePromotionLocalDate } from './promotionDates.js';

export const NOTICE_START_PAST = 'La fecha de inicio no puede ser anterior a la fecha y hora actuales';
export const NOTICE_END_ORDER = 'La fecha de término debe ser posterior a la fecha y hora de inicio';
export const NOTICE_END_NOW = 'La fecha de término debe ser posterior a la fecha y hora actuales';

// Keep exact stored instants when an unchanged datetime-local only displays minutes.
export function customerNoticeDates(form, original = null, now = Date.now()) {
  const startUnchanged = Boolean(original?.startsAt && form.startsAt === localDateTime(original.startsAt));
  const endUnchanged = Boolean(original?.endsAt && form.endsAt === localDateTime(original.endsAt));
  const startsAt = startUnchanged ? new Date(original.startsAt) : form.startsAt ? parsePromotionLocalDate(form.startsAt) : null;
  const endsAt = form.indefinite ? null : endUnchanged ? new Date(original.endsAt) : form.endsAt ? parsePromotionLocalDate(form.endsAt) : null;
  const errors = {};
  if (form.startsAt && !startsAt) errors.startsAt = 'La fecha de inicio no es válida';
  else if (startsAt && !startUnchanged && Math.floor(startsAt.getTime() / 60_000) < Math.floor(now / 60_000)) errors.startsAt = NOTICE_START_PAST;
  if (!form.indefinite) {
    if (!endsAt) errors.endsAt = form.endsAt ? 'La fecha de término no es válida' : 'Ingrese la fecha de término o seleccione Vigencia indefinida';
    else if (startsAt && endsAt.getTime() <= startsAt.getTime()) errors.endsAt = NOTICE_END_ORDER;
    else if (!startsAt && !(original && !original.startsAt && endUnchanged) && endsAt.getTime() <= now) errors.endsAt = NOTICE_END_NOW;
  }
  return { startsAt, endsAt, startUnchanged, endUnchanged, errors };
}
