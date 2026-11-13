import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerNoticeDates } from '../src/helpers/customerNoticeDates.js';
import { localDateTime } from '../src/helpers/promotionDates.js';

const now = Date.parse('2026-11-13T02:30:59.999Z');
const form = { startsAt: '', endsAt: '', indefinite: true, isActive: false };
test('optional start, current minute, future and past across Chilean midnight', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/Santiago';
  try {
    assert.deepEqual(customerNoticeDates(form, null, now).errors, {});
    for (const startsAt of ['2026-11-12T23:30', '2026-11-13T00:01']) assert.deepEqual(customerNoticeDates({ ...form, startsAt }, null, now).errors, {});
    assert.ok(customerNoticeDates({ ...form, startsAt: '2026-11-12T23:29' }, null, now).errors.startsAt);
    for (const startsAt of ['2026-02-30T12:30', 'invalid', '2026-09-06T00:30']) assert.ok(customerNoticeDates({ ...form, startsAt }, null, now).errors.startsAt);
    assert.equal(customerNoticeDates({ ...form, startsAt: '2026-11-13T00:01' }, null, now).startsAt.toISOString(), '2026-11-13T03:01:00.000Z');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('strict optional end, immediate start and indefinite draft never mutate form', () => {
  const startsAt = localDateTime(now + 60_000), endsAt = localDateTime(now + 120_000);
  for (const end of [localDateTime(now - 60_000), startsAt]) assert.ok(customerNoticeDates({ ...form, startsAt, endsAt: end, indefinite: false }, null, now).errors.endsAt);
  assert.deepEqual(customerNoticeDates({ ...form, startsAt, endsAt, indefinite: false }, null, now).errors, {});
  assert.ok(customerNoticeDates({ ...form, endsAt: localDateTime(now), indefinite: false }, null, now).errors.endsAt);
  assert.deepEqual(customerNoticeDates({ ...form, endsAt, indefinite: false }, null, now).errors, {});
  assert.ok(customerNoticeDates({ ...form, indefinite: false }, null, now).errors.endsAt);
  const draft = { ...form, endsAt }, copy = { ...draft };
  assert.equal(customerNoticeDates(draft, null, now).endsAt, null); assert.deepEqual(draft, copy);
  assert.equal(customerNoticeDates({ ...draft, indefinite: false }, null, now).endsAt.toISOString(), new Date(endsAt).toISOString());
});
test('unchanged history preserves seconds/milliseconds, not replacement past dates', () => {
  const original = { startsAt: '2026-10-01T12:00:20.123Z', endsAt: '2026-10-01T12:00:40.456Z' };
  const draft = { ...form, indefinite: false, startsAt: localDateTime(original.startsAt), endsAt: localDateTime(original.endsAt) };
  const dates = customerNoticeDates(draft, original, now);
  assert.deepEqual(dates.errors, {}); assert.equal(dates.startsAt.toISOString(), original.startsAt); assert.equal(dates.endsAt.toISOString(), original.endsAt);
  assert.ok(customerNoticeDates({ ...draft, startsAt: localDateTime('2026-09-01T12:00:00Z') }, original, now).errors.startsAt);
  const immediate = { startsAt: null, endsAt: original.endsAt };
  assert.deepEqual(customerNoticeDates({ ...draft, startsAt: '' }, immediate, now).errors, {});
  assert.ok(customerNoticeDates({ ...draft, startsAt: '', endsAt: localDateTime('2026-09-01T12:00:00Z') }, immediate, now).errors.endsAt);
  assert.ok(customerNoticeDates({ ...draft, startsAt: '' }, original, now).errors.endsAt);
});
