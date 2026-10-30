# Corrección descriptiva de marca familiar

## Alcance y contrato

ADMIN activo puede corregir la denominación de la misma marca/fabricante en una
familia y **todos sus miembros**, incluidos los inactivos. No sustituye artículos
físicos ni cambia nombre, categoría, unidad, precio, código, stock, mínimos,
imágenes, atributos, opciones, estado o `variant_key`.

- `POST /api/product-families/:id/brand-corrections`.
- `GET /api/product-families/:id/brand-corrections/:operationKey`.
- Cuerpo estricto: `brand`, `reason`, `expectedRevision`, `operationKey`,
  `confirmed: true`. Marca no vacía, hasta 100 caracteres, sin controles, con
  espacios normalizados; motivo 8–500 caracteres. Un nombre equivalente al
  actual por mayúsculas/espacios se rechaza. No permite borrar la marca.
- La recuperación exige el mismo administrador y familia. Reutilizar una clave
  con otro cuerpo se rechaza. Una revisión obsoleta nunca se actualiza para
  forzar el reintento.

La marca no forma parte de claves únicas actuales: varias familias pueden usar
la misma marca. No se introduce una restricción artificial por fabricante. Las
claves existentes de categoría/nombre, código y combinación siguen intactas.
Se verifica la integridad de cada variante y la compatibilidad de promociones,
también para miembros inactivos. Promociones apuntan a productos/categorías,
no a marcas; no se modifican sus definiciones ni descuentos.

## Transacción y excepción SQL

Migración nueva `0037_controlled_family_brand.sql`, posterior a 0036, con journal
y snapshot Drizzle enlazados. No añade columnas ni hace backfill comercial.
Se debe aplicar **antes de usar la operación en otra base**, después de respaldo
y autorización. En esta tarea solo se aplicó a clústeres temporales.
El servicio comprueba además la presencia del guard de 0037 antes de escribir:
si el entorno sigue en 0036, devuelve un conflicto explícito sin modificar datos.

Se reutilizan el lock de precios/promociones, el advisory lock familiar y
`FOR UPDATE` de familia/productos en orden de ID. El servicio comprueba ADMIN
independientemente de la autorización de ruta.

La auditoría usa dos eventos familiares con `product_id=null`, para no fingir
antecedentes de asociación individual:

1. `FAMILY_BRAND_AUTHORIZATION`: estado SQL anterior exacto (familia, productos,
   relaciones, atributos, opciones e imágenes), revisión, transacción, motivo,
   administrador, marca destino, clave y hash del comando.
2. `FAMILY_BRAND_CORRECTION`: referencia a autorización, marca anterior/nueva,
   miembros afectados y revisión posterior; mismo actor, motivo, clave y hash.

La excepción de `fyf_preserve_product_identity` permite exclusivamente cambiar
marca/fecha de actualización en los miembros auditados de esa transacción. La
unidad histórica sigue bloqueada. La función vigente conserva las demás ramas
de nombre, desvinculación y ampliación controlada de dimensiones.

El nuevo guard familiar requiere la autorización exacta para cambiar su marca.
Un constraint trigger diferido exige al COMMIT los dos eventos y el estado final
completo: solo marca/updated_at pueden diferir. Falla si falta un miembro, cambian
otros campos/relaciones/imágenes, falta auditoría o el actor no está autorizado.
Los índices únicos impiden duplicar cada evento de la misma operación. Eventos
nuevos no se pueden actualizar/eliminar; el bloqueo de TRUNCATE ya existe.
No se deshabilita ningún trigger. Como los guards anteriores, no protege frente
a un propietario SQL que altere deliberadamente el esquema.

## Compromisos e historial

Se reutiliza `fyf_assert_product_name_ready` para cada artículo, **sin depender
de `productHasHistory`**. Bloquea solicitudes REQUESTED/ASSIGNED/PROPOSED/APPROVED,
pedidos operativos/reintentables (incluidas reservas), repartos POS pendientes,
devoluciones PENDING y cualquier captura comercial faltante. El mensaje identifica
el impedimento. Una solicitud abierta de un artículo sin ENTRY también bloquea.
No se cierra ni modifica ningún compromiso automáticamente.

Pedidos entregados y cierres manuales CLOSED_UNPAID siguen las reglas existentes.
Los carritos no son reservas ni contratos persistidos: conservan IDs y el checkout
revalida precios/promociones/disponibilidad. La marca descriptiva no cambia sus
importes ni obliga a introducir un nuevo flujo de aceptación. No se afirma que
el fingerprint económico cambie únicamente por corregir la marca.

Los snapshots permanecen inmutables. Ventas/pedidos/movimientos/solicitudes previos
siguen mostrando sus datos capturados, con procedencia ORIGINAL, LEGACY_REFERENCE
o LEGACY_PARTIAL. Las operaciones nuevas capturan la marca corregida. No se
reconstruye la marca original de registros legados ni se recalcula dinero.

## Editor

En familias persistidas ADMIN pulsa la marca con su lápiz. El diálogo muestra
marca anterior/destino, total de variantes, motivo y declaración expresa del mismo
fabricante. El backend no puede demostrar equivalencia semántica entre textos:
la declaración responsable y la auditoría son necesarias, pero no sustituyen
las validaciones técnicas. Otro fabricante físico requiere otro SKU.

El formulario genérico conserva su bloqueo. Un borrador comercial o imágenes
pendientes impiden abrir la corrección; no se guardan ni descartan. Solo se envía
el comando específico. El comando se congela en sessionStorage por ADMIN/familia;
ante red/5xx se consulta o reenvía exactamente, sin cambiar revisión o clave.
Escape/cancelación quedan bloqueados durante incertidumbre. Al confirmar se
recargan familia y revisión y el foco vuelve a la marca.

## Archivos de esta implementación

Nuevos:

```text
backend/drizzle/0037_controlled_family_brand.sql
backend/drizzle/meta/0037_snapshot.json
backend/src/modules/productFamilies/familyBrand.service.ts
backend/tests/familyBrand.unit.mjs
backend/tests/familyBrand.integration.mjs
frontend/src/components/FamilyBrandDialog.jsx
frontend/src/helpers/familyBrand.js
frontend/tests/family-brand.test.mjs
docs/family-brand-correction.md
```

Modificados respecto al índice recibido (los cambios previos staged se conservan):

```text
backend/drizzle/meta/_journal.json
backend/src/modules/productFamilies/productFamilies.routes.ts
backend/tests/commercialHistory.integration.mjs
backend/tests/deliveryQuotes.integration.mjs
backend/tests/deliveryTariffs.integration.mjs
backend/tests/productBundles.integration.mjs
backend/tests/productNameCorrection.integration.mjs
frontend/src/components/ProductBundleEditor.jsx
frontend/tests/family-dimension.test.mjs
frontend/tests/product-name-correction.test.mjs
```

Los ajustes en pruebas previas mantienen sus casos: secuencia de 38 migraciones,
mensaje SQL específico nuevo y suspensión del modal de marca.

## Verificaciones

- Frontend completo: 207/207. Backend unitario: 50/50. ESLint, TypeScript,
  builds frontend/backend y diff checks correctos. Vite mantiene aviso de chunk
  mayor de 500 kB.
- Integraciones aisladas de bundles: migración limpia e incremental 0036→0037,
  legado real anterior a 0033, conversión, nombres/atributos/categoría/dimensiones,
  ventas/devoluciones/PDFs, reservas y Webpay simulado; nueva corrección con/sin
  historial, inactivos, snapshots, SQL no autorizado, autorización incompleta,
  intento de incluir precio, revisión, concurrencia, replay y recuperación.
- Regresiones aisladas de cotizaciones 3A/3B y tarifas históricas aprobadas.
- Los HTTP 500 de auditoría, captura, bundle y pago son fallos deliberados de las
  pruebas de rollback/recuperación, no errores pendientes de producción.
- Navegador con componentes reales y API simulada: borrador bloqueado, motivo
  obligatorio, teclado/Escape/foco, respuesta incierta/recuperación, revisión y
  marca recargadas; temas claro/oscuro, 320/360/375/400/1280 px sin overflow.
- Bases habituales, Termius y referencias de Git sin cambios. No hubo pagos,
  correos reales, seeds, commits ni push.

Los primeros intentos detectaron sintaxis SQL nueva y aserciones antiguas de
interfaz/mensaje, corregidas antes de repetir las suites. El sandbox bloqueó
conexiones locales de prueba; las ejecuciones autorizadas posteriores, fuera del
sandbox y con los mismos destinos aislados, aprobaron.
