import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL('../src/' + file, import.meta.url), 'utf8');

test('all 14 reviewed native tables opt into centering without changing mobile card components', async () => {
  const files = ['pages/GuestOrderTrackingPage.jsx', 'pages/OnlineOrdersManagementPage.jsx', 'pages/PaymentResultPage.jsx', 'pages/ProductsPage.jsx', 'pages/ReportsPage.jsx', 'pages/SalesPage.jsx', 'pages/UsersPage.jsx', 'components/GroupedInventoryTable.jsx', 'components/ProductAuditHistory.jsx', 'components/orders/AdministrativeOrderCard.jsx'];
  let count = 0;
  for (const file of files) for (const table of (await read(file)).matchAll(/<table\b[^>]*>/g)) {
    count++; assert.match(table[0], /fyf-data-table/, file);
  }
  assert.equal(count, 14);
  const css = await read('styles/styles.css');
  assert.match(css, /\.fyf-data-table > :is\(thead, tbody, tfoot\) > tr > :is\(th, td\) \{ text-align: center/);
  assert.match(css, /\.fyf-data-table \.table-row-actions > :is\(button, a\) \{ margin-inline: 0/);
  assert.match(css, /\.fyf-data-table > tbody > tr > td\.table-description-cell \{ text-align: left/);
  assert.match(css, /\.fyf-data-table td\.table-description-cell > \.grid \{ justify-items: stretch/);
  assert.match(css, /\.fyf-data-table \.table-description-cell \.inventory-variant-select \.app-select-trigger \{ text-align: left/);
  assert.match(css, /\.audit-events-table \.audit-event-summary > td, \.audit-events-table \.audit-event-detail > td \{ text-align: left/);
  const print = await read('helpers/administrativeOrder.js');
  assert.match(print, /th,td\{[^}]*text-align:center/);
  assert.doesNotMatch(print, /text-align:right|text-align:left/);
});

test('audit panel keeps rows mounted, fixes page size and does not focus/scroll results on page changes', async () => {
  const audit = await read('components/ProductAuditHistory.jsx');
  assert.match(await read('helpers/auditNavigation.js'), /limit: "10", page: params.get\("page"\) \?\? "1"/);
  assert.match(audit, /className=\{`\$\{tablePanelClass\} audit-events-panel`\}/);
  assert.match(audit, /Mostrando \$\{response\?\.items.length \|\| 0\} de \$\{response\?\.totalItems \|\| 0\} cambios administrativos/);
  assert.doesNotMatch(audit, /pageHeight|setPageHeight|style=\{\{ minHeight|useRef|results.current/);
  assert.match(audit, /"Motivo", "Acciones"/);
  assert.match(audit, /className=\{`\$\{tableActionButtonClass\} audit-detail-action`\}/);
  assert.match(audit, /<Eye size=\{15\} aria-hidden="true"/);
  assert.match(audit, /<RotateCcw size=\{17\} aria-hidden="true" \/>Limpiar filtros/);
  assert.match(await read('pages/OnlineOrdersManagementPage.jsx'), /<th>Acciones<\/th>/);
  assert.match(audit, /<Pagination[^>]*pageSize=\{10\}[^>]*alwaysVisible/);
  assert.doesNotMatch(audit, /Eventos por página|Las páginas siguientes se habilitan|heading.current|focusResults|scrollTo\(|!busy && !error && <section/);
  assert.ok(audit.indexOf('<section className={`${tablePanelClass} audit-events-panel`}') < audit.indexOf('<div className="audit-history-pagination"'));
});

test('only opted-in descriptive cells and expanded audit details use left alignment', async () => {
  const files = ['components/GroupedInventoryTable.jsx', 'pages/ProductsPage.jsx', 'components/ProductAuditHistory.jsx', 'pages/SalesPage.jsx', 'pages/OnlineOrdersManagementPage.jsx', 'components/orders/AdministrativeOrderCard.jsx', 'pages/PaymentResultPage.jsx', 'pages/GuestOrderTrackingPage.jsx'];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /<td[^>]*className="table-description-cell/, file);
    assert.doesNotMatch(source, /<th[^>]*table-description-cell/, file);
  }
  const audit = await read('components/ProductAuditHistory.jsx');
  assert.match(audit, /data-label="Operación" className="table-description-cell"/);
  assert.match(audit, /data-label="Motivo" className="table-description-cell"/);
  assert.match(audit, /className="audit-event-detail"><td colSpan=\{6\} className="table-description-cell"/);
  assert.doesNotMatch(audit, /registros de esta página|Más recientes primero/);
});

test('sale secondary return actions have a common desktop width, while warehouse schedule remains unavailable', async () => {
  const sales = await read('pages/SalesPage.jsx');
  assert.match(sales, /sale-return-action[^`]*`\}[\s\S]*?openReviewModal\(sale\)/);
  assert.match(sales, /sale-return-action[^`]*`\}[\s\S]*?openDirectReturnModal\(sale\)/);
  const users = await read('pages/UsersPage.jsx');
  assert.match(users, /user.roleName === "CASHIER" && \([\s\S]*?openScheduleForm\(user\)/);
  assert.doesNotMatch(users, /\["CASHIER", "WAREHOUSE"\]\.includes\(user.roleName\)/);
});
