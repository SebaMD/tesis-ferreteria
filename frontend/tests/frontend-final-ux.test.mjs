import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditQueryFromSearch,auditQueryToSearch} from '../src/helpers/auditNavigation.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('normal client and guest purchases hide legacy request links while compatibility routes remain',async()=>{
 for(const p of ['ClientOrdersPage','GuestDeviceOrdersPage'])assert.doesNotMatch(await read(`pages/${p}.jsx`),/to="\/delivery-quotes|Solicitudes de despacho anteriores|Mis solicitudes de despacho anteriores/);
 assert.match(await read('App.jsx'),/path="\/delivery-quotes\/:id\?"/);
 assert.match(await read('pages/ClientOrdersPage.jsx'),/to="\/catalog"/);
});
test('audit default is ten, explicit historic page sizes and cursor navigation remain valid',()=>{
 assert.equal(auditQueryFromSearch('').limit,'10');
 const query=auditQueryFromSearch('?limit=25&cursor=opaque&familyId=24');
 assert.equal(query.limit,'25');assert.deepEqual(auditQueryFromSearch(auditQueryToSearch(query)),query);
});
test('compact audit actions have independent accessible expansion without hiding original details',async()=>{
 const audit=await read('components/ProductAuditHistory.jsx');
 assert.match(audit,/audit-event-summary/);assert.match(audit,/audit-detail-action/);
 assert.match(audit,/aria-expanded=\{expanded.has\(event.id\)\}/);
 assert.match(audit,/aria-controls=\{`\$\{listId\}-\$\{event.id\}`\}/);
 assert.match(audit,/hidden=\{!expanded.has\(event.id\)\}/);
 for(const required of ['auditReadableRows(event)','event.reason','auditResponsible(event)','affectedProductIds'])assert.ok(audit.includes(required));
 assert.doesNotMatch(audit,/Ver detalles técnicos|Alcance de la información registrada|JSON.stringify/);
});
test('notice editors reuse exactly the same optional-image field and full-width action pattern',async()=>{
 const manager=await read('components/CustomerNoticeManager.jsx'),delivery=await read('components/DeliveryNoticeImage.jsx'),image=await read('components/NoticeImageField.jsx');
 assert.match(manager,/import ImageField from ".\/NoticeImageField.jsx"/);assert.match(delivery,/import NoticeImageField from '.\/NoticeImageField.jsx'/);
 assert.match(manager,/admin-form-actions/);assert.match(delivery,/admin-form-actions/);
 assert.match(image,/data-notice-image-picker/);assert.match(image,/disabled=\{disabled\}/);
 assert.ok(delivery.includes('onRemove={()=>{setFile(null);setRemove(Boolean(announcement.savedImageUrl));}}'));
 assert.doesNotMatch(delivery,/<textarea|type="text"|type="number"/);
});
test('inventory mobile composition and simple correction motive preserve business validators',async()=>{
 const page=await read('pages/ProductsPage.jsx'),css=await read('styles/styles.css'),classification=await read('components/ProductClassificationAction.jsx');
 assert.match(page,/inventory-search-controls/);assert.match(page,/inventory-count-separator/);assert.match(page,/inventory-data-panel/);
 assert.match(css,/\.inventory-section-header \{ text-align: center; \}/);
 assert.match(css,/\.inventory-mobile-actions > div \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.admin-form-actions, \.variant-editor-actions \{ display: grid/);
 assert.match(classification,/min-h-24.*border-slate-300.*required minLength=\{8\} maxLength=\{500\}/);
 assert.match(classification,/expectedRevision:product.updatedAt/);assert.match(classification,/classification-corrections/);
});
