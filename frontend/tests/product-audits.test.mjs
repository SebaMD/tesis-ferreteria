import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('audit history has ADMIN-only direct route and shared navigation, separate from stock history',async()=>{
 const read=p=>readFile(new URL('src/'+p,root),'utf8');
 const [page,app,roles,nav]=await Promise.all(['pages/ProductsPage.jsx','App.jsx','helpers/roles.js','components/InventoryNavigation.jsx'].map(read));
 assert.match(page,/<InventoryNavigation active=\{activeView\}/);assert.doesNotMatch(page,/auditHistoryOpen|<ProductAuditHistory/);
 assert.match(app,/path="\/products\/administrative-changes"[\s\S]*?allowedRoles=\{ROUTE_PERMISSIONS.productAudits\}/);
 assert.match(roles,/productAudits: \["ADMIN"\]/);assert.match(nav,/user\?\.role === "ADMIN"/);assert.match(nav,/Cambios administrativos/);
});
test('audit UI has server filters/pages, persistent errors, empty/loading states and accessible read-only details',async()=>{
 const ui=await readFile(new URL('src/components/ProductAuditHistory.jsx',root),'utf8');
 for(const text of ['useLocation','useNavigate','auditQueryFromSearch','page: String(nextPage)','AbortController','controller.abort()','response?.totalItems','>Desde<input','>Hasta<input','días completos en UTC','role="alert"','role="status"','No hay cambios registrados','<details','<summary','No registrado','event.reason','<Pagination','Nuevo'])assert.ok(ui.includes(text),text);
 assert.doesNotMatch(ui,/AppModal|JSON.stringify|Ver detalles técnicos|Alcance de la información registrada/);
 assert.ok(!ui.includes('dangerouslySetInnerHTML'));assert.ok(!ui.includes('api.post'));assert.ok(!ui.includes('api.delete'));
 const service=await readFile(new URL('src/services/productAudits.service.js',root),'utf8');assert.match(service,/api.get\("\/product-audits", \{ params, signal \}\)/);
});
