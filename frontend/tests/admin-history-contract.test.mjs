import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {ROUTE_PERMISSIONS} from '../src/helpers/roles.js';
import {auditEmptyFilters,auditFilterValidationMessage} from '../src/helpers/auditNavigation.js';
import {calendarDay,shiftCalendarDay} from '../src/helpers/dateFilters.js';
const frontend=path=>readFile(new URL(`../src/${path}`,import.meta.url),'utf8');
const backend=path=>readFile(new URL(`../../backend/src/${path}`,import.meta.url),'utf8');

test('current administrative history remains ADMIN-only in every authorization layer',async()=>{
 for(const role of ['ADMIN','MANAGER','WAREHOUSE'])assert.equal(ROUTE_PERMISSIONS.productAudits.includes(role),role==='ADMIN');
 const [navigation,app,routes,service,dto]=await Promise.all([frontend('components/InventoryNavigation.jsx'),frontend('App.jsx'),backend('modules/productAudits/productAudits.routes.ts'),backend('modules/productAudits/productAudits.service.ts'),backend('modules/productAudits/productAudits.dto.ts')]);
 assert.match(navigation,/user\?\.role === "ADMIN"\) items.push\(\{ key: "changes"/);
 assert.match(app,/allowedRoles=\{ROUTE_PERMISSIONS.productAudits\}/);
 assert.match(routes,/router.use\(authenticateJwt, verifyRoles\(\["ADMIN"\]\)\)/);
 assert.match(service,/u.status='ACTIVE' and r.name='ADMIN'/);
 assert.match(service,/accessMode: "read only"/);
 assert.equal((routes.match(/router\.get\(/g)||[]).length,1);
 assert.doesNotMatch(routes,/router\.(post|put|patch|delete)\(/);
 assert.match(dto,/no se expone su payload interno/);
});

test('same-day history is sent unchanged and uses the existing semi-open UTC SQL interval',async()=>{
 const service=await backend('modules/productAudits/productAudits.service.ts');
 const history=await frontend('components/ProductAuditHistory.jsx');
 assert.match(service,/if \(from && from > today\) throw/);
 assert.match(service,/if \(from && to && from > to\) throw/);
 assert.match(service,/e.created_at >= \$\{q.from\}::date::timestamp at time zone 'UTC'/);
 assert.match(service,/e.created_at < \(\$\{q.to\}::date \+ 1\)::timestamp at time zone 'UTC'/);
 assert.match(history,/if \(auditFilterValidationMessage\(filters, incomplete\)\) return/);
 for(const instant of ['2026-09-06T03:30:00Z','2026-09-06T04:30:00Z','2027-01-01T01:00:00Z']){
  const now=new Date(instant),today=calendarDay(now),prior=shiftCalendarDay(today,-1),older=shiftCalendarDay(today,-2);
  assert.equal(auditFilterValidationMessage({...auditEmptyFilters,from:prior,to:prior},{},now),'');
  assert.equal(auditFilterValidationMessage({...auditEmptyFilters,from:today,to:today},{},now),'');
  assert.equal(auditFilterValidationMessage({...auditEmptyFilters,from:older,to:prior},{},now),'');
 }
});
