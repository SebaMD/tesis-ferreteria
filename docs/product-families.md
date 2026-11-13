# Familias y variantes de productos

## Modelo y compatibilidad

Cada artículo vendible sigue en `products`. La familia no contiene precio
cobrable, código de barras ni stock. Ventas, pedidos, reservas, devoluciones,
favoritos, imágenes y promociones siguen referenciando el producto concreto.
Las cantidades continúan siendo enteras.

La nueva migración **0027** se agrega a las 27 anteriores, sin modificarlas:

| Tabla nueva | Finalidad |
| --- | --- |
| `product_families` | Nombre, descripción, categoría, marca y fechas generales |
| `family_attributes` | Atributos configurables de cada familia y orden |
| `family_attribute_options` | Opciones de cada atributo y orden |
| `product_variant_values` | Una opción por atributo para cada producto |
| `product_family_events` | Producto, familia, administrador, clasificación anterior/nueva, motivo y fecha |

`products` agrega `family_id` y `variant_key`, ambos opcionales para conservar
productos simples. La combinación canónica tiene unicidad por familia. FKs
compuestas impiden opciones de otro atributo/familia; validaciones diferidas
comprueban que la combinación esté completa. Categoría y marca deben coincidir
con la familia. Las operaciones de asociación son transaccionales.

Un producto con historial conserva nombre, marca y unidad. Su primera asociación
requiere un motivo; una variante con historial no puede cambiar de familia o
combinación. La desvinculación administrativa es una excepción controlada: ADMIN
elige **Producto simple**, indica un motivo y confirma. Usa un endpoint separado
que conserva todas las demás columnas del producto, su ID y sus operaciones;
los otros cambios del formulario quedan pendientes. La auditoría guarda familia,
atributos/opciones de origen, motivo, usuario y transacción. La migración aditiva
**0028** ajusta solo el trigger de identidad: exige esa auditoría en la misma
transacción y no permite cambiar otros campos durante la desvinculación.
Un producto desvinculado con historial solo puede recuperar su clasificación
original, no aprovechar esta excepción para cambiar de combinación.
Las opciones utilizadas no se renombran para representar otro
artículo. Se pueden agregar opciones nuevas sin crear automáticamente productos.

## Administración y catálogo

Solo ADMIN administra familias, respetando los permisos actuales de productos.
En **Inventario → Nuevo producto / Editar producto**, completar categoría y marca.
Junto a **Solo presencial**, elegir producto simple o una familia compatible.
**Crear nueva familia** utiliza esos mismos datos y permite definir atributos y
opciones (una por línea). Seleccionar una opción por atributo de la variante.
Al editar se mantienen la familia y los valores actuales sin volver a elegirlos.
Mantener un nombre comercial que identifique el artículo.
El ingreso de existencias y las imágenes usan los mecanismos habituales.

**Administrar familias y atributos**, dentro del formulario, permite consultar
miembros en un panel inicialmente cerrado, identificar el producto **Actual**
y abrir la edición de los demás. La desactivación se
mantiene por producto. Con miembros asociados, no se cambia la estructura de
atributos ni su identidad; para otra línea se crea otra familia.

La eliminación física de familias no está disponible en la interfaz ni en la API
(`DELETE` responde 405). Solo ADMIN puede **archivar** una familia sin productos,
previa confirmación, aunque tenga auditoría; con miembros activos o inactivos,
primero debe usar la desvinculación segura. No hay archivado automático.
La **reactivación** conserva ID, atributos, opciones e historial y no recupera
asociaciones anteriores. Ambas acciones usan la misma exclusión transaccional
que las asociaciones y comprueban la revisión esperada para evitar carreras.

La migración aditiva **0029** añade `product_families.archived_at` (NULL significa
activa) y permite eventos de familia sin `product_id`, exigiendo en ese caso
`family_id`. Se reutiliza `product_family_events` para registrar actor, estado
anterior/nuevo, motivo y fecha. No se crean tablas ni se cambian eventos previos.
La migración no archiva familias existentes ni cambia productos.

El administrador tiene un único filtro de estado: **En uso** (predeterminado),
**Sin productos** y **Archivadas**, sin superposición entre vistas. Las archivadas
se consultan sin editar sus definiciones hasta reactivarlas. El selector del
producto ofrece todas las familias activas compatibles, incluso nuevas o vacías
con historial, sin casillas adicionales. Las definiciones con historial de
productos siguen protegidas aunque no queden miembros.

El catálogo filtra SKUs y agrupa antes de contar, ordenar y paginar. Una familia
tiene una tarjeta **Ver opciones**, no un botón que compre la familia. Su precio
visible considera solamente variantes comprables online; **Desde** se utiliza
si esos precios difieren. El detalle usa botones compactos por atributo, sin
duplicar bloques de precio o stock; selecciona combinaciones existentes y muestra sus imágenes,
precio/promoción y disponibilidad. Las variantes inactivas se identifican sin
habilitar compra; las agotadas o solo presenciales tampoco se agregan al carrito.
Los enlaces antiguos a productos concretos siguen funcionando.

El carrito identifica artículos por `product.id`; dos variantes generan líneas
distintas. El POS y el lector de código de barras resuelven ese mismo ID. El 2x1
sigue calculándose por producto, nunca agrupando colores/medidas de una familia.

## Asociación del catálogo de referencia

El manifiesto `backend/src/db/demo/families.ts` define **19 familias, 71 variantes
y 25 productos simples**, manteniendo los 96 artículos y 8 categorías:

| Familia | Variantes | Atributos |
| --- | ---: | --- |
| Spray Rex uso general 400 ml | 10 | Color/acabado |
| Spray Rex fluorescente 400 ml | 2 | Color |
| Brocha Lizcal profesional 5/8 | 6 | Ancho |
| Brocha EMTOP línea EPBH 702 | 4 | Ancho |
| Rodillo Lizcal fibra 6 mm | 4 | Ancho |
| Rodillo Lizcal 100% lana | 3 | Ancho |
| Espátula plástica lisa Lizcal | 2 | Ancho |
| Tarugo tipo Fischer, bolsa 1000 | 4 | Diámetro |
| Tarugo de golpe, ciento | 4 | Medida |
| Clavo concreto pólvora, caja 100 | 3 | Medida |
| Amarras UYUS blancas, ciento | 3 | Medida |
| Malla Rashel 80% sombra | 9 | Color y dimensiones |
| Disco flap Ferretools 115 | 4 | Grano |
| Alicate universal EMTOP EPLRC | 2 | Medida |
| Combo EMTOP EHAMSH | 2 | Peso |
| Martillo EMTOP EHAMCH | 3 | Peso |
| Martillo Truper mango fibra | 2 | Peso |
| Lubricante Truper WT-400 | 2 | Presentación |
| Lubricante Rex 40 | 2 | Presentación |

No se agrupan líneas diferentes únicamente por compartir categoría. No se crean
nuevos colores, medidas o combinaciones. Los precios, existencias y ajustes de
disponibilidad del catálogo siguen siendo ficticios para demostración.

### Habilitación en una base existente

**Requiere autorización previa del responsable de la base.** Detener backend,
verificar la conexión exacta, aplicar `npm run db:migrate` desde `backend` y luego
ejecutar `npm run db:associate-families` con `ASSOCIATE_DEMO_FAMILIES=true` solamente
durante ese comando. No ejecutar reset, `db:push` ni seed para hacer asociaciones.

El comando exige base demo marcada, entorno no productivo, servidor local y
puerto explícito diferente de 5432. Identifica cada artículo por su manifiesto,
nombre, categoría, marca, unidad y descripción de origen. Si no puede identificarlo
sin ambigüedad, revierte toda la asociación. No modifica IDs, precios, stock,
fechas de productos, imágenes ni operaciones. Repetirlo no genera escrituras.

Las migraciones son aditivas; el backend actual requiere 0027, 0028 y 0029 antes
de iniciar. La base habitual `ferreteria` en `localhost:5433` no debe modificarse
sin la confirmación expresamente solicitada. No acceder a la instancia 5432.

## Verificación

`backend/scripts/test-product-families.mjs` crea un clúster PostgreSQL descartable
en `backend/tmp/fyf-seed-audit-*`, comprueba la actualización desde las 27
migraciones y ejecuta las integraciones de familias, seed, paginación, promociones,
logística y verificación/checkout. Webpay es simulado y SMTP usa un servidor falso
en loopback. El clúster se detiene y elimina al terminar.

Las regresiones nuevas cubren combinaciones canónicas/duplicadas/ajenas,
restricciones SQL, permisos, edición, historial, asociación idempotente, búsqueda
por atributos, paginación agrupada, ofertas, POS/barcode, devolución/reversión,
stock/reservas por variante, snapshots, 2x1, cancelación/reintento y pago
idempotente; también Invitado, dispositivo ajeno y Solo presencial.

El frontend incorpora pruebas de selección de combinaciones reales, estados,
controles accesibles, compra únicamente del SKU y compatibilidad con el tema
manual del proyecto. Se verificó además en navegador la creación de familia y
variante, carrito con dos variantes, inactivas/solo presenciales, escritorio,
móvil 320–400 px y administración en tema oscuro.

Para probar la administración de estados, sin ejecutar seed, usar
`FAMILY_TEST_SCOPE=administration` al ejecutar el mismo lanzador. Crea su propio clúster
temporal en 55444, aplica las migraciones existentes en una base nueva y comprueba
permisos, archivo/reactivación de familias vacías, productos inactivos, auditoría
JSON, rechazo de DELETE y carreras en ambos órdenes. No accede a la base habitual
ni a 5432/5433.
También prueba la desvinculación con/sin historial, confirmaciones simultáneas,
auditoría completa, protección de identidad y conservación exacta de ventas,
devoluciones, reservas, snapshots, pagos simulados y promociones, sin ejecutar seed.

Las imágenes de proveedores pendientes continúan privadas: este cambio no las
publica ni las asigna a otras medidas o colores. No se implementan cantidades
fraccionarias ni una gestión separada de stock por familia.

## Archivos de esta funcionalidad

- `backend/drizzle/0027_charming_carnage.sql`, `meta/0027_snapshot.json`, `meta/_journal.json`.
- `backend/src/db/schema/{productFamilies,productVariantValues,products,index}.ts`.
- `backend/src/modules/productFamilies/{productFamilies.service,productFamilies.routes}.ts`.
- `backend/src/modules/products/{products.validation,products.repository,products.service,products.controller}.ts`.
- `backend/src/modules/catalog/{catalog.repository,catalog.controller,catalog.routes}.ts` y `backend/src/modules/index.ts`.
- `backend/src/db/demo/families.ts`, `backend/src/db/associateDemoFamilies.ts`, `backend/src/db/seed.ts` y `backend/package.json`.
- `backend/tests/{productFamilies.unit,productFamilies.integration,seed.integration}.mjs` y `backend/scripts/test-product-families.mjs`.
- `frontend/src/components/{ProductFamilyCard,ProductFamilyManager,ProductCard}.jsx`.
- `frontend/src/pages/{ProductFamilyPage,ProductDetailPage,CatalogPage,ProductsPage}.jsx` y `frontend/src/App.jsx`.
- `frontend/src/services/{productFamilies.service,catalog.service}.js`, `frontend/src/helpers/productVariants.js` y `frontend/tests/product-variants.test.mjs`.
- `README.md` y este documento.

Los demás cambios pendientes anteriores del working tree se conservan.
