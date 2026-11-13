# Unidades descriptivas por atributo

## Diagnóstico y diseño

Hasta 0040, `family_attributes` definía ID, familia, nombre y posición. Cada opción guardaba una etiqueta libre en `family_attribute_options.label`. Las asignaciones y `variant_key` dependen de IDs; no de las etiquetas. `products.unit_measure` es otra propiedad: determina cómo se interpretan las cantidades comerciales.

0041 añade `measurement_kind` y `unit_code`, ambos opcionales, al atributo de una familia. NULL/NULL significa texto tradicional. Una definición cuantitativa conserva el valor decimal canónico en `label` y compone su presentación con la unidad del atributo. No se agrega unidad a productos ni se convierten cantidades.

Magnitudes disponibles:

- Longitud: mm, cm, m.
- Masa/peso comercial: g, kg.
- Capacidad/volumen: mL, L.

El nombre del atributo es libre; no impone una unidad universal. Dos familias pueden usar Longitud en unidades diferentes. La pareja magnitud/unidad se valida en frontend, backend y PostgreSQL.

Los valores son cadenas decimales positivas (hasta 12 cifras enteras y 6 decimales), no cálculos de punto flotante. Se admiten coma o punto decimal, **no separadores de miles**. `00100,000` se normaliza a `100`; `1` y `1.00` son la misma opción numérica. Sufijos, signos, notación científica, cero y precisión excesiva se rechazan. La vista previa muestra el resultado explícitamente.

## Interfaz y operaciones reutilizadas

Al crear una familia o convertir un producto simple, cada atributo nuevo permite seleccionar Texto o Cuantitativo, magnitud y unidad. Sus valores se introducen en cada variante, sin sufijo. Las etiquetas y nombres sugeridos muestran «100 mm». La unidad individual del SKU conserva su valor independiente.

La incorporación de dimensiones a una familia existente sigue usando el endpoint auditado y transaccional de 0036, con asignación explícita para activos e inactivos, motivo, revisión, confirmación, idempotencia y recuperación. El contrato acepta opcionalmente `measurementKind` y `unitCode`; los comandos tradicionales de texto no cambian su forma normalizada. Continúa admitiendo una dimensión por operación.

La configuración de un atributo sin guardar puede cambiarse antes de ingresar valores. Con opciones pendientes hay que vaciarlas primero: no se reinterpretan valores ya escritos al cambiar mm por cm. Cancelar una dimensión elimina solo ese borrador independiente, sin guardar ni descartar cambios comerciales ajenos.

Una vez persistidos, tipo y unidad quedan inmutables, incluso si el atributo todavía no tiene historial. Los valores cuantitativos existentes tampoco pasan por la corrección de etiquetas compartidas: cambiar 100 por 200 puede representar otra magnitud física. No se muestra un lápiz que prometa esa corrección. Las etiquetas tradicionales continúan utilizando su operación auditada. Las reasignaciones de variantes conservan exactamente las restricciones anteriores de historial y compromisos.

## Historial y presentación

- El catálogo y las proyecciones actuales de SKU componen valor/unidad; la selección de variantes sigue siendo exclusivamente por ID y combinaciones reales.
- Carrito y resumen de checkout muestran las características actuales, separadas de la unidad usada para precio/cantidad. No cambia el cálculo económico.
- Las nuevas capturas contienen la etiqueta compuesta y, para atributos cuantitativos, valor, magnitud y unidad explícitos. Solo se sustituye la función de captura para operaciones **futuras**; no se actualiza ninguna captura existente.
- Las vistas que reutilizan `HistoricalIdentityNote` muestran las características capturadas de ventas, pedidos y movimientos, sin buscar etiquetas vigentes. La procedencia ORIGINAL/LEGACY_REFERENCE/LEGACY_PARTIAL se conserva.
- El modelo de comprobante de pedido conserva la identidad capturada. No se rediseñó la maquetación de los PDF ni se cambiaron importes.
- La autorización de dimensión registra magnitud/unidad junto al atributo nuevo. El guardado de bundles registra definiciones de atributos en su evento existente. El DTO administrativo solo proyecta nombres, etiquetas y unidad permitidos, sin exponer payloads internos.

## Protección SQL y migración

`0041_attribute_measurements.sql`, generada después de 0040 con snapshot y journal Drizzle encadenados, añade dos columnas, una CHECK de compatibilidad y dos triggers nuevos:

- `attribute_measurement_guard`: rechaza cambios de tipo/unidad persistidos, incluida la adopción de unidad por un atributo tradicional.
- `quantitative_option_guard`: exige decimal positivo canónico al insertar y prohíbe modificar valor o identidad de opciones cuantitativas existentes.

No se desactiva ni elimina ningún trigger anterior, índice único, FK, regla de combinación o protección de snapshots. No hay backfill, eliminación ni actualización comercial en la migración. La excepción auditada existente para incorporar dimensiones mantiene su comprobación de estado exacto y rechazo al COMMIT; la nueva autorización incluye los metadatos cuantitativos.

**No se aplicó 0041 a la base habitual.** Antes de usar este código con familias en esa base se necesita respaldo verificable, detener escritores y aplicar la migración con autorización expresa. El ALTER adquiere el bloqueo habitual sobre `family_attributes`; la CHECK valida sus filas, que por defecto son texto. No recorre ni reescribe ventas o movimientos para capturarlos nuevamente.

## Compatibilidad y decisiones pendientes

Los atributos antiguos siguen como texto, incluidos «100 mm», «200 mm», etiquetas mezcladas o no numéricas. Un detector de solo lectura marca posibles candidatos con valores positivos, sufijo conocido uniforme y sin colisiones numéricas normalizadas. No quita sufijos ni interpreta una captura histórica como original verificada.

La conversión de atributos existentes queda **pendiente de otra autorización**. Necesitaría un contrato independiente, vista previa completa, equivalencia física inequívoca de todas las opciones, conservación de IDs/asignaciones/claves, bloqueos de compromisos, auditoría y una excepción SQL específica. Cambiar una unidad persistida (100 mm → 10 cm) también requiere otro diseño; no está habilitado como renombrado ni conversión automática.

## Verificación

- Frontend: 261 pruebas aprobadas; backend: 64 unitarias aprobadas.
- ESLint frontend, TypeScript backend, compilaciones y diff checks.
- Suite completa de productos/variantes sobre **PostgreSQL 16.15 real**, clúster efímero 127.0.0.1:55447: siete unidades, texto, opciones compartidas, activos/inactivos, conservación de IDs/claves/stock/unidades, nuevas variantes posteriores, guardados ordinarios, protección SQL, dimensión histórica, auditoría única, revisión obsoleta, idempotencia/recuperación, concurrencia y rollback deliberado. Ventas, pedidos y modelo de comprobante usan la captura compuesta.
- Ensayo poblado 0040→0041 y replay: las definiciones anteriores solo recibieron los dos NULL esperados; etiquetas, IDs, combinaciones, stock y capturas anteriores permanecieron idénticos. También aprobó el recorrido incremental desde 0032.
- Regresión de despacho local en otro PostgreSQL 16.15 efímero (55446), con Webpay simulado: umbrales/descuentos, validación de comuna/importes, reservas concurrentes, reintentos y solicitudes antiguas aprobados. Solo se ajustaron las expectativas del journal en sus fixtures; no la lógica de despacho.
- Navegador con API **real** sobre el clúster aislado: creación y guardado de una familia cuantitativa, incorporación auditada a una familia histórica con variante inactiva, recarga, vista previa, catálogo, selección por ID y carrito. Escape conserva valores y devuelve foco; cancelar otra dimensión no realiza escrituras.
- Revisión clara/oscura y anchos 320, 360, 375, 400 y 1280 sin desbordamiento de página. Los recursos temporales se cerraron al terminar. No se modificaron .env, correos, Webpay ni conciliación habituales.
- Durante el desarrollo se corrigió únicamente un supuesto de orden en el fixture nuevo (las variantes se identifican por ID, no por índice), una expectativa estática de protección ampliada y un error de sintaxis de prueba. La ejecución final no conserva fallos.

## Archivos de esta tarea

Backend: `src/db/schema/productFamilies.ts`; `src/modules/productFamilies/attributeMeasurements.ts`, `productFamilies.service.ts`, `productBundle.service.ts`, `familyDimension.service.ts`, `familyOptionLabel.service.ts`; `src/modules/catalog/catalog.repository.ts`; `src/modules/productAudits/productAudits.dto.ts`; `drizzle/0041_attribute_measurements.sql`, `drizzle/meta/0041_snapshot.json`, `drizzle/meta/_journal.json`; `tests/attributeMeasurements.unit.mjs`, `attributeMeasurements.integration.mjs`, `commercialHistory.integration.mjs`, `productBundles.integration.mjs`, `unitApplication.integration.mjs`, `localDelivery.integration.mjs`, `deliveryQuotes.integration.mjs`, `deliveryTariffs.integration.mjs`.

Frontend: `src/components/AttributeMeasurementFields.jsx`, `ProductBundleEditor.jsx`, `FamilyDimensionDialog.jsx`, `HistoricalIdentityNote.jsx`; `src/helpers/attributeMeasurements.js`, `productFamilyForm.js`, `productBundleForm.js`, `familyDimension.js`, `attributeSuggestions.js`, `auditPresentation.js`, `historicalIdentity.js`; `src/pages/ClientCartPage.jsx`, `CheckoutPage.jsx`; `tests/attribute-measurements.test.mjs`, `conversion-flow-ux.test.mjs`.

Todos los cambios previos se conservan. Sin commits, push, cambios de rama ni modificaciones del índice. Los 11 staged mantienen `446033b45ab238f5bbef08d626792d7b296ea924`; HEAD `656e93548d0d7016b2a54f3c6ca48f7fcb709b70`, rama `feature/tarifas-despacho`.

## Cierre de la continuación — 30 de octubre de 2026

Se inspeccionó el estado existente sin regenerar la implementación ni la migración. Se corrigió un fallback del borrador: agregar otro atributo conserva el valor numérico de entrada, no la etiqueta con sufijo. Se añadió una regresión y se completó la presentación con unidad en la vista inline secundaria.

El fixture específico de unidades de SKU mantenía una instalación 0036. Ahora conserva ese punto de partida y aplica secuencialmente las migraciones vigentes antes de iniciar el backend; no se cambió ninguna expectativa de negocio ni se retiraron bloqueos.

Resultados repetidos en esta continuación:

- `node --test tests/*.test.mjs` (frontend): **261/261**, cero fallos.
- `node --test tests/*.unit.mjs` (backend): **64/64**, cero fallos.
- ESLint frontend, `tsc --noEmit`, compilaciones frontend/backend, `drizzle-kit check` y `git diff --check`: aprobados. Vite conserva la advertencia no bloqueante de bundle mayor de 500 kB.
- `PG_TEST_BIN=<binarios 16.15> node scripts/test-product-bundles.mjs`: suite completa aprobada, incluido 0040→0041 sobre copia poblada, replay, legado, siete unidades, IDs/claves/opciones/stock/unidades comerciales/capturas, auditoría, concurrencia, recuperación y rollback. Journal aislado: 42 entradas, hasta 0041.
- El mismo runner con `UNIT_APPLICATION_ONLY=1`: aprobó elegibilidad, ADMIN, variantes inactivas, ENTRY/ventas/pedidos/solicitudes pendientes, guardado atómico, auditoría, recuperación y carrera real con solicitud de despacho.
- `DELIVERY_TEST_SCOPE=local node scripts/test-delivery-tariffs.mjs`, con los mismos binarios 16.15: aprobó despacho local, gratuidad estricta/descuentos, manipulación de comuna/importes, solicitudes antiguas, Webpay simulado, reintentos, idempotencia y reservas concurrentes.
- Todos los clústeres y servidores efímeros se detuvieron y sus fixtures fueron limpiados por los runners. No se inició un backend habitual ni se conectó a 5432/5433 o producción. No se aplicó 0041 fuera de esas copias.
- No se repitió la revisión de navegador: se conserva la evidencia real de la sesión anterior y sus límites, descritos arriba.

SQL 0041 ensayado, SHA-256: `A2820AA87C86AC1DC03945B19061BA763B7AAB1535D744A74443B5213C81C1AD`. Las decisiones pendientes siguen siendo la adopción controlada por atributos legados y cualquier conversión de unidades persistidas; no se habilitaron en esta continuación.
