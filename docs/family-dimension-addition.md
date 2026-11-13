# Incorporación controlada de una dimensión

ADMIN puede incorporar **una dimensión por operación** a una familia existente no
archivada. No se modifica el guardado general: continúa bloqueando cambios de las
dimensiones persistidas. Tampoco se habilitan eliminación de dimensiones,
sustitución de opciones históricas, cambios de marca/unidad ni fusiones de SKU.

## Interfaz y contrato

En Editar producto con variantes → Atributos → Agregar otro atributo se abre una
operación independiente. Un borrador modificado o archivos pendientes impiden
iniciarla; nunca se guardan ni descartan automáticamente esos cambios.

Se solicitan nombre, opciones (una por línea), asignación explícita para **todos**
los artículos activos e inactivos, motivo de 8–500 caracteres y confirmación de
la vista previa Antes/Después. No hay asignación por defecto. Editar la lista de
opciones limpia únicamente las asignaciones de esta operación para evitar que
un índice cambie silenciosamente de significado. No se crean productos ni
combinaciones cartesianas. Posteriormente se pueden crear variantes reales por
el flujo habitual.

- `POST /api/product-families/:id/dimension-additions`
- `GET /api/product-families/:id/dimension-additions/:operationKey`

Cuerpo estricto: `name`, `options: string[]`,
`assignments: {productId, optionIndex}[]`, `reason`, `confirmed=true`,
`expectedRevision` y `operationKey`. Máximos: 8 dimensiones por familia, 100
opciones por dimensión y 1.000 miembros por operación. Nombres/opciones se
normalizan y no admiten duplicados por mayúsculas o espacios.

Ruta y servicio comprueban ADMIN activo. Clave/resultado quedan vinculados a la
familia, administrador y hash del comando. Un reintento idéntico recupera el
resultado; reutilizar la clave con otros datos se rechaza. El comando congelado
se conserva por administrador/familia en sessionStorage ante respuesta incierta;
se consulta o reintenta **el mismo** comando. No se actualiza su revisión en
silencio. Tras éxito se recarga el editor con la nueva revisión.

## Transacción y SQL

`0036_controlled_family_dimension.sql`, posterior a 0033/0034/0035, incorpora una
excepción aditiva acotada al trigger de identidad. No desactiva ningún trigger ni
retira restricciones únicas, claves foráneas o comprobaciones canónicas.

El servicio toma el lock familiar existente y bloquea familia y productos en
orden de ID. Verifica revisión, todos los miembros, capturas completas y
operaciones pendientes antes de escribir. Inserta atributo/opciones, **un solo
valor nuevo por producto**, y actualiza exclusivamente variant_key/updated_at.
La clave sigue ordenándose por attribute_id, no por los nombres visibles.

Dos eventos append-only dentro de la misma transacción:

1. `DIMENSION_ADD_AUTHORIZATION`: captura exacta previa, revisión, txid,
   administrador, motivo, atributo/opciones nuevos y asignación de cada SKU.
2. `DIMENSION_ADD`: referencia a la autorización, clave/hash y revisión final.

El trigger previo exige que el estado declarado coincida con la base real antes
de actualizar los SKU. La excepción histórica solo permite añadir la opción
autorizada a la clave, conservando los demás campos. Al COMMIT, un constraint
trigger verifica que el conjunto de productos sea el mismo, sus campos e
imágenes se conserven, todos los atributos/opciones/valores anteriores sigan
intactos y cada miembro reciba exactamente el valor nuevo auditado. También
exige el resultado correspondiente y ejecuta fyf_verify_variant. Fallar cualquier
paso revierte datos y ambos eventos. Las claves son únicas por tipo de evento;
UPDATE/DELETE de estos eventos están prohibidos y TRUNCATE ya lo protege 0034.
Los eventos son de familia (product_id=NULL), no antecedentes falsos de asociación.

## Historial y bloqueos

No se modifican capturas comerciales. Ventas, pedidos, movimientos, devoluciones
y documentos mantienen la clasificación capturada; el legado conserva su
procedencia LEGACY_REFERENCE/LEGACY_PARTIAL. Las nuevas capturas incluyen la
dimensión añadida. No se cambia stock, precio, unidad, nombre, barcode, estado,
categoría, imágenes ni importes de operaciones anteriores.

Se reutiliza la comprobación de compromisos de 0034: solicitudes de despacho
abiertas, pedidos operativos o reintentables (salvo cierre CLOSED_UNPAID),
repartos POS pendientes, devoluciones en revisión y capturas faltantes bloquean
la operación. El error identifica la operación pendiente. No se añade aceptación
ni se modifican pagos, reservas o logística. Los carritos no son reservas; siguen
usando SKU concretos y las revalidaciones existentes. Las promociones permanecen
asociadas a los mismos productos/categorías, que esta operación no cambia.

Además se bloquea cuando un artículo histórico está desvinculado de esta familia:
su recuperación protegida exige la combinación original, que quedaría incompleta
si se añadiera la dimensión mientras permanece fuera. Debe recuperarse antes o
dejar la ampliación pendiente. No se reescriben eventos DETACH ni se permite
reasociarlo a otra combinación/familia. Familias vacías o con más de 1.000 miembros
no se amplían por este contrato.

El catálogo conserva variantOptionState sin cambios: cualquier selección resuelve
un producto existente; una intersección inexistente no se vuelve comprable.

## Verificaciones

- Integración privada PostgreSQL 18, puerto 55447: migración limpia/actualización
  desde 0032, dimensiones segunda/tercera, variantes activas/inactivas con ENTRY
  y ventas, imágenes, asignación incompleta/ajena/repetida, nombres inválidos,
  permisos de ruta/servicio, revisiones, carreras con misma/distinta clave,
  recuperación, auditoría única, manipulación SQL y rollback deliberado.
- Comprobado bloqueo por solicitud, devolución, reparto POS, pedido con pago
  pendiente y artículo histórico desvinculado. Comprobadas nueva variante real,
  renombrado descriptivo y reclasificación posteriores. Capturas anteriores
  intactas y nuevas ventas con la clasificación ampliada.
- Regresiones aisladas de cotizaciones 3A/3B (55448) y tarifas históricas (55446),
  incluidos reservas, promociones y Webpay simulado, aprobadas.
- Frontend: 200 pruebas; backend unitario: 49 pruebas. ESLint, TypeScript/build
  backend y build frontend aprobados. Vite conserva su aviso
  de tamaño de bundle, ajeno a esta operación.
- Navegador con componentes reales y API simulada: ambos temas; 320, 360, 375,
  400 y 1280 px sin desbordamiento horizontal; asignaciones inicialmente vacías,
  vista previa y recuperación de respuesta incierta. Categoría: apertura/cierre,
  motivo obligatorio, selección por teclado, Escape, ciclo/restauración de foco
  y ambos temas/tamaños. No requirió cambiar la lógica ni estilos de categoría.

No se aplicó ninguna migración en bases habituales ni se enviaron correos o pagos
reales. Antes de utilizar la función en una base real debe autorizarse y aplicarse
la secuencia pendiente hasta 0036, con respaldo y revisión. No ejecutar el backend
nuevo contra un esquema anterior. No se realizaron commits ni cambios de índice.

## Archivos de esta operación

Nuevos: migración y snapshot Drizzle 0036; familyDimension.service.ts;
familyDimension.integration.mjs y familyDimension.unit.mjs;
FamilyDimensionDialog.jsx; helpers/familyDimension.js;
tests/family-dimension.test.mjs; este documento.

Adaptados: journal Drizzle; productFamilies.routes.ts; ProductBundleEditor.jsx;
productBundles/commercialHistory/deliveryQuotes/deliveryTariffs.integration.mjs
(secuencia de 37 migraciones); conversion-flow-ux/unified-editing/
variant-review-polish/product-name-correction.test.mjs (contrato visual vigente);
family-category-change.md (revisión visual ya realizada). Los demás archivos
pendientes del repositorio pertenecen a tareas anteriores y se conservan.

Lista exacta de rutas modificadas o creadas durante esta tarea:

```text
backend/drizzle/0036_controlled_family_dimension.sql
backend/drizzle/meta/0036_snapshot.json
backend/drizzle/meta/_journal.json
backend/src/modules/productFamilies/familyDimension.service.ts
backend/src/modules/productFamilies/productFamilies.routes.ts
backend/tests/familyDimension.integration.mjs
backend/tests/familyDimension.unit.mjs
backend/tests/productBundles.integration.mjs
backend/tests/commercialHistory.integration.mjs
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
frontend/src/components/FamilyDimensionDialog.jsx
frontend/src/components/ProductBundleEditor.jsx
frontend/src/helpers/familyDimension.js
frontend/tests/family-dimension.test.mjs
frontend/tests/conversion-flow-ux.test.mjs
frontend/tests/unified-editing.test.mjs
frontend/tests/variant-review-polish.test.mjs
frontend/tests/product-name-correction.test.mjs
docs/family-dimension-addition.md
docs/family-category-change.md
```
