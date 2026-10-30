# Corrección auditada de etiquetas de opciones

## Alcance y contrato

ADMIN activo puede corregir ortografía o formato de una opción compartida de
una familia persistida. No reasigna opciones a SKU ni transforma un artículo
físico en otro. La equivalencia semántica no puede demostrarse automáticamente:
se exige declaración expresa del administrador y motivo, además de controles
técnicos. Cambiar 400 ml por 200 ml requiere otro tratamiento, no esta operación.

- `POST /api/product-families/:id/attributes/:attributeId/options/:optionId/label-corrections`.
- `GET /api/product-families/:id/attributes/:attributeId/options/:optionId/label-corrections/:operationKey`.
- Cuerpo estricto: `label`, `reason`, `confirmed: true`, `expectedRevision` y
  `operationKey`. No admite propiedades comerciales adicionales.
- Etiqueta de 1–100 caracteres, sin controles, con espacios normalizados;
  motivo de 8–500 caracteres. Rechaza nombres equivalentes al actual y
  duplicados del mismo atributo considerando mayúsculas/espacios normalizados.
- Verifica pertenencia real opción → atributo → familia, familia no archivada,
  autorización ADMIN en ruta y servicio, y revisión completa del editor.
- Una clave aplicada solo se recupera para el mismo administrador y destino.
  Repetirla con otro payload se rechaza; no se refresca una revisión obsoleta.

Se conservan IDs de familia, atributo, opción y productos; asignaciones,
`variant_key`, nombres, marca, categoría, unidades, stock/mínimos, precio,
códigos, imágenes y estados. El cambio descriptivo afecta a todos los artículos
que comparten la opción, incluidos los inactivos, sin crear combinaciones.

## Migración y garantía transaccional

`0038_controlled_family_option_labels.sql` sigue a 0037. Journal con índices
continuos 0–38 y snapshot enlazado a 0037, sin cambios de tablas del modelo.
No hace backfill ni crea un índice normalizado sobre etiquetas legadas: no
corrige, fusiona o elimina duplicados anteriores. Una corrección nueva sí
comprueba conflictos con esas etiquetas.

El servicio comprueba la presencia del guard de 0038 antes de escribir. Si no
está instalada, devuelve conflicto y no intenta la operación. No se ha aplicado
0037 ni 0038 a la base habitual durante esta tarea.

La transacción utiliza lock de precios/promociones, advisory lock de familias,
bloqueos `FOR UPDATE` de familia y productos en orden de ID, y de la opción.
Solo actualiza la etiqueta y la fecha técnica de la familia. La revisión de
bundle posterior cambia para impedir que otro editor sobrescriba la operación.

Dos eventos append-only en `product_family_events`, con `product_id=null` para
no inventar antecedentes de asociación individual:

1. `OPTION_LABEL_AUTHORIZATION`: estado SQL anterior exacto, revisión, txid,
   atributo/opción, etiqueta destino, miembros afectados, actor, motivo,
   clave idempotente y hash del comando.
2. `OPTION_LABEL_CORRECTION`: referencia a la autorización, etiquetas anterior
   y nueva, miembros, revisión posterior y los mismos actor/motivo/clave/hash.

La función del trigger existente `fyf_preserve_used_option` se amplía con una
excepción estrecha; el trigger no se desactiva. Cambiar una etiqueta requiere
la autorización coincidente de la misma transacción, incluso si aún no se usa.
El resto de la opción debe permanecer idéntico. La protección existente de
reasignación de opciones usadas se conserva.

El constraint trigger diferido verifica al COMMIT ambos eventos y el estado
completo: solo una etiqueta y `family.updated_at` pueden diferir. Comprueba
productos, atributos, relaciones, imágenes, miembros, actor y compromisos.
Faltas de auditoría, otro campo cambiado o miembros incompletos revierten todo.
Índice único por operación/clave, guard de UPDATE/DELETE de eventos y el bloqueo
de TRUNCATE existente mantienen la auditoría inmutable. Como las protecciones
anteriores, no pretende resistir a un propietario SQL que altere el esquema.

## Historial y compromisos pendientes

Se reutiliza `fyf_assert_product_name_ready` para cada artículo afectado, tanto
en servicio como en la autorización/verificación SQL, sin depender únicamente
de `productHasHistory`. Impide corregir con solicitudes REQUESTED, ASSIGNED,
PROPOSED o APPROVED; pedidos operativos/reintentables según la política vigente;
repartos POS no entregados; devoluciones PENDING o capturas faltantes. No cierra
ni modifica esas operaciones. El mensaje identifica el impedimento.

Los snapshots previos no se reescriben: originales y capturas posteriores de
referencia del legado conservan contenido y procedencia. Las ventas posteriores
capturan la nueva etiqueta. Catálogo y administración leen la etiqueta actual
por ID; la selección de combinaciones sigue utilizando identificadores.

Promociones apuntan a productos/categorías, no al texto de opciones. No se
modifican definiciones, descuentos, pedidos, pagos ni reservas. Los carritos no
son compromisos persistidos ni reservas. No se afirma que el fingerprint
económico detecte por sí solo una corrección textual.

## Editor y recuperación

En Atributos, las opciones persistidas se muestran como controles de valor con
lápiz. Son acciones distintas de seleccionar una combinación en una variante.
El diálogo muestra atributo, texto anterior/destino, lista y número de miembros
activos/inactivos, motivo y confirmación de la misma opción física.

Un borrador comercial o archivos pendientes impiden abrir la operación; no se
guardan ni descartan automáticamente. No se usa el endpoint de guardado general.
Al confirmar se recarga la familia/revisión y el foco vuelve a la etiqueta.

El comando queda congelado en sessionStorage por administrador/familia antes
del POST. Ante red/5xx se conserva la clave y revisión originales, se bloquea
la edición/cierre y se permite consultar o reenviar exactamente el mismo comando.
Una recarga vuelve a presentar la recuperación, sin repetir automáticamente el
POST. Cancelar antes de enviarlo no escribe ni crea opciones.

## Verificaciones realizadas

- Frontend completo: **211/211**. Backend unitario: **51/51**.
- ESLint frontend, TypeScript backend y builds de ambos: correctos. Vite mantiene
  su advertencia de chunk mayor de 500 kB; no se amplió el alcance para dividirlo.
- La primera repetición unitaria en sandbox falló solo por EACCES al servidor
  HTTP temporal de imágenes. La repetición autorizada fuera del sandbox aprobó
  51/51; no fue necesario cambiar código por ese bloqueo.
- Integración aislada completa de bundles: migración limpia e incremental
  hasta 0038, corrección usada por uno/varios artículos, historial e inactivos,
  registros legados, duplicados normalizados, permisos, pertenencia, revisión,
  concurrencia, idempotencia/otro payload, recuperación y auditoría inmutable.
- Verifica invariancia de estado comercial/snapshots, catálogo con etiqueta
  actual, futuras ventas con texto nuevo y asignaciones/claves intactas.
- Bloqueos por solicitud de despacho, pedido/reserva, devolución pendiente y
  reparto POS, incluidos artículos inactivos. Prueba SQL sin autorización,
  auditoría incompleta y tentativa de introducir un precio en la transacción.
- Los fallos HTTP 500 de auditoría/captura/guardado son inyecciones deliberadas
  para comprobar rollback/recuperación; las suites terminaron aprobadas.
- Regresiones aisladas deliveryQuotes 3A/3B y deliveryTariffs: aprobadas.
- Navegador con componentes reales y API simulada, sin backend habitual:
  apertura, cancelación, motivo requerido, declaración, borrador bloqueado,
  teclado/Escape/foco, respuesta incierta y recuperación; temas claro/oscuro y
  320/360/375/400/1280 px sin desbordamiento horizontal en editor/diálogo.

Motor real de las integraciones: **PostgreSQL 18.0 nativo temporal**. SQL usa
construcciones disponibles en PostgreSQL 16, pero **16.15 no está comprobado**.
Queda ensayar 0037/0038 en un motor 16.15 aislado y representativo antes de
autorizar la actualización habitual. No se inició Docker ni servicios habituales,
ni se conectó a 5432/5433, Termius o producción. Sin pagos/correos reales.

## Vacío previo identificado: diagnóstico, sin modificación

La nueva operación sí comprueba compromisos. No se amplió el alcance para
corregir la edición genérica de unidades o reasignaciones consideradas sin
historial. Necesitan una tarea separada:

- `PATCH /api/products/:id` → `editProductService` →
  `editProductInTransaction` (`products.service.ts`): el cambio de unidad se
  protege por `productHasHistory`, no por todas las solicitudes abiertas.
- `POST /api/product-families/bundle` → `saveProductBundle`
  (`productBundle.service.ts`) → `editProductInTransaction` para miembros
  existentes: comparte ese riesgo al editar unidad/opciones.
- `assignVariant` (`productFamilies.service.ts`): antes de reasignar familia o
  combinación en un SKU sin historial, necesita comprobación de compromisos,
  además de la unicidad y bloqueos ya existentes.
- `productHasHistory` solo consulta sale_details, online_order_items e
  inventory_movements; no incluye delivery_quote_items. No debe convertirse
  sin diseño en el único guard de compromisos.
- La rama SQL de identidad/reasignación para SKU sin historial también deberá
  revisarse. Refuerzo futuro: verificar cambios efectivos de unidad/combinación,
  solicitudes abiertas y demás compromisos bajo bloqueos compatibles, con
  regresión de SKU sin ENTRY pero con solicitud abierta. No basta ocultar inputs.

## Archivos de esta tarea

Nuevos:

```text
backend/drizzle/0038_controlled_family_option_labels.sql
backend/drizzle/meta/0038_snapshot.json
backend/src/modules/productFamilies/familyOptionLabel.service.ts
backend/tests/familyOptionLabel.unit.mjs
backend/tests/familyOptionLabel.integration.mjs
frontend/src/components/OptionLabelCorrectionDialog.jsx
frontend/src/helpers/optionLabelCorrection.js
frontend/tests/option-label-correction.test.mjs
docs/family-option-label-correction.md
```

Modificados sobre el trabajo recibido:

```text
backend/drizzle/meta/_journal.json
backend/src/modules/productFamilies/productFamilies.routes.ts
backend/tests/commercialHistory.integration.mjs
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
backend/tests/productBundles.integration.mjs
frontend/src/components/ProductBundleEditor.jsx
frontend/tests/family-dimension.test.mjs
frontend/tests/product-name-correction.test.mjs
```

Las aserciones previas solo se ajustaron a 39 migraciones y a la nueva suspensión
del modal; sus casos anteriores se conservan. Archivos previos de marca/UX no
incluidos en esta lista pertenecen al trabajo acumulado, no a esta operación.
