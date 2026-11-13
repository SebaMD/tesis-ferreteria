# Unidad general y aplicación explícita al borrador

## Modelo y diagnóstico

`products.unit_measure` conserva la unidad individual de cada SKU (texto de 1 a 50 caracteres). `product_families` no almacena una unidad familiar. Al abrir una familia, el editor toma la unidad de la primera variante como valor general inicial; no representa necesariamente la unidad de todos los miembros.

Anteriormente las filas nuevas podían omitir `unitMeasure` y utilizar dinámicamente el valor general al mostrar o guardar. Ahora cada fila nueva captura explícitamente su unidad al crearse. La unidad general sigue siendo un valor inicial, no una unidad persistida de familia. Se conserva el comportamiento existente de sincronización del primer artículo al alternar con el formulario simple.

## Aplicación explícita

El selector abre la vista previa al elegir una unidad distinta (opción, Enter o salida tras editar una unidad personalizada), no por cada tecla ni al cargar datos. Ya no hay un botón adicional. El valor propuesto permanece fuera del borrador hasta confirmar: cancelar, cerrar o Escape restaura el selector y conserva las unidades individuales, incluidos cambios pendientes. La confirmación actualiza conjuntamente el valor inicial y las filas elegibles del borrador; no guarda en PostgreSQL. Volver a elegir la misma unidad no abre otra vista previa. Si todas las filas ya usan el destino, puede confirmarse únicamente el nuevo valor inicial sin reescribirlas.

`unitSelectionPlan` y `applyUnitSelection` reutilizan el plan existente y comprueban además la huella del borrador anterior. No sustituyen la revisión ni la política transaccional backend. Las unidades individuales siguen siendo editables en variantes nuevas o existentes sin historial, sujetas al control de compromisos al guardar; las históricas y el original de conversión siguen bloqueados. Se añadió una explicación y espacio reservado para el lápiz, sin crear una operación histórica nueva.

`ProductUnitApplicationDialog` presenta todos los miembros, sus IDs reales cuando existen, estado activo/inactivo, unidades anterior/nueva y cantidades iniciales del borrador. Las filas que ya usan exactamente la unidad destino no se reescriben. No se deducen equivalencias de significado entre textos.

La confirmación cambia únicamente `unitMeasure` en filas nuevas o SKU existentes elegibles del borrador. No escribe ni convierte cantidades; la persistencia posterior continúa utilizando el guardado transaccional habitual. Cancelar conserva el borrador y descarta consultas tardías. Una vista previa obsoleta se rechaza. Se conservan archivos, imágenes y demás campos.

Si cualquier fila que necesita cambiar está bloqueada, no se aplica nada. Un miembro histórico que ya usa la unidad destino no bloquea por sí mismo el cambio de filas nuevas.

### Elegibilidad orientativa para SKU existentes

La consulta original del editor solo entregaba `hasHistory`. Se añadió `GET /api/product-families/:id/unit-eligibility?unitMeasure=...&expectedRevision=...`, exclusivo ADMIN tanto en ruta como en servicio. Valida unidad normalizada de 1–50 caracteres, revisión SHA-256 e ID positivo, sin parámetros de escritura. Devuelve familia, revisión, destino y miembros activos/inactivos con ID, unidad vigente, estado `same`, `eligible` o `blocked` y motivo sin datos de clientes.

La consulta usa una transacción PostgreSQL de solo lectura y `repeatable read`, sin bloquear escritores ni insertar auditorías. Los savepoints permiten informar rechazos SQL por miembro sin dejar abortada la consulta. Reutiliza `assertUnitChangeAllowed`, que combina `assertNoPendingIdentityCommitments` y `productHasHistory`; no infiere elegibilidad únicamente desde historial ni desde el fingerprint económico.

Un SKU sin cambio es `same` incluso con historial. Para cambiar, no puede tener ventas, líneas de pedido ni movimientos (incluidas entradas), solicitudes abiertas, pedidos operativos/reintentables y reservas asociadas, reparto POS o devolución pendiente, ni capturas históricas faltantes, según las protecciones existentes. El original de una conversión sigue conservando su unidad. No se añade una unidad persistida a la familia.

### Guardado, concurrencia y auditoría

La vista previa no autoriza el guardado. `editProductInTransaction` invoca la misma política después de tomar los locks existentes: promoción, advisory familiar y fila de producto. El guardado conjunto conserva su revisión y transacción, por lo que una sola variante bloqueada revierte todo, incluidas imágenes y auditoría. Los creadores de compromisos toman el lock del SKU antes de capturar identidad. Una solicitud de despacho puede no cambiar la revisión familiar: aun así el guard de compromisos la detecta al guardar. El error de unidad incluye `details.productId` y `details.field`, para desplegar la variante afectada sin interpretar palabras del mensaje.

Se conserva la idempotencia y recuperación de `BUNDLE_SAVE`. Ese evento ya registra usuario, fecha, motivo de guardado conjunto y todos los productos antes/después, incluidas sus unidades. No se crea una operación histórica independiente ni se inventa un motivo administrativo adicional. Las ediciones individuales existentes conservan la misma regla, sin crear un camino masivo menos seguro. No se necesita migración ni excepción SQL.

## Corrección histórica de unidades: propuesta, no implementada

Los snapshots conservan los textos comerciales capturados y distinguen el legado de referencia posterior, pero no demuestran equivalencia física. `Caja → Unidad` puede reinterpretar cada existencia, entrada, venta, reserva y devolución. No es una simple corrección descriptiva; requiere un análisis de embalajes/conversión o un SKU distinto, no este flujo.

Una futura corrección estrictamente equivalente (por ejemplo una abreviatura verificada) requeriría:

1. Un catálogo o política explícita de equivalencias de la misma unidad física, sin inferirlas automáticamente por parecido textual.
2. Operación ADMIN independiente con motivo, confirmación anterior/posterior, revisión, idempotencia, recuperación y auditoría inmutable; exclusión de borradores comerciales ajenos.
3. Comprobación de todos los compromisos pendientes, bloqueo transaccional con orden compatible y revalidación al confirmar. Mantener el rechazo cuando una solicitud o devolución pueda reinterpretarse.
4. Si resulta imprescindible, una nueva migración revisada previamente que autorice solo una excepción SQL específica y auditada. No retirar el trigger histórico ni reutilizar excepciones de marca/nombre.
5. Pruebas con stock, entradas, ventas, pedidos, reservas, devoluciones, reportes y comprobantes: cantidades e importes intactos, snapshots originales y de legado intactos, nueva captura correcta, rollback, concurrencia e inmutabilidad.

Hasta aprobar ese diseño, las unidades históricas permanecen bloqueadas. No se modifica el esquema, los eventos anteriores ni los snapshots.

## Verificación incremental

- Runner específico: `UNIT_APPLICATION_ONLY=1 node scripts/test-product-bundles.mjs`, con `PG_TEST_BIN` apuntando explícitamente al motor temporal. Prueba elegibilidad read-only, permisos ruta/servicio, miembros inactivos, cambios/igualdad, ENTRY, venta, snapshots, compromiso creado después de consultar, pedido/reserva, rollback tras una escritura elegible, fallo deliberado de auditoría, replay/recuperación y carrera real de guardado masivo contra solicitud. Aprobó en PostgreSQL 16.15, esquema 0036, puerto 55447.
- El HTTP 409 de conversión no era contaminación entre tests: el mismo fixture creaba un pedido reintentable. Ahora verifica primero ese rechazo y después paga mediante el mock Webpay y completa el retiro mediante APIs logísticas antes de probar rollback/conversión. Este caso aprobó, sin debilitar producción ni reescribir estados manualmente.
- Estabilización posterior del fixture de historial: el mismo escenario creaba un pedido `PENDING_PAYMENT` y pretendía cambiar un código de barras antes de finalizarlo. Ahora verifica HTTP 409 sin cambios parciales, procesa el callback Webpay simulado, comprueba el bloqueo mientras está pagado pero no entregado y completa el retiro mediante APIs normales. Solo entonces edita código/descripción/precio, comprobando que todas las capturas anteriores siguen idénticas. No se reescriben estados SQL ni se alteran reglas de producción.
- Tras esa corrección, la suite amplia `node scripts/test-product-bundles.mjs` aprobó completa en PostgreSQL 16.15 temporal: 26 bloques `PASS`, salida 0 y ningún fallo. La regresión `UNIT_APPLICATION_ONLY=1` aprobó nuevamente en otro clúster temporal. Se conservaron elegibilidad, bloqueos, atomicidad, auditoría, recuperación, concurrencia y rollback. Los clústeres fueron detenidos y eliminados por el runner, sin acceso a bases habituales.
- La persistencia se comprueba con la integración real aislada; las simulaciones de interfaz no sustituyen esa prueba.
- Frontend: 232/232 pruebas; backend unitario: 55/55; ESLint frontend, TypeScript y builds correctos (permanece el aviso de bundle frontend grande). Revisión de navegador con API simulada: elegibilidad, SKU inactivo, cancelación/Escape, foco, aplicación solo al borrador, tema claro/oscuro, móvil 320 px y escritorio 1280 px. No se repitió una auditoría visual integral de todas las resoluciones en esta ampliación.

## Archivos de la ampliación de elegibilidad

- Backend: `src/modules/productFamilies/productUnitEligibility.service.ts` (nuevo), `productBundle.service.ts`, `productFamilies.routes.ts`, `src/modules/products/products.service.ts`.
- Frontend: `src/components/ProductBundleEditor.jsx`, `ProductUnitApplicationDialog.jsx`, `src/helpers/productUnits.js`, `src/services/productFamilies.service.js`.
- Pruebas: `backend/tests/unitApplication.unit.mjs`, `unitApplication.integration.mjs` (nuevos), `productConversion.integration.mjs`, `productBundles.integration.mjs`, `backend/scripts/test-product-bundles.mjs`; `frontend/tests/product-units.test.mjs`, `conversion-flow-ux.test.mjs`, `variant-presentation-a.test.mjs`.
- Esta documentación. El fixture visual de API simulada está fuera del repositorio, en el directorio de visualizaciones de Codex. No se modificaron migraciones ni configuraciones habituales.
