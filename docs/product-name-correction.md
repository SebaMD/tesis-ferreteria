# Corrección descriptiva de nombres de productos

## Contrato

ADMIN puede corregir el nombre individual del mismo artículo, tenga o no historial,
mediante `POST /api/products/:id/name-corrections`. El cuerpo permite solamente
`name`, `reason`, `expectedRevision`, `operationKey` y `confirmed: true`.
Nombre: 2–150 caracteres, sin controles, espacios normalizados, único en categoría
sin distinguir mayúsculas ni espacios repetidos. Motivo: 8–500 caracteres.
Un nombre equivalente al actual se rechaza, no genera una auditoría vacía.

`GET /api/products/:id/name-corrections/:key` recupera un resultado confirmado o
devuelve null. Requiere el mismo administrador y producto de la operación.
Una clave con datos distintos o una revisión obsoleta se rechaza. Nunca se
actualiza la revisión esperada para forzar un reintento.

La corrección no modifica el nombre general de la familia ni otros artículos.
Se conservan ID, clasificación, atributos, opciones, variant_key, código, precio,
marca, unidad, fotografías, stock y movimientos. Las vías genéricas PATCH/bundle
ya no admiten cambiar nombres existentes, incluso sin historial.

## SQL y auditoría

Migración nueva: `0034_controlled_product_names.sql`, con snapshot/journal de Drizzle.
0033 no se modifica retrospectivamente. Aplicar 0033 antes de 0034 en un futuro
despliegue expresamente autorizado; no iniciar este backend sin ambas migraciones.

Se reutiliza `product_family_events`, también con `family_id=null` en un producto
simple. La operación `PRODUCT_NAME_CORRECTION` contiene administrador, motivo,
fecha, fila anterior completa, transactionId, nombre nuevo, revisión y requestHash.
Un índice único protege operationKey para estas correcciones.

La excepción en el trigger existente exige una auditoría ADMIN activa de la misma
transacción y del producto/familia correctos, que coincida exactamente con OLD.
Solo pueden diferir `name` y `updated_at`. Verifica las capturas de las cuatro
fuentes, los bloqueos pendientes, nombre y unicidad. No utiliza una variable de
sesión booleana ni deshabilita triggers. Las demás ramas de protección se conservan.

Un constraint trigger diferido comprueba al COMMIT que la auditoría y la fila final
coincidan. Un fallo revierte ambas. Las correcciones auditadas no se pueden editar,
borrar ni truncar. Como siempre, esto no protege contra un propietario PostgreSQL
que deliberadamente altere el esquema o desactive sus protecciones.

Se reutiliza el advisory lock familiar y se bloquea el producto FOR UPDATE.
Checkout/solicitudes también bloquean los productos antes de capturar sus líneas;
una carrera no puede pasar entre la revisión y el cambio del nombre. Las carreras
con varios recursos pueden ser rechazadas por PostgreSQL: no se reintentan con una
revisión nueva ni se sobrescribe otro cambio.

## Compromisos pendientes

Se bloquea ante:

- Solicitud en REQUESTED, ASSIGNED, PROPOSED o APPROVED.
- Pedido online distinto de DELIVERED, salvo cierre manual CLOSED_UNPAID.
- Reparto POS distinto de DELIVERED.
- Solicitud de devolución PENDING.
- Cualquier línea comercial sin la captura histórica exigida por 0033.

El mensaje identifica la solicitud/pedido/devolución que impide corregir.
No se modifican su estado, destino, aceptación, flete, importe ni reservas.
Un pedido CANCELLED, EXPIRED o PAYMENT_FAILED ordinario sigue admitiendo reintento
en el backend actual: por eso también bloquea. No equivale a un cierre comercial
definitivo. No se añadió una nueva operación de cierre para esos pedidos.
Una solicitud con fecha vencida pero aún abierta debe resolverse/vencerse mediante
su flujo existente; el renombrado no la cierra silenciosamente.

## Editor y recuperación

Producto simple y variantes existentes muestran el nombre de solo lectura y la
acción «Corregir nombre». Los nombres nuevos siguen editables al crear artículos.
La conversión conserva el nombre del original y no ofrece correcciones dentro de
esa operación sensible; se corrige por separado antes o después.

Se reutiliza el diálogo de renombrado de atributos con configuración específica
de producto. Solo un modal queda activo; los datos del editor permanecen montados.
Un borrador sucio, archivos pendientes o una operación incierta impiden mezclar
guardados. El diálogo confirma nombre anterior/nuevo y exige motivo y declaración
de que sigue siendo el mismo artículo físico. No hay guardado automático del padre.

El comando exacto se conserva en sessionStorage, acotado a ADMIN/producto, antes
de enviar. Ante fallo de red/5xx se puede consultar el resultado o repetir la misma
clave/cuerpo. No se genera una operación nueva automáticamente. Escape/cancelación
funcionan normalmente, excepto mientras un resultado incierto exige recuperación.

## Historia y límite semántico

Las nuevas operaciones capturan el nombre corregido. Ventas, pedidos, movimientos,
devoluciones y documentos anteriores siguen usando su captura, sin recalcular dinero.
LEGACY_REFERENCE y LEGACY_PARTIAL conservan la procedencia anterior, no se convierten
en ORIGINAL por corregir el catálogo. No se reconstruye ninguna identidad pasada.

El software no puede demostrar automáticamente que dos textos arbitrarios describen
el mismo artículo físico. Se requiere confirmación ADMIN responsable y motivo
auditable; no es una herramienta para sustituir 400 ml por 200 ml. No se admiten
campos de unidad, opciones, marca, stock, precio o categoría en esta operación.

## Verificación y archivos

Pruebas nuevas: `backend/tests/productNameCorrection.unit.mjs`,
`backend/tests/productNameCorrection.integration.mjs` y
`frontend/tests/product-name-correction.test.mjs`.
El runner aislado de bundles incluye los nuevos casos; las migraciones solo se
ejecutan en clústeres temporales. Incluye fallo deliberado de auditoría con HTTP 500
y rollback sin cambios parciales, recuperación/replay, carreras, legado y PDFs.

Archivos nuevos de implementación:

```text
backend/drizzle/0034_controlled_product_names.sql
backend/drizzle/meta/0034_snapshot.json
backend/src/modules/products/productNameCorrection.service.ts
frontend/src/components/ProductNameCorrectionAction.jsx
frontend/src/helpers/productNameCorrection.js
docs/product-name-correction.md
```

Archivos existentes adaptados en esta etapa:

```text
backend/drizzle/meta/_journal.json
backend/src/modules/products/products.routes.ts
backend/src/modules/products/products.service.ts
backend/src/modules/productFamilies/productBundle.service.ts
backend/tests/productBundles.integration.mjs
backend/tests/commercialHistory.integration.mjs
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
frontend/src/services/products.service.js
frontend/src/components/ProductAttributeRenameDialog.jsx
frontend/src/components/ProductBundleEditor.jsx
frontend/src/pages/ProductsPage.jsx
frontend/tests/part-a-redesign.test.mjs
frontend/tests/unified-editing.test.mjs
frontend/tests/variant-admin-final.test.mjs
docs/commercial-history.md
```

La revisión visual usa componentes reales y API simulada, sin BD: bloqueo de
borrador, comparación de nombres, un solo modal activo, foco/Escape, respuesta
incierta y recuperación sin submit del formulario padre. Comprobados ambos temas
y 320/360/375/400/1280 px sin desbordamiento horizontal.

Resultado: 194 pruebas frontend, 46 unitarias backend, ESLint, TypeScript y ambos
builds aprobados. Integraciones aisladas de productos/historial/correcciones,
cotizaciones 3A/3B y tarifas históricas aprobadas. El build frontend conserva su
advertencia de bundle grande. Los HTTP 500 deliberados prueban rollback, no son
fallos pendientes. No hubo migraciones ni escrituras sobre las bases habituales.
