# Despacho local de tarifa fija y lápices de inventario

## Diseño y alcance

Las compras nuevas tienen dos modalidades: retiro sin costo, o despacho a Santa Juana (Región del Biobío). No se agrega geocodificación, cálculo de distancia ni una integración de mapas. La comuna es el valor canónico existente `Santa Juana`, validado por backend; una dirección libre que contenga esas palabras no reemplaza el dato estructurado. La dirección y la referencia permiten describir un sector sin numeración, pero no prueban físicamente su ubicación.

Se reutilizan `delivery_settings` y las revisiones inmutables `delivery_policy_revisions`. El nuevo modo explícito es `LOCAL_FIXED`. La interfaz propone $3.000 y umbral $500.000. El backend calcula:

- Retiro: $0.
- Despacho: tarifa fija, salvo que el subtotal de productos **después de descuentos** sea estrictamente mayor al umbral vigente.
- Exactamente $500.000: $3.000; $500.001: $0, con la configuración inicial.

No se aceptan montos de despacho enviados por el navegador. El pedido captura su revisión, cargo, razón, subtotal, descuentos y total. La preparación de Webpay utiliza el total persistido y la confirmación conserva la comprobación existente de monto, orden y sesión. Cambiar la configuración no recalcula pedidos anteriores.

## Compatibilidad con solicitudes anteriores

Las solicitudes, propuestas, aprobaciones, aceptaciones y snapshots anteriores no se borran ni se reprician. Los accesos existentes en administración, cliente e invitado continúan permitiendo consultar y terminar esas operaciones. Bajo `LOCAL_FIXED`, se utiliza la revisión manual inmutable correspondiente a la propuesta/aprobación anterior, no la tarifa nueva. Se conservan expiración, revisión comercial, autorización y aceptación del comprador.

Al activar `LOCAL_FIXED`, los endpoints de creación de solicitudes manuales y la configuración manual rechazan nuevas altas/reactivaciones. Un trigger adicional impide también insertar solicitudes manuales nuevas directamente por SQL bajo ese modo. El bloqueo compartido de política se coordina con la activación exclusiva. Los formularios manuales se mantienen para las solicitudes que ya existían, no en el checkout nuevo.

Deshabilitar despacho bloquea compras nuevas y nuevos intentos de pago de solicitudes manuales antiguas. No invalida callbacks de pagos que ya estaban iniciados. Los reintentos de pedidos existentes conservan sus condiciones persistidas y las protecciones previas. Pago confirmado no significa entrega: siguen existiendo preparación y estados operativos de reparto/retiro.

## Migración y activación pendientes

`0040_local_fixed_delivery.sql` es incremental después de 0039, con journal y snapshot Drizzle. Amplía el check de política, conserva el trigger de autorización manual y sus comprobaciones, añade validación SQL del destino/cargo local y cierra las nuevas solicitudes manuales tras la activación. No actualiza registros comerciales, no elimina datos ni deshabilita triggers.

La migración **no activa automáticamente** una tarifa ni modifica la configuración comercial existente. Después de autorizar y aplicar la migración en el entorno correspondiente, ADMIN/MANAGER puede ir a **Pedidos y repartos → Configurar despacho**, revisar $3.000 / $500.000 y confirmar una nueva revisión `LOCAL_FIXED`. Hasta entonces, el checkout nuevo conserva retiro; no debe prometerse un despacho local habilitado.

No se aplicó 0040 a la base habitual durante esta tarea. Su despliegue requiere una autorización posterior, respaldo reciente verificado mediante restauración, revisión de journal y ausencia de escritores. No arrancar un backend nuevo contra un esquema incompleto ni ejecutar `db:push`. Usar `npm run db:migrate` con destino local comprobado y volver a comparar datos, snapshots y triggers antes de abrir tráfico. No restaurar automáticamente sobre el original ante un fallo.

## Interacción de lápices

`AuditedValueControl` presenta un valor estático y un botón de lápiz separado dentro del mismo borde. Nombre, marca, categoría y nombre de atributo conservan exactamente sus operaciones auditadas. El texto, valor y espacio del control no abren el diálogo. Las opciones compartidas mantienen su lápiz específico; no reasigna un SKU histórico.

La unidad individual editable usa el selector existente en modo de lectura hasta pulsar su lápiz; no se crea un diálogo ni un guardado nuevo. Escape/selección finalizan esa edición y restauran el foco. Las unidades históricas bloqueadas siguen sin una acción ficticia. El selector general y las selecciones normales de opciones conservan sus flujos propios. En la tabla, el texto “Editar” es estático y el botón de lápiz inicia la edición. Hover y foco están limitados a `.inventory-pencil-button`.

## Archivos de esta tarea

Backend de entrega:

- `src/db/schema/deliverySettings.ts`.
- `src/modules/deliverySettings/deliveryPricing.ts`, `deliverySettings.service.ts`.
- `src/modules/deliveryQuotes/manualDeliveryAuthorization.ts`, `deliveryQuotes.service.ts`, `deliveryQuoteCheckout.service.ts`.
- `src/modules/onlineOrders/onlineOrders.controller.ts`, `onlineOrders.service.ts`, `orderAmountColumns.ts`.
- `drizzle/0040_local_fixed_delivery.sql`, `drizzle/meta/0040_snapshot.json`, `drizzle/meta/_journal.json`.

Frontend:

- `src/components/AuditedValueControl.jsx`, `GroupedInventoryTable.jsx`, `ProductFormFields.jsx` y `src/styles/styles.css`.
- `src/components/DeliverySettingsManager.jsx`, `DeliveryConditions.jsx`, `orders/OrderAmounts.jsx`.
- `src/pages/CheckoutPage.jsx`, `DeliveryConditionsPage.jsx`, `DeliveryQuotesPage.jsx`, `src/helpers/checkoutQuote.js`.

Pruebas:

- Nuevas: `backend/tests/localDelivery.unit.mjs`, `backend/tests/localDelivery.integration.mjs`, `frontend/tests/local-delivery.test.mjs`.
- Runner: `backend/scripts/test-delivery-tariffs.mjs` (scope `local`).
- Fixtures de regresión actualizados al journal hasta 0040 y a la validación estructurada de comuna: `commercialHistory.integration.mjs`, `deliveryQuotes.integration.mjs`, `deliveryTariffs.integration.mjs`, `manualDelivery.integration.mjs`, `productBundles.integration.mjs`.
- Pruebas frontend de lápices/unidades y contrato del checkout nuevo: `inventory-pencil-polish.test.mjs`, `product-units.test.mjs`, `delivery-quote-flow.test.mjs`, `delivery-stage1.test.mjs`, `delivery-tariffs.test.mjs`, `manual-delivery.test.mjs`, `unified-creation.test.mjs`, `ux-helpers.test.mjs`.

Los restantes cambios staged/unstaged/untracked ya acumulados se conservan y no forman parte automáticamente de esta tarea.

## Reproducción segura de pruebas

Desde `backend`, con binarios PostgreSQL conocidos y sin cargar el servidor habitual:

```powershell
$env:PG_TEST_BIN='C:/Users/Sebastian/AppData/Local/Temp/fyf-demo-pg16-20261028/engine/pgsql/bin'
$env:DELIVERY_TEST_SCOPE='local'
node scripts/test-delivery-tariffs.mjs
```

El runner crea y retira un clúster privado en `backend/tmp/fyf-delivery-test-*`, puerto 55446. Valida host, puerto y directorio; no apunta a 5432/5433. El SDK Webpay está sustituido por un doble local y el correo se deshabilita **solo en el proceso de test**. Se importa `app.js`, no `server.js`, por lo que no arranca la conciliación periódica habitual. No se modifican `.env`, `MAIL_ENABLED` habitual ni el arranque de conciliación del propietario.

El modo opcional `LOCAL_DELIVERY_VISUAL=1` conserva temporalmente la API en 5195 para revisión de navegador; no es un servidor de demostración permanente ni un proveedor real de pagos. No activar esa opción para una ejecución normal de la suite.

## Cobertura de verificación

La suite local prueba una actualización 0039→0040 con solicitud/pago manual y capturas ya existentes, replay sin DML comercial, triggers habilitados, cierre de nuevas solicitudes manuales, tarifa/umbral/descuentos, invitado, comuna manipulada, montos manipulados, revisión obsoleta, importes/snapshots inmutables, callbacks duplicados, rechazo/cancelación/reintento, monto incorrecto y reserva concurrente. Las suites anteriores cubren solicitudes manuales, logística, productos, conversiones, ventas, devoluciones y unidades protegidas.

La revisión de navegador utiliza frontend real, API real y PostgreSQL aislado; solo Webpay es simulado. Las verificaciones de interfaz no acreditan un cobro ni un envío real. La validación física de direcciones y un ensayo contra Webpay externo de integración no forman parte de esa comprobación local.

### Resultado de esta ejecución

- PostgreSQL **16.15** real, binarios nativos y clústeres temporales en 55440/55446/55447/55448: integraciones local, solicitudes anteriores, tarifas históricas, logística, productos/ventas/devoluciones/historial y aplicación segura de unidades aprobadas. Los clústeres se detuvieron y retiraron.
- Frontend: **247/247** pruebas; ESLint y build aprobados.
- Backend: **59/59** pruebas unitarias; `npx tsc --noEmit` y build aprobados.
- `git diff --check` aprobado. Journal: 41 entradas únicas hasta índice 40; padre del snapshot 0040 coincide con 0039.
- Navegador con datos desechables reales: $45.000 + $3.000 = $48.000, redirección a Webpay local simulado, callback autorizado, estado pagado pendiente de preparación y persistencia del comprobante tras recargar. Administración muestra destino y cargo capturados, sin cotización nueva.
- Checkout claro/oscuro en 320, 360, 375, 400 y 1280 px sin desbordamiento horizontal. Editor con tres atributos, variante activa histórica e inactiva elegible; valor/texto inerte, lápiz funcional, apertura por Enter y retorno del foco con Escape. Unidad histórica protegida, unidad elegible editable solo desde su lápiz. Sin errores de consola observados.
- Las expectativas antiguas de HTTP 409 con una comuna inválida se corrigieron para que sus fixtures usen `Santa Juana` y alcancen la protección que realmente intentan probar. Comuna inválida sigue devolviendo HTTP 400. El fixture de promoción utiliza una fecha de inicio anterior explícita para evitar una carrera entre microsegundos PostgreSQL y milisegundos JavaScript. No se relajaron reglas de negocio.
- Advertencia no bloqueante de Vite: bundle mayor de 500 kB. No se introdujo una refactorización de empaquetado ajena al alcance.
- Rama/HEAD preservados: `feature/tarifas-despacho` / `656e935`. Los 11 staged conservan la huella `446033b45ab238f5bbef08d626792d7b296ea924`; no se ejecutaron operaciones de staging, commit o push.
