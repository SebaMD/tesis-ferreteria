# Editor de variantes: mantenimiento independiente e integrado

## Alcance de esta entrega

Cambios de presentación sobre `feature/tarifas-despacho`, partiendo de
`656e93548d0d7016b2a54f3c6ca48f7fcb709b70`. No cambia el backend, el esquema,
los contratos comerciales ni las migraciones 0033–0036.

- Categoría, nombre de atributo y nombre individual existentes se presentan
  como botones de valor con lápiz, accesibles por teclado. Abren las mismas
  operaciones auditadas; no son inputs de edición comercial genérica.
- Un borrador incompatible continúa bloqueando estas acciones, sin guardarlo
  ni descartarlo. Los conflictos y las recuperaciones conservan sus contratos.
- La ampliación histórica se prepara dentro del editor. Muestra los atributos
  existentes, una tarjeta nueva, opciones y asignación explícita a todos los
  miembros, incluidos los inactivos, además del motivo y la vista previa.
- Se pausa la edición comercial: su formulario permanece montado pero oculto
  y bloqueado. La preparación es un formulario hermano independiente, no un
  formulario anidado ni una parte del payload comercial.
- Solo la confirmación final abre un diálogo. Envía exclusivamente el contrato
  existente de `dimension-additions`, con revisión y clave de operación.
- Cancelar vuelve al editor sin escrituras. Contraer las secciones no desmonta
  controles ni pierde las asignaciones. Cambiar la lista de opciones invalida
  las asignaciones nuevas, como antes, para no desplazar índices por error.
- Un resultado incierto bloquea la salida y permite consultar/reintentar la
  misma operación congelada. No se genera otra clave ni se actualiza en
  silencio la revisión. Un conflicto exige recargar.
- Creación y conversión mantienen su flujo y sus reglas anteriores; el modo
  independiente solo aplica a familias ya persistidas.

## Archivos de esta tarea

Implementación:

- `frontend/src/components/AuditedValueControl.jsx` (nuevo).
- `frontend/src/components/ProductNameCorrectionAction.jsx`.
- `frontend/src/components/ProductBundleEditor.jsx`.
- `frontend/src/components/FamilyDimensionDialog.jsx`.
- `frontend/src/pages/ProductsPage.jsx`.

Pruebas:

- `frontend/tests/audited-editor-ux.test.mjs` (nuevo).
- `frontend/tests/attribute-rename.test.mjs`.
- `frontend/tests/family-dimension.test.mjs`.
- `frontend/tests/product-name-correction.test.mjs`.
- `frontend/tests/variant-review-polish.test.mjs`.

Documentación: este archivo. Los ajustes de pruebas existentes actualizan las
aserciones de estructura de la interfaz retirada; no eliminan casos.

## Diagnóstico: operaciones NO habilitadas

### Marca familiar

`productFamilies.service.ts:160` (`saveFamily`) bloquea cambiar marca con
miembros o historial; `products.service.ts:136` exige coherencia con la familia
y bloquea marca/unidad históricas. La función SQL
`fyf_preserve_product_identity` vigente en 0036 también protege ambas.

Los snapshots conservan la marca anterior, pero no autorizan por sí solos una
actualización. Una corrección descriptiva real es viable mediante otra operación
ADMIN independiente: familia y todos sus miembros, incluidos inactivos, bloqueados
y actualizados en una transacción; revisión, clave idempotente, auditoría antes/
después y excepción SQL limitada y verificable. Requeriría migración específica.
Debe comprobar operaciones comerciales pendientes con el patrón de
`fyf_assert_product_name_ready` (0034), no solo el historial cerrado.

Las promociones verificadas seleccionan productos/categorías
(`promotions.service.ts:116`); no hay que reasignarlas por marca. Esto no elimina
la necesidad de verificar compromisos, versiones y presentaciones pendientes.
Sustituir el fabricante físico no es corregir una errata: corresponde otro SKU.
Complejidad media/alta; no es una mejora meramente visual.

### Opciones: tres operaciones diferentes

1. **Nueva opción/nueva variante:** el guardado actual puede insertar opciones
   nuevas; no reescribe etiquetas existentes. Se mantiene permitido.
2. **Reasignar un SKU sin historial:** `assignVariant`
   (`productFamilies.service.ts:215`) admite cambiar la combinación cuando las
   validaciones lo permiten: opción por dimensión, pertenencia y unicidad de
   `variant_key`; bloqueos y evento de asociación. Con historial, una variante
   asociada no puede cambiar arbitrariamente su combinación. La recuperación
   de un artículo desvinculado histórico queda limitada a su asociación original.
3. **Corregir una etiqueta compartida:** no es reasignar un SKU. El trigger
   `fyf_preserve_used_option` (0027:130) impide cambiar etiqueta/atributo de una
   opción utilizada por cualquier `product_variant_values`, incluso sin ventas.
   Una futura corrección tipográfica tendría que conservar su ID y significado,
   afectar explícitamente a todos los usuarios de esa opción, verificar pendientes
   y usar auditoría/excepción SQL específicas. Los IDs y claves no tendrían que
   cambiar; los snapshots retendrían la etiqueta anterior.

Cambiar una opción histórica de 400 ml a 200 ml o reasignarla a otro SKU altera
la identidad física. Los snapshots no resuelven colisiones de combinaciones ni
el significado del stock actual. Mantener el bloqueo y crear otro SKU.

### Unidad individual

El editor conserva la unidad por artículo y la bloquea con `hasHistory` o para
el original de una conversión. El valor general solo predetermina variantes
nuevas. El backend recibe la unidad individual en `productBundle.service.ts` y
vuelve a validar su modificación en `editProductInTransaction`.

`productHasHistory` (líneas 200–205) considera ventas, pedidos y movimientos;
un ENTRY inicial ya implica historial. Cambiar caja por unidad no se vuelve
seguro por disponer de snapshots: también reinterpretaría stock, mínimos,
reservas, cantidades vendidas y devoluciones. No implementar conversiones
automáticas; crear otro SKU cuando realmente cambia la unidad comercial.
Una notación equivalente podría evaluarse posteriormente como corrección
controlada, nunca como una excepción genérica.

**Observación previa a ampliar permisos:** `productHasHistory` no incluye
`delivery_quote_items`. Un producto sin ventas/pedidos/movimientos puede tener
una solicitud de despacho abierta. En los caminos genéricos inspeccionados de
unidad/asignación no aparece el mismo bloqueo específico de solicitudes que
en las operaciones administrativas recientes. Por tanto, «sin historial» no
equivale a «sin compromisos pendientes». No se demuestra aquí un fallo de pago,
pero es necesario probar y definir ese caso antes de ampliar estas ediciones.
Se documenta sin alterar despacho ni permisos en esta tarea.

## Verificaciones de esta entrega

- Frontend completo: 204/204 pruebas; cuatro casos de estructura nuevos y casos
  anteriores conservados. No son por sí solas pruebas de persistencia.
- Backend unitario: 49/49, sin conexión a una base habitual.
- ESLint frontend, TypeScript backend (`tsc --noEmit`) y builds frontend/backend:
  correctos. Vite mantiene la advertencia de chunk JavaScript mayor de 500 kB.
- Navegador con componentes reales y API totalmente simulada, sin backend ni DB:
  apertura por teclado, Escape y foco de categoría/atributo/nombre; bloqueo por
  borrador; asignación a activo/inactivo; errores, conservación al contraer;
  revisión y cancelación; respuesta 503 incierta y recuperación de una sola
  operación; recarga y foco tras éxito. Creación y conversión conservan controles
  y borrador al volver entre pasos.
- Tema claro/oscuro y anchos 320, 360, 375, 400 y 1280: preparación/confirmación
  familiar sin desbordamiento horizontal; creación/conversión también medidas
  en esos anchos. No se realizaron escrituras SQL ni integraciones PostgreSQL
  en esta tarea de interfaz. La simulación no sustituye una prueba persistente.

## Prioridad antes de la tesis

Primero revisar manualmente esta interfaz y la recuperación en el entorno de
prueba. Si existe una necesidad real, considerar después una corrección de
etiqueta descriptiva o de marca errónea, cada una con autorización y pruebas SQL
aisladas. Posponer reasignaciones históricas y conversiones de unidades.
