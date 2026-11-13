import assert from 'node:assert/strict';
import test from 'node:test';
const { validateCashierScheduleBody, validateEditUserBody } = await import('../dist/modules/users/users.validation.js');
const schedule = { workShift: 'MORNING', shiftStartTime: '08:00', shiftEndTime: '13:30' };
test('shared worker schedule accepts existing UI intervals and optional notes', () => {
  for (const data of [schedule, { workShift: 'AFTERNOON', shiftStartTime: '14:00', shiftEndTime: '20:00' }, { workShift: 'OTHER', shiftStartTime: '08:30', shiftEndTime: '19:30', shiftNote: '  Referencia  ' }]) {
    assert.equal(validateCashierScheduleBody(data).success, true);
  }
  assert.equal(validateCashierScheduleBody(schedule).value.shiftNote, null);
  assert.equal(validateCashierScheduleBody({ ...schedule, shiftNote: '  nota ' }).value.shiftNote, 'nota');
});
test('schedule rejects unsupported shifts, ranges, overnight hours and unknown fields', () => {
  for (const patch of [{ workShift: 'NIGHT' }, { shiftStartTime: '08:15' }, { shiftEndTime: '14:00' }, { shiftStartTime: '8:00' }, { shiftStartTime: '22:00', shiftEndTime: '06:00' }, { shiftStartTime: '13:30' }, { shiftNote: 'x'.repeat(256) }, { roleId: 4 }]) {
    assert.equal(validateCashierScheduleBody({ ...schedule, ...patch }).success, false, JSON.stringify(patch));
  }
});
test('administrative edit still excludes verification flags and session versions from public input', () => {
  for (const patch of [{ emailVerifiedAt: new Date().toISOString() }, { authVersion: 1 }, { selfDeactivatedAt: null }]) assert.equal(validateEditUserBody(patch).success, false);
  assert.equal(validateEditUserBody({ status: 'INACTIVE' }).success, true);
});
