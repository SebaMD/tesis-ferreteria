# Conservación incremental de identidad comercial

## Alcance verificado

La migración `0033_commercial_identity_snapshots.sql` añade un registro de identidad
por línea de venta presencial, artículo de pedido online, movimiento de inventario
y artículo de solicitud de despacho. No modifica cantidades, importes, fechas,
reservas ni identificadores de las operaciones existentes.

Se utiliza una tabla auxiliar `commercial_identity_snapshots` con JSONB versionado,
claves foráneas y un único sujeto por captura. Esto evita repetir columnas en cuatro
modelos y permite preservar las líneas de solicitudes, que ya eran inmutables.
No sustituye el modelo de productos ni introduce versiones del inventario.

Cada captura contiene:

- `product_id` y referencia única a su operación.
- Nombre, código de barras, marca y unidad.
- ID y nombre de categoría.
- ID y nombre de familia, atributos y opciones con sus IDs y etiquetas.
- `variant_key`, versión del formato, procedencia y fecha de captura.

Los importes y cantidades siguen leyéndose de las tablas comerciales existentes:
no se recalculan con precios actuales ni se duplican en el JSON de identidad.

## Procedencia, sin reconstrucción ficticia

| Procedencia | Significado |
| --- | --- |
| `ORIGINAL` | Capturada al insertar una operación después de 0033. |
| `LEGACY_REFERENCE` | Representación del catálogo al ejecutar 0033, no prueba del dato original. |
| `LEGACY_PARTIAL` | Nombre y unidad originales ya guardados en una solicitud; los demás campos son referencia posterior. |

La migración no actualiza las ventas, pedidos, movimientos o solicitudes anteriores.
Inserta capturas auxiliares de referencia. No intenta reconstruir cómo se llamaba
un producto en una fecha pasada. Una captura ausente se muestra expresamente como
«Identidad histórica no registrada»; no se reemplaza por el catálogo actual.

Las fotografías no son evidencia histórica archivada. Se conservan sus mecanismos
actuales de catálogo y propiedad; el detalle de pedido aclara esta diferencia.

## Consistencia e inmutabilidad

Los triggers `AFTER INSERT` de las cuatro tablas comerciales crean la captura en
la misma transacción. Si falla, falla también la operación: no puede confirmarse
una venta o movimiento dejando incompleta su captura.

Las restricciones únicas impiden una segunda captura del mismo sujeto. Las claves
foráneas mantienen su vinculación con producto y línea originales. El guard de
captura rechaza inserciones directas, modificaciones, eliminaciones y `TRUNCATE`.
Como cualquier trigger, no pretende proteger frente a un propietario de la base
que deliberadamente altere el esquema o deshabilite sus restricciones.

Las líneas comerciales conservan sus datos originales. `sale_details` permite
seguir actualizando legítimamente `returned_quantity` y `updated_at`; no permite
reescribir cantidad vendida, precio o producto. Los movimientos de devolución y
anulación son nuevas operaciones y capturan la identidad vigente de ese movimiento;
la devolución comercial sigue mostrando la identidad de la línea vendida.

No se modificaron los guards históricos de productos, opciones, combinaciones ni
eventos familiares. Tampoco los permisos, fingerprints, aceptación, callbacks,
idempotencia de pedidos o reservas.

## Lectores adaptados

- Listado, detalle, búsqueda, devoluciones y resumen PDF de ventas.
- Historial, búsqueda, filtro de categoría y exportación de movimientos.
- Pedidos de CLIENT e invitado, seguimiento y datos para comprobantes.
- Fichas administrativas, copia/impresión, preparación y etiquetas logísticas.
- PDF de pedidos y contenido de correo de compra confirmada.
- Solicitudes de despacho: nombre/unidad originales y procedencia de la captura.
- Estadísticas gerenciales: identidad histórica en las fuentes y conteo explícito
  de líneas originales, referenciales o sin captura.

El catálogo, las alertas de reposición y los formularios comerciales siguen usando
el producto actual. No deben sustituirse por una captura de alguna venta anterior.

## Despliegue pendiente de autorización

No iniciar esta versión del backend contra una base sin 0033. Los repositorios
históricos ya esperan la nueva tabla. La migración solamente se aplicó a clústeres
temporales de pruebas; no se aplicó a las bases habituales.

Para un futuro despliegue autorizado: respaldo verificado, detener escritores de
la aplicación y ejecutar la migración transaccional con Drizzle. La migración toma
bloqueos sobre catálogo y tablas fuente para obtener una referencia consistente.
Su duración/espacio deben medirse sobre una copia del volumen real antes del pase.
No está prevista una reversión destructiva automática ni eliminación de capturas.

## Edición descriptiva: etapa posterior controlada

0033 por sí sola no habilita modificaciones de identidad. La etapa posterior
autorizada utiliza 0034 y una operación ADMIN específica para corregir nombres;
su contrato, bloqueos y pruebas están en [product-name-correction.md](product-name-correction.md).
Las solicitudes abiertas y los pedidos todavía operativos o reintentables bloquean
la corrección: no se introdujo un flujo alternativo de aceptación.
Marca, unidad, categoría, opciones y dimensiones mantienen sus restricciones.
Los snapshots no autorizan cambiar 400 ml por 200 ml o caja por unidad.

## Verificación reproducible, solo aislada

Desde `backend`:

```text
npm run build
npx tsc --noEmit
node --test --test-reporter=spec tests/*.unit.mjs
node scripts/test-product-bundles.mjs
node scripts/test-delivery-quotes.mjs
node scripts/test-delivery-tariffs.mjs
```

Los lanzadores crean clústeres privados temporales en 55447, 55448 y 55446,
comprueban su directorio y los detienen/eliminan al finalizar. No utilizar una URL
de desarrollo para sustituirlos. No ejecutan seed, pagos ni correos reales.

Desde `frontend`:

```text
node --test --test-reporter=spec tests/*.test.mjs
npm run lint
npm run build
```

La integración nueva verifica upgrade 0032→0033 con legado, migración limpia,
replay, procedencias, fuentes sin alteraciones, venta/pedido/movimientos,
devolución, PDFs reales, pago simulado, inmutabilidad y rollback. Incluye un fallo
deliberado de captura que debe responder 500 y revertir íntegramente la venta.
Los demás fallos deliberados de bundle, auditoría y Webpay pertenecen a sus pruebas
de recuperación existentes; no representan fallos pendientes de la batería.

Revisión visual realizada con componentes reales y datos simulados, sin API ni BD:
procedencias, tarjeta/detalle de pedido, teclado, Escape y restauración de foco;
320/360/375/400/1280 px en temas claro y oscuro sin desbordamiento horizontal.

## Cierre de la verificación interrumpida

Se retomó el mismo HEAD `ab4f420`, sin rehacer la implementación. La ejecución de
logística que había sido rechazada antes de iniciarse no se contó como aprobada.
En la continuación sí se autorizaron y completaron las integraciones de logística
(55440) y promociones (55445); ambas aprobaron y sus clústeres se eliminaron.
Se repitieron las 191 pruebas frontend, las 44 unitarias backend, ESLint,
TypeScript, ambos builds y los diff checks. El build frontend conserva una
advertencia de tamaño de bundle, no un error de compilación.

Las integraciones 3A/3B y tarifas históricas habían aprobado antes del corte y
no se modificaron sus contratos durante la continuación. No se volvió a ejecutar
una revisión visual completa: se conservó la comprobación previa con componentes
reales y datos simulados. No se desplegó ni migró una base habitual.

## Archivos de esta implementación

Nuevos:

```text
backend/drizzle/0033_commercial_identity_snapshots.sql
backend/drizzle/meta/0033_snapshot.json
backend/src/db/schema/commercialIdentitySnapshots.ts
backend/src/modules/products/historicalIdentity.ts
backend/tests/commercialHistory.integration.mjs
backend/tests/commercialHistory.unit.mjs
frontend/src/components/HistoricalIdentityNote.jsx
frontend/src/helpers/historicalIdentity.js
frontend/tests/historical-identity.test.mjs
docs/commercial-history.md
```

Modificados:

```text
backend/drizzle/meta/_journal.json
backend/src/db/schema/index.ts
backend/src/modules/deliveryQuotes/deliveryQuotes.service.ts
backend/src/modules/inventory/inventory.repository.ts
backend/src/modules/notifications/purchaseConfirmedMail.ts
backend/src/modules/onlineOrders/onlineOrders.repository.ts
backend/src/modules/onlineOrders/orderCommercialModel.ts
backend/src/modules/onlineOrders/orderReceiptPdf.ts
backend/src/modules/orderLogistics/logisticsLabelModels.ts
backend/src/modules/orderLogistics/orderLogistics.repository.ts
backend/src/modules/reports/managerStatistics.repository.ts
backend/src/modules/reports/managerStatistics.service.ts
backend/src/modules/sales/saleSummaryPdf.ts
backend/src/modules/sales/sales.repository.ts
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
backend/tests/productBundles.integration.mjs
frontend/src/components/orders/AdministrativeOrderCard.jsx
frontend/src/components/orders/OrderDetailModal.jsx
frontend/src/components/orders/OrderSummaryCard.jsx
frontend/src/helpers/administrativeOrder.js
frontend/src/pages/DeliveryQuotesPage.jsx
frontend/src/pages/ProductsPage.jsx
frontend/src/pages/SalesPage.jsx
frontend/src/pages/StatisticsPage.jsx
```

