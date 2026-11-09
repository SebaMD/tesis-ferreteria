import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, shiftCalendarDay, reportDateError, validCalendarDay } from '../src/helpers/dateFilters.js';
import { auditEmptyFilters, auditFilterValidationMessage } from '../src/helpers/auditNavigation.js';

const now = new Date('2026-11-06T01:30:00Z'); // Nov 5 in Chile, Nov 6 in UTC.
test('calendar bounds distinguish UTC and Chile across midnight, month and year', () => {
  assert.equal(calendarDay(now), '2026-11-06');
  assert.equal(calendarDay(now, 'America/Santiago'), '2026-11-05');
  assert.equal(calendarDay(new Date('2027-01-01T01:00:00Z'), 'America/Santiago'), '2026-12-31');
  assert.equal(shiftCalendarDay('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftCalendarDay('2024-03-01', -1), '2024-02-29');
  for (const day of ['', '0000-01-01', '2026-02-30', '2026-1-01', '2026-13-01']) assert.equal(validCalendarDay(day), false);
});
test('audit accepts single UTC days, today and intervals without changing inclusive To semantics', () => {
  const check = f => auditFilterValidationMessage({ ...auditEmptyFilters, ...f }, {}, now);
  assert.equal(check({from:'2026-11-05',to:'2026-11-06'}), '');
  assert.equal(check({to:'2026-11-06'}), '');
  for(const f of [{from:'2026-11-06'},{from:'2026-11-06',to:'2026-11-06'},{from:'2026-11-05',to:'2026-11-05'},{from:'2001-01-01',to:'2026-11-06'}])assert.equal(check(f),'');
  for (const f of [{from:'2026-11-07'},{to:'2026-11-07'},{from:'2026-11-05',to:'2026-11-04'},{from:'2026-02-30'},{to:'2026-02-30'}]) assert.ok(check(f));
});
test('single-day reports permit today Chile; ranges require distinct days and past From', () => {
  const check = (from, to, mode = 'range') => reportDateError({from,to}, mode, now);
  assert.equal(check('2026-11-05','2026-11-05','single'), '');
  assert.equal(check('2026-11-04','2026-11-05'), '');
  for (const pair of [['2026-11-05','2026-11-05'],['2026-11-05','2026-11-06'],['2026-11-04','2026-11-03'],['2026-02-30','2026-11-05']]) assert.ok(check(...pair));
  assert.ok(check('2026-11-06','2026-11-06','single'));
});
