# Editor: chips, opciones por variante y diagnósticos pendientes

## Alcance implementado

Solo frontend; no cambios de backend, esquema, permisos, inventario o pagos.

- `AttributeSuggestionDialog.jsx`: chips Color, Medida, Tamaño, Material,
  Presentación, Longitud, Capacidad, Tipo y Otro. Botones reales con aria-pressed,
  check, selección/deselección y AppModal existente para foco/Escape. Compara
  nombres con espacios normalizados y minúsculas, incluidos chips y personalizado.
  Otro vacío crea un campo por completar; no inventa el nombre ni opciones.
- Creación/conversión: agrega varios atributos al borrador sin POST y sin generar
  combinaciones. Conserva claves, selecciones, archivos y los demás campos.
- Familia persistida: **una dimensión por operación**. El contrato real
  `validateFamilyDimension`/`familyDimensionOperation` recibe un único `name`,
  `options` y `assignments`. SQL 0036 autoriza un atributo y sus opciones. No existe
  ampliación plural atómica; no se encadenan peticiones para simularla.
- `FamilyDimensionDialog.jsx` conserva el controlador de revisión, payload,
  sessionStorage, clave/revisión congeladas, recuperación y confirmación. Sus
  controles se proyectan mediante portales a tarjetas/filas del editor, sin
  desmontar el formulario comercial ni anidar formularios. La dimensión nueva
  se completa en todas las filas, incluidas las inactivas, y tiene motivo propio.
  Los datos comerciales ajenos quedan bloqueados hasta aplicar/cancelar.
- Atributos ya no muestra la lista de «Etiqueta compartida». Cada opción
  persistida seleccionada en una variante tiene un lápiz hermano del control,
  no un botón anidado ni una reasignación. Abre el diálogo auditado existente;
  advierte de todos sus miembros. Borradores incompatibles siguen bloqueándolo.
- Unidad individual, Stock mínimo y Stock actual/inicial usan tres columnas
  iguales en escritorio y se apilan en móvil. El lápiz de unidad es indicación
  del campo normal editable, no una operación histórica nueva. Historial y
  original convertido permanecen bloqueados. Los compromisos se validan en el
  backend existente al guardar; no se presume elegibilidad por ausencia de historia.

Para ampliar varias dimensiones en familias persistidas haría falta diseñar un
comando plural con una sola revisión/clave, asignación de cada dimensión a todos
los miembros, locks únicos, auditoría global anterior/posterior, reconstrucción
única de variant_key y COMMIT diferido verificando exactamente todas las altas.
La autorización SQL actual singular debe ampliarse con migración específica y
pruebas de rollback de la segunda/última dimensión. No implementado aquí.

## Auditoría: unidad general (sin implementación masiva)

Referencias: `productBundleForm.js` (`newBundleRow`, `bundleDraft`,
`resumeBundleDraft`, `bundlePayload`), `ProductBundleEditor.jsx` (`addVariant`) y
`productBundle.service.ts` (`validateProductBundle`, `saveProductBundle`).

La familia no persiste una unidad general: `product_families` no tiene ese campo.
Al abrir se toma la primera unidad de sus miembros como predeterminado para
nuevos artículos. Cada producto mantiene su unidad real en products.unit_measure.
En el borrador, una fila sin unitMeasure explícito usa `row.unitMeasure ??
draft.unitMeasure`; las filas con unidad explícita conservan su valor. La carga
de productos existentes siempre trae unidades explícitas. `resumeBundleDraft`
también trata especialmente la primera fila al volver del formulario simple.

Esto explica un caso equivalente al informado: si las primeras filas tienen
unidad explícita y la última recién añadida no, cambiar el valor general solo
se refleja en esa última. Se reprodujo esa regla en prueba automatizada; no es
una orden de propagación masiva ni una propiedad común persistida.

Propuesta:

1. En creación, acción explícita «Aplicar a las variantes del borrador», con
   vista previa y exclusión/confirmación de unidades particulares. Solo frontend;
   la creación conjunta ya es transaccional. No hacer asignación silenciosa.
2. Edición sin historia: selección explícita de SKU elegibles y vista previa de
   unidad anterior/destino. El bundle ya puede actualizar unidades concretas en
   una transacción, con revisión/idempotencia y rollback si cualquiera falla.
   La elegibilidad definitiva es backend bajo locks, no una lista calculada por UI.
   Si se exige motivo específico/auditoría independiente, se necesita contrato
   dedicado; el motivo genérico BUNDLE_SAVE no basta para prometerlo.
3. Con historia: no usar el bundle genérico. Requiere el diseño descrito abajo.

No cambia cantidades ni factores; no hace falta una migración para un mero
predeterminado de creación. Persistir un predeterminado familiar sí sería una
decisión y cambio de esquema adicional, no implementado.

## Auditoría: Historial de cambios (sin implementar)

Fuente principal: `product_family_events` en `schema/productVariantValues.ts`:
id, product_id/family_id opcionales, user_id, previous/next JSON, reason, created_at.
También contiene eventos de productos simples (`SIMPLE_SAVE`,
`PRODUCT_NAME_CORRECTION`), no solo familias.

Operaciones verificadas: BUNDLE_SAVE, CONVERT_SIMPLE, asociaciones/desvinculación,
ARCHIVE/REACTIVATE, ATTRIBUTE_RENAME, PRODUCT_NAME_CORRECTION,
FAMILY_CATEGORY_CHANGE, FAMILY_BRAND_AUTHORIZATION/CORRECTION,
DIMENSION_ADD_AUTHORIZATION/ADD, OPTION_LABEL_AUTHORIZATION/CORRECTION.

No es una auditoría universal: el PATCH comercial genérico de producto, cambios
directos de imágenes/estado y saveFamily no siempre insertan un evento completo
anterior/posterior con motivo/actor. No deben inventarse registros faltantes.
`inventory_movements` es historial de existencias; `commercial_identity_snapshots`
conserva identidad histórica, no registra por sí solo quién editó el catálogo.

Los guards SQL 0034–0038 protegen específicamente correcciones de nombre,
categoría, marca, dimensiones y etiquetas. El TRUNCATE del historial está
bloqueado. No se encontró un guard global de UPDATE/DELETE que haga inmutables
por igual todos los tipos antiguos (por ejemplo ATTRIBUTE_RENAME/BUNDLE_SAVE).
No se debe anunciar inmutabilidad universal antes de revisar ese alcance.

No hay endpoint paginado de auditorías administrativas: existen GET de resultado
por clave de operación, no un listado. `getFamilyForManagement` solo informa
metadatos/booleanos de gestión, no un historial completo.

Diseño propuesto: GET `/api/product-audits` exclusivo ADMIN en ruta y servicio,
cursor estable `(created_at,id)` descendente, limit acotado (por ejemplo 25–100),
filtros producto/familia/actor/tipo/fecha. DTO con campos permitidos: ID, fecha,
actor ID y nombre visible, sujeto, operación, diferencias descriptivas y motivo.
No retornar previous/next crudos, imágenes/rutas internas, hashes de comando,
claves de recuperación o datos personales ajenos. Emparejar autorización/resultado
como una acción visible. Un evento confirmado no demuestra que todos los intentos
fallidos se hayan registrado: los rollback no dejan auditoría de éxito.

UI futura: botón a la derecha de los filtros de Historial de inventario, solo
ADMIN, diálogo de consulta paginada separado de los movimientos. Requiere nuevo
contrato backend. Puede usar la tabla actual; índices de consulta y protección
append-only general necesitarían evaluar una migración posterior.

## Auditoría: productos simples y correcciones de unidad

Referencias: `products.service.ts` (`editProductInTransaction`),
`productNameCorrection.service.ts`, `familyBrand.service.ts`,
`familyCategory.service.ts` y `fyf_preserve_product_identity` vigente en 0037.

| Operación | Estado real y trabajo necesario |
|---|---|
| Marca simple sin historia/compromisos | PATCH normal permite cambio, con guard de compromisos, pero sin operación independiente auditada. |
| Marca simple con ENTRY/ventas/pedidos | Backend/SQL la bloquean. La excepción 0037 es para miembros familiares, no productos simples. Necesita comando ADMIN propio, evento anterior/posterior, revisión/idempotencia, checks de compromisos y excepción SQL exacta con verificación al COMMIT. |
| Categoría simple | PATCH puede reclasificar incluso con historia cerrada; no tiene auditoría independiente equivalente a la familiar. Verifica unicidad, familia si existe, compromisos y promociones. Para hacerlo auditado: endpoint propio y bloqueo del camino genérico correspondiente. La validación de promociones genérica omite inactivos; el futuro comando debe revisar también su reactivación, como hace el familiar. |
| Unidad sin historia/compromisos | Ya editable; se conservó. No implica autorización semántica para transformar cajas en unidades; no hay factores ni conversiones. |
| Unidad con ENTRY, ventas o pedidos | Continúa bloqueada en servicio/SQL aunque tenga snapshots. Aplica a simples y variantes. |
| Solicitud abierta sin ENTRY | El guard de compromisos adicional también bloquea; productHasHistory solo no alcanza. |

Snapshots originales y referencias de legado preservan el texto/unidad capturada,
pero no demuestran equivalencia física de dos denominaciones ni convierten stock,
reservas, cantidades devueltas o comprobantes. `helpers/units.js` solo pluraliza
para mostrar; no es un catálogo de equivalencias autorizado por backend.

Una corrección estricta Unid.→Unidad podría diseñarse con aliases canónicos
cerrados, validados en backend/SQL, auditoría y motivo, sin cambios de cantidad,
bloqueo de compromisos y snapshots completos. Para unidades arbitrarias no hay
garantía automática: mantener bloqueo. Caja→Unidad o Paquete→Unidad no es alias;
requiere otro SKU/procedimiento de inventario, no excepción textual. Cambiar
400 ml→200 ml es presentación física y tampoco es corrección de unidad.

Orden recomendado antes de la tesis: primero consulta administrativa paginada y
categoría simple auditada; después marca simple con excepción estrecha. Dejar
unidades históricas y equivalencias arbitrarias para una etapa diseñada y probada
específicamente. No se implementó ninguna de estas operaciones aquí.

## Pruebas y límites de esta entrega

Frontend 214 pruebas (anteriores conservadas, aserciones de disposición actualizadas
y tres nuevas pruebas de chips/asignaciones/unidades explícitas frente a heredadas).
Backend unitario 51. ESLint, TypeScript, builds y diff checks.

Navegador con API real y PostgreSQL 16.15 aislado localhost:55461: familia DEMO D
#37, SKU #135 activo y #136 inactivo. Se incorporó Tamaño con Mediano/Grande desde
los campos inline y se corrigió la etiqueta compartida 400 ml→400ml desde la
variante. Después se restauró el formato 400 ml desde el mismo diálogo y se
comprobó el retorno del foco al lápiz de la fila original. No se tocaron A/B/C
ni registros originales. Persistencia no simulada.

Revisión visual: chips múltiples en creación, selección/deselección, duplicado
Color/Otro, Otro vacío con campo posterior editable, retorno con Escape, campos
de opciones inmediatos sin valores inventados; tema claro/oscuro y anchos
320/360/375/400/1280 sin overflow horizontal en las vistas comprobadas. Inventario
en escritorio midió tres columnas equivalentes (~344 px cada una).

La recuperación incierta mantiene el mismo controlador/contrato y sus pruebas
previas; no se indujo una pérdida de red nueva desde navegador en este cambio.
La conversión conserva las pruebas automatizadas existentes; no se repitió una
conversión manual completa. No se ejecutaron migraciones ni conexiones a bases
habituales, no se cambiaron .env ni servicios Docker.

## Archivos de esta entrega

- Componentes: ProductBundleEditor.jsx y FamilyDimensionDialog.jsx modificados;
  AttributeSuggestionDialog.jsx nuevo.
- Helper nuevo: helpers/attributeSuggestions.js.
- Prueba nueva: tests/attribute-chips.test.mjs.
- Pruebas existentes adaptadas sin quitar casos: audited-editor-ux,
  option-label-correction, conversion-flow-ux, product-form-consistency,
  variant-presentation-a, variant-review-polish, part-a-redesign,
  product-name-correction y unified-editing.
- Este documento. Los cambios backend y migraciones 0037/0038 del estado de
  trabajo pertenecían a tareas anteriores, no se modificaron aquí.

Verificación final: 214/214 frontend, 51/51 backend unitarias, ESLint y builds
aprobados; TypeScript backend sin errores. El build frontend conserva el aviso
de chunk mayor a 500 kB, sin fallo. Comprobación final aislada: registros
originales preservados, journal de 39 entradas coherente, cero imágenes faltantes,
snapshots de DEMO D intactos y bloqueo de compromiso pendiente comprobado.
