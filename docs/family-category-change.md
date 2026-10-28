# Reclasificación controlada de familias

ADMIN dispone de `POST /api/product-families/:id/category-changes` y recuperación
`GET /api/product-families/:id/category-changes/:operationKey`. El servicio verifica
el rol independientemente de la ruta. Cuerpo estricto: categoryId, reason (8–500),
expectedRevision, operationKey y confirmed=true. Categorías no tienen estado de
habilitación: deben existir y se bloquean contra eliminación durante la operación.

La transacción adquiere el lock de promociones y el lock familiar existente,
bloquea la familia y todos sus productos en orden de ID, incluidos los inactivos.
Verifica revisión, familia no archivada, cambio real, categoría destino,
colisiones de nombres de familia/productos y compatibilidad de promociones para
todos los miembros (también inactivos). Se actualizan solo category_id/updated_at.
La coherencia de marca/categoría por familia sigue comprobándose mediante el
constraint trigger diferido existente, sin desactivarlo.

Se reutiliza la comprobación SQL de compromisos/capturas de 0034, sin modificarla:
solicitudes abiertas, pedidos distintos de entregados salvo CLOSED_UNPAID,
repartos POS pendientes, devoluciones en revisión o capturas faltantes impiden el
cambio. Los errores identifican el impedimento. Los pedidos cancelados/expirados
ordinarios siguen siendo reintentables en el sistema actual y también bloquean.
No se alteran cotizaciones, aceptaciones, pagos, reservas ni importes.

Los carritos no constituyen reservas ni contratos persistidos: el checkout existente
revalida productos/promociones y fingerprint. Se comprueba que una cotización de
carrito obsoleta por la nueva promoción de categoría es rechazada. No se agregan
flujos de aceptación. Un cambio de categoría puede cambiar promociones futuras;
no mueve ni modifica definiciones de promociones ni descuentos anteriores.

Auditoría en product_family_events, operación FAMILY_CATEGORY_CHANGE, product_id=null
y family_id concreto: administrador, motivo, fecha, categorías anterior/nueva con
sus nombres, IDs de todos los miembros, revisiones y hash del comando. No genera
un antecedente de asociación individual. Clave única, recuperación por el mismo
administrador/familia y rechazo de reutilización con datos distintos.

0035_family_category_reclassification.sql añade únicamente índice de idempotencia
y protección append-only de estos eventos. Incluye snapshot/journal Drizzle.
No reescribe 0033/0034 ni tablas comerciales. TRUNCATE ya está protegido por 0034.
Aplicar el historial pendiente hasta 0035 solo tras autorización para la base real.
Se probó únicamente en PostgreSQL temporal; no se modificaron bases habituales.

Las capturas de ventas, pedidos, movimientos y solicitudes no se actualizan.
El legado mantiene LEGACY_REFERENCE/LEGACY_PARTIAL. Inventario histórico filtra
por la categoría capturada desde 0033. Las estadísticas comerciales leen capturas;
alertas de stock y catálogo siguen representando clasificación vigente, no historia.
No existe una agrupación histórica nueva ni se inventan categorías originales.

El editor conserva el selector genérico bloqueado y ofrece Cambiar categoría como
operación independiente. Un borrador sucio/archivos pendientes impide abrirla.
El diálogo muestra familia, categoría, cantidad total de variantes, destino,
motivo y confirmación. Suspende el modal principal y conserva el comando exacto
por administrador/familia para recuperar respuestas inciertas sin reenviar otros
campos. No hay modificación masiva de nombres, marca, unidades o dimensiones.

Archivos nuevos:

```text
backend/drizzle/0035_family_category_reclassification.sql
backend/drizzle/meta/0035_snapshot.json
backend/src/modules/productFamilies/familyCategory.service.ts
backend/tests/familyCategory.integration.mjs
backend/tests/familyCategory.unit.mjs
frontend/src/components/FamilyCategoryDialog.jsx
frontend/src/helpers/familyCategory.js
frontend/tests/family-category.test.mjs
docs/family-category-change.md
```

Adaptados: journal Drizzle; productFamilies.routes.ts; ProductBundleEditor.jsx;
productBundles/commercialHistory/deliveryQuotes/deliveryTariffs.integration.mjs
(secuencia de 36 migraciones); product-name-correction.test.mjs (suspensión compartida).
No se modificaron contratos de nombres, snapshots ni checkout.

Pruebas: permisos de ruta/servicio; variantes activas/inactivas; ventas históricas;
IDs/datos/capturas intactos; destino inexistente; unicidad; promociones incompatibles
en variante inactiva; solicitud abierta; carrito obsoleto; pedido/pago pendiente;
revisión, concurrencia idempotente, recuperación, auditoría única e inmutable,
rollback deliberado HTTP 500 y catálogo. Las suites previas conservan conversiones,
pagos simulados, devoluciones y recuperación de nombre.

Revisión visual completada durante la incorporación controlada de dimensiones:
componentes reales con API simulada, apertura/cierre, selección por teclado,
motivo obligatorio, Escape y ciclo/restauración del foco; temas claro/oscuro y
320, 360, 375, 400 y 1280 px sin desbordamiento horizontal. No se requirió cambiar
la lógica comercial ni los estilos del diálogo de categoría.
