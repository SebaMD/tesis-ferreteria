# Corrección de marca y categoría de SKU simples

## Diagnóstico y alcance

Marca y categoría se guardan en `products.brand` y `products.category_id`, no en una entidad padre. El editor genérico permitía escribir ambos; la marca con historial era rechazada por backend/SQL, mientras que la categoría podía cambiar sin motivo administrativo. `0035` y `0037` son operaciones familiares y no pueden aplicarse a un SKU simple. `0038` protege opciones, sin relación con esta operación.

Se añade una operación para un único campo por comando: `POST /api/products/:id/classification-corrections`, y recuperación `GET /api/products/:id/classification-corrections/:key`, ADMIN en ruta y servicio. Cuerpo: `field` (`brand` o `category`), `previousValue`, `value`, `reason` (8–500), `expectedRevision` (updatedAt ISO), `operationKey`, `confirmed: true`. Marca: texto no vacío de 1–100, normalizado y sin controles; categoría: ID existente. Nombres equivalentes sin cambio real se rechazan.

La confirmación declara que sigue siendo el mismo artículo/fabricante; el sistema no puede demostrar semánticamente que dos marcas representan al mismo fabricante. Sustituir el producto físico, unidades, embalajes o cantidades no está autorizado por esta declaración.

## Persistencia y SQL

Migración incremental `0039_simple_product_classification.sql`, con journal y snapshot Drizzle encadenado a 0038. No crea tablas ni captura/restaura datos: añade índice de clave idempotente, verificador de auditoría, guard de categoría simple y constraint trigger diferido. Amplía estrechamente el trigger de identidad para marca simple con auditoría coincidente; conserva todas las ramas anteriores de familias, desvinculación, dimensiones, nombre y unidad.

La excepción exige ADMIN activo, fila anterior completa coincidente, transactionId actual, motivo, hashes/clave válidos, valor anterior/nuevo y revisión final. Solo pueden diferir el campo autorizado y updated_at. Se validan categoría, unicidad normalizada, promociones superpuestas y `fyf_assert_product_name_ready`. Una auditoría sin cambio exacto falla al COMMIT; no puede editarse, borrarse ni truncarse. No protege frente al propietario SQL que deliberadamente elimine triggers, como ocurre con las protecciones anteriores.

Se reutiliza `product_family_events` con familia nula y operación `PRODUCT_CLASSIFICATION_CORRECTION`. El DTO administrativo proyecta marca/categoría anteriores y nuevas, usuario, motivo, fecha e ID; no expone la fila cruda ni claves/hashes. No genera dos eventos al repetir el mismo comando. Las correcciones simples se excluyen de los antecedentes de asociación al evaluar una futura conversión.

Locks: promoción → advisory familiar → producto FOR UPDATE; categoría destino FOR SHARE. Valor anterior y revisión obsoletos no se actualizan silenciosamente. Se conservan importes, stock, imágenes, códigos, IDs, unidad, combinaciones y todas las capturas comerciales, incluido el origen LEGACY_REFERENCE. Las operaciones posteriores capturan la nueva clasificación.

## Casos bloqueados

- Miembro actual de familia o variante, valores de combinación residuales o asociaciones familiares previas: requiere administrar/revisar la recuperación familiar.
- Solicitudes abiertas, pedidos operativos/reintentables, reservas asociadas, repartos POS o devoluciones pendientes, y capturas faltantes: se reutiliza el guard existente, no solo productHasHistory.
- Categoría destino inexistente, colisión de nombre normalizado o promociones activas con periodos superpuestos, también para SKU inactivo.
- Motivo/confirmación ausentes, valor anterior/revisión obsoletos, clave de otro actor/producto/payload o modificación de otro campo.

El guardado genérico continúa sencillo para artículos sin historial, con sus validaciones actuales. Para históricos, la marca sigue bloqueada por el guard habitual y la categoría ahora exige también esta corrección auditada en backend y SQL. No se habilitan unidades históricas.

## Interfaz

La lista/detalle de productos expone hasHistory (ventas, pedidos o movimientos) para mostrar controles auditados de marca/categoría en el editor simple histórico. No se usa ese dato como autorización definitiva. Se reutilizan AuditedValueControl, AppModal y el buscador de categorías. El diálogo muestra SKU real, valor actual/propuesto, motivo, declaración de mismo artículo y límites de clasificación vigente/promociones.

Un borrador sucio o imágenes pendientes impiden iniciar la operación. Cancelar/Escape no escriben; con resultado incierto se exige recuperar o repetir exactamente el comando guardado en sessionStorage, acotado a ADMIN/SKU/campo. No se actualiza silenciosamente la revisión. Tras confirmar se recargan datos y revisión del editor; los otros controles auditados se remontan con la revisión actualizada.

## Despliegue y pruebas

0039 requiere 0033–0038; no se aplicó a bases habituales. Si falta 0039, la operación rechaza con un mensaje de esquema pendiente, sin escribir. El índice puede requerir escaneo/lock sobre eventos: respaldar y ensayar restauración y detener escritores antes de una actualización habitual autorizada. No reescribir el journal ni ejecutar db:push. El esquema habitual puede seguir en 0036: no dar por instaladas 0037–0039.

Integración incorporada al runner temporal de bundles: casos sin historial, ENTRY/ventas/pedido finalizado, pendientes, permisos en ruta/servicio, familia excluida, valor/revisión, concurrencia, replay/recuperación, colisión/promociones, inmutabilidad, rollback tras auditoría y rechazo al COMMIT de auditoría incompleta. Se comprueban capturas y datos comerciales sin alteración, catálogo e historial administrativo. Pruebas frontend cubren aislamiento del borrador, recuperación acotada y el cableado de controles; no sustituyen una revisión manual de navegador con persistencia.

Archivos nuevos: migración/snapshot 0039, `productClassification.service.ts`, `ProductClassificationAction.jsx`, `helpers/productClassification.js`, pruebas unitarias/integración/backend y frontend específicas. Adaptados: rutas/servicio/repositorio de productos, proyector de auditoría, exclusión de eventos descriptivos en conversión, ProductsPage y recuentos de migraciones en fixtures. No se modificaron servicios de pago, despacho o inventario.

Resultado: 235/235 pruebas frontend, 57/57 unitarias backend; ESLint frontend, TypeScript y ambos builds correctos. La suite de bundles aprobó sus 27 bloques, incluido el nuevo escenario simple y las regresiones familiares, en un servidor cuya versión SQL fue exactamente 16.15. Migración y replay hasta 0039 (40 entradas) comprobaron legado intacto. No se repitió una revisión manual de navegador del nuevo diálogo: queda pendiente sobre un entorno aislado con 0039 antes de dar por comprobada su presentación real en móvil/ambos temas. Los tests frontend son de contrato/helpers, no una simulación de persistencia ni una prueba completa de accesibilidad.

Manifest de esta tarea:

```text
backend/drizzle/0039_simple_product_classification.sql
backend/drizzle/meta/0039_snapshot.json
backend/drizzle/meta/_journal.json
backend/src/modules/products/productClassification.service.ts
backend/src/modules/products/products.routes.ts
backend/src/modules/products/products.service.ts
backend/src/modules/products/products.repository.ts
backend/src/modules/productFamilies/productBundle.service.ts
backend/src/modules/productAudits/productAudits.dto.ts
backend/tests/productClassification.integration.mjs
backend/tests/productClassification.unit.mjs
backend/tests/productBundles.integration.mjs
backend/tests/commercialHistory.integration.mjs
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
frontend/src/components/ProductClassificationAction.jsx
frontend/src/helpers/productClassification.js
frontend/src/pages/ProductsPage.jsx
frontend/tests/product-classification.test.mjs
docs/simple-product-classification.md
```
