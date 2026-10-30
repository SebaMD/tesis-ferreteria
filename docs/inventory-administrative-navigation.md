# Inventario: acciones, desactivación familiar y cambios administrativos

## Comportamiento

- Los valores descriptivos siguen siendo texto seleccionable. Solo el lápiz abre la operación existente; muestra «Editar», foco visible y el acento al pasar sobre el botón. Los botones dedicados «Editar» de la tabla son completamente clicables.
- «Desactivar familia» usa el ID familiar, no el SKU seleccionado. La confirmación consulta todos los miembros, muestra activos e inactivos y exige motivo (8–500 caracteres) y confirmación explícita.
- Se modifican únicamente los SKU activos. Los previamente inactivos no se actualizan. No se archiva la familia ni se altera stock, imágenes, identidad o capturas históricas.
- La disponibilidad familiar se muestra mediante cantidades activas/inactivas, calculadas con el listado completo, no con el subconjunto filtrado.
- No hay activación familiar automática. La reactivación continúa por SKU dentro del editor; así no se habilitan artículos previamente inactivos. Esta limitación fue autorizada expresamente.

## Contrato administrativo nuevo (sin migración)

- `POST /api/product-families/:id/deactivations`
- `GET /api/product-families/:id/deactivations/:operationKey` (recuperación, sin caché)
- Cuerpo estricto: `operationKey`, `expectedRevision`, `reason`, `confirmed: true`. ADMIN activo en ruta y servicio.
- Orden de bloqueos: promociones, advisory familiar compartido, familia y todos sus productos ordenados por ID. Se reutiliza la revisión completa del bundle.
- Antes de modificar cada SKU se comprueban compromisos pendientes mediante la protección existente, que contempla solicitudes de despacho además del historial ordinario. Después se reutiliza `editProductInTransaction` para cada desactivación dentro de la misma transacción.
- Un solo evento `FAMILY_DEACTIVATE` conserva administrador, fecha, motivo, revisión anterior/posterior, disponibilidad anterior/posterior y SKU afectados/previamente inactivos. No se introduce una asociación familiar nueva.
- La clave y hash del comando se consultan antes de validar una revisión ya consumida. Reintentos idénticos recuperan el resultado; reutilizar la clave con otro contenido se rechaza. La auditoría y todos los cambios revierten juntos ante un fallo.
- El diálogo congela el comando en sesión ante un resultado incierto; permite consultar o reintentar el mismo comando sin reemplazar silenciosamente la revisión.

## Página administrativa

`/products/administrative-changes` tiene protección ADMIN, también por URL directa. Comparte navegación con Inventario e Historial de inventario.

Reutiliza el GET de auditorías, su proyección segura y sus helpers semánticos. Conserva filtros, límites, cursores y navegación anterior en la URL/estado de navegación. En escritorio presenta cinco columnas y en móvil tarjetas. Los detalles se expanden en la misma página, sin modal ni diagnóstico JSON. Los valores ausentes no se reconstruyen. La nueva desactivación se presenta como disponibilidad, no eliminación física.

## Archivos de esta entrega

Backend:

- `src/modules/productFamilies/familyDeactivation.service.ts`
- `src/modules/productFamilies/productFamilies.routes.ts`
- `src/modules/productAudits/productAudits.dto.ts`
- `tests/familyDeactivation.unit.mjs`
- `tests/familyDeactivation.integration.mjs`
- `tests/productBundles.integration.mjs`

Frontend:

- `src/components/AuditedValueControl.jsx`, `ProductFormFields.jsx`, `ProductBundleEditor.jsx`
- `src/components/GroupedInventoryTable.jsx`, `FamilyDeactivationDialog.jsx`, `InventoryNavigation.jsx`
- `src/components/ProductAuditHistory.jsx`, `src/pages/ProductAuditHistoryPage.jsx`, `src/pages/ProductsPage.jsx`
- `src/App.jsx`, `src/helpers/roles.js`, `src/helpers/auditNavigation.js`, `src/helpers/auditPresentation.js`
- `tests/audit-navigation.test.mjs`, `family-deactivation.test.mjs`, `inventory-pencil-polish.test.mjs`, `product-audits.test.mjs`

## Verificación (29 de octubre de 2026)

- Frontend: `node --test tests/*.test.mjs`: 252/252.
- Backend: `node --test tests/*.unit.mjs`: 60/60.
- ESLint frontend, TypeScript backend sin emitir, compilaciones frontend/backend y `git diff --check`.
- Suite completa `node scripts/test-product-bundles.mjs` en PostgreSQL **16.15** nativo, clúster efímero en puerto 55447. Aprobó regresiones de productos y las pruebas nuevas: estados mixtos, campos y snapshots intactos, autorización, concurrencia, revisión obsoleta, recuperación/idempotencia, auditoría única, rollback deliberado, solicitud pendiente/aprobada, pedido operativo y carrera con creación de solicitud.
- Un primer intento de la prueba nueva encontró la política de despacho suspendida por un fixture anterior. Se corrigió exclusivamente su preparación: política explícita y cliente propio de prueba. No se debilitó ninguna protección.
- Navegador real contra ese backend/clúster: desactivación familiar, recarga, disponibilidad 0 activas/3 inactivas, auditoría persistida, paginación/cursor y Atrás, rechazo de URL directa a MANAGER, edición desde botón completo, copia de texto sin abrir diálogo, Enter en lápiz, Escape y retorno del foco.
- Revisión a 320, 360, 375, 400 y 1280 px, temas claro/oscuro, sin desbordamiento de página; se corrigió el recorte de la nueva navegación móvil. Eventos muy extensos e incompletos se revisaron además con API simulada (no se consideran evidencia de persistencia).
- Servidores, pestañas y clúster temporales detenidos al finalizar. Ninguna escritura en las bases habituales; sin cambios de correos, pagos, conciliación, despacho o migraciones.

Git: rama `feature/tarifas-despacho`, HEAD `656e93548d0d7016b2a54f3c6ca48f7fcb709b70`. Los 11 staged mantienen la huella `446033b45ab238f5bbef08d626792d7b296ea924`. Sin add, reset, restore, commit, push ni cambios de main/seba. Todos los cambios acumulados previos se conservan.
