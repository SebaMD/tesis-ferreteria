import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:1/not_connected';
const { validateAuditQuery } = await import('../dist/modules/productAudits/productAudits.service.js');
const { validateDailyReportQuery, validateSalesReportQuery } = await import('../dist/modules/reports/reports.validation.js');
const now = new Date('2026-11-06T01:30:00Z');
test('backend audit accepts a historical day, today UTC and intervals; rejects future, reversed and invalid dates', () => {
  assert.equal(validateAuditQuery({from:'2026-11-05',to:'2026-11-06'},now).to,'2026-11-06');
  for(const day of ['2001-02-03','2026-11-06','2024-02-29']){
    const query=validateAuditQuery({from:day,to:day},now);assert.equal(query.from,day);assert.equal(query.to,day);
  }
  assert.equal(validateAuditQuery({from:'2026-11-06'},now).from,'2026-11-06');
  assert.equal(validateAuditQuery({from:'2000-01-01',to:'2026-11-06'},now).from,'2000-01-01','No statistics-only 366-day limit');
  for (const q of [{from:'2026-11-07'},{to:'2026-11-07'},{from:'2026-11-05',to:'2026-11-04'},{from:'2026-02-30'},{to:'2026-02-30'},{from:'2026-2-01'},{from:'2026-11-06T00:00:00Z'},{from:['2026-11-06']}]) assert.throws(()=>validateAuditQuery(q,now));
});

test('audit calendar labels remain UTC at month/year and Chile daylight-saving boundaries',()=>{
  for(const instant of ['2026-03-01T00:00:00Z','2027-01-01T00:00:00Z','2026-09-06T03:30:00Z','2026-09-06T04:30:00Z']){
    const current=new Date(instant),day=current.toISOString().slice(0,10);
    assert.equal(validateAuditQuery({from:day,to:day},current).from,day);
  }
  for(const [from,to] of [['2026-02-28','2026-03-01'],['2026-12-31','2027-01-01']])assert.equal(validateAuditQuery({from,to},new Date('2027-01-02T00:00:00Z')).to,to);
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
