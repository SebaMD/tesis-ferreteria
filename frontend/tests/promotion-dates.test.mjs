import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateTime, parsePromotionLocalDate, promotionDates } from '../src/helpers/promotionDates.js';

const now = Date.parse('2026-11-13T02:30:59.999Z');
test('current minute, future and past are compared as instants across the Chilean midnight', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/Santiago';
  try {
    assert.equal(localDateTime(now), '2026-11-12T23:30');
    assert.equal(Object.keys(promotionDates({ startsAt: '2026-11-12T23:30', endsAt: '' }, null, now).errors).length, 0);
    assert.ok(promotionDates({ startsAt: '2026-11-12T23:29', endsAt: '' }, null, now).errors.startsAt);
    assert.equal(promotionDates({ startsAt: '2026-11-13T00:01', endsAt: '' }, null, now).startsAt.toISOString(), '2026-11-13T03:01:00.000Z');
    assert.equal(parsePromotionLocalDate('2026-02-30T12:30'), null);
    assert.equal(parsePromotionLocalDate('not-a-date'), null);
    assert.equal(parsePromotionLocalDate('2026-09-06T00:30'), null, 'A nonexistent Chilean DST time is not normalized silently');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('end is optional and strictly later; changing start does not change end', () => {
  const startsAt = localDateTime(now + 60_000), endsAt = localDateTime(now + 120_000);
  assert.deepEqual(promotionDates({ startsAt, endsAt: '' }, null, now).errors, {});
  assert.deepEqual(promotionDates({ startsAt, endsAt }, null, now).errors, {});
  assert.ok(promotionDates({ startsAt, endsAt: startsAt }, null, now).errors.endsAt);
  const form = { startsAt: endsAt, endsAt: startsAt }, copy = { ...form };
  assert.ok(promotionDates(form, null, now).errors.endsAt); assert.deepEqual(form, copy);
});
test('historical instants retain seconds and milliseconds and reject another past start', () => {
  const original = { startsAt: '2026-10-01T12:00:20.123Z', endsAt: '2026-10-01T12:00:40.456Z' };
  const form = { startsAt: localDateTime(original.startsAt), endsAt: localDateTime(original.endsAt) };
  const result = promotionDates(form, original, now);
  assert.deepEqual(result.errors, {});
  assert.equal(result.startsAt.toISOString(), original.startsAt); assert.equal(result.endsAt.toISOString(), original.endsAt);
  assert.ok(promotionDates({ ...form, startsAt: localDateTime('2026-09-01T12:00:00Z') }, original, now).errors.startsAt);
});
