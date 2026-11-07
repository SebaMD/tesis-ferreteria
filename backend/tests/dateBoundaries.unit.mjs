import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:1/not_connected';
const { validateAuditQuery } = await import('../dist/modules/productAudits/productAudits.service.js');
const { validateDailyReportQuery, validateSalesReportQuery } = await import('../dist/modules/reports/reports.validation.js');
const now = new Date('2026-11-06T01:30:00Z');
test('backend audit rejects future, today From, equal and reversed UTC days', () => {
  assert.equal(validateAuditQuery({from:'2026-11-05',to:'2026-11-06'},now).to,'2026-11-06');
  for (const q of [{from:'2026-11-06'},{to:'2026-11-07'},{from:'2026-11-05',to:'2026-11-05'},{from:'2026-11-05',to:'2026-11-04'},{from:'2026-02-30'}]) assert.throws(()=>validateAuditQuery(q,now));
});
test('sales day and explicit range modes use Chile today independent of process timezone', () => {
  assert.equal(validateDailyReportQuery({date:'2026-11-05'},now).success,true);
  assert.equal(validateDailyReportQuery({date:'2026-11-06'},now).success,false);
  const check = (from,to,mode) => validateSalesReportQuery({from,to,...(mode?{mode}:{})},now).success;
  assert.equal(check('2026-11-04','2026-11-05','range'),true);
  assert.equal(check('2026-11-05','2026-11-05','single'),true);
  assert.equal(check('2026-11-05','2026-11-05'),true); // Existing one-day API consumer.
  for(const v of [['2026-11-05','2026-11-05','range'],['2026-11-05','2026-11-06','range'],['2026-11-04','2026-11-05','single'],['2026-11-05','2026-11-04','range'],['2026-11-06','2026-11-06','single'],['2026-11-04','2026-11-05','invalid']]) assert.equal(check(...v),false);
});
test('Chile date rolls at local midnight, including year changes', () => {
  const q={date:'2027-01-01'};
  assert.equal(validateDailyReportQuery(q,new Date('2027-01-01T02:59:59Z')).success,false);
  assert.equal(validateDailyReportQuery(q,new Date('2027-01-01T03:00:00Z')).success,true);
});
