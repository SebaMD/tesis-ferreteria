# Sistema web para Ferretería FYF

Sistema web desarrollado para apoyar la gestión de la ferretería Comercializadora FYF SpA.

La aplicación integra la gestión de productos e inventario, ventas presenciales, comercio electrónico, pagos mediante Webpay, devoluciones, pedidos, logística y reportes dentro de una misma plataforma.

## Tecnologías utilizadas

### Backend
- Node.js
- Express
- TypeScript
- Drizzle ORM
- JWT
- bcrypt

### Frontend
- React
- Vite
- Tailwind CSS
- Lucide React

### Base de datos
- PostgreSQL 16

### Infraestructura
- Docker
- Docker Compose
- Ejecución directa del backend mediante PM2.

## Funcionalidades principales

### Gestión de usuarios y seguridad
- Inicio y cierre de sesión.
- Roles y permisos.
- Verificación de correo electrónico.
- Recuperación de contraseña.
- Gestión de perfil de cliente.
- Desactivación y reactivación de cuentas.

### Roles internos
- Administrador.
- Gerente.
- Cajero.
- Bodeguero.

Además, el sistema contempla clientes registrados y compras realizadas como invitado.

### Productos e inventario
- Gestión de productos y categorías.
- Marca y código de barras.
- Imágenes de productos.
- Activación y desactivación de productos.
- Productos disponibles únicamente para venta presencial.
- Registro de entradas de inventario.
- Ajustes administrativos.
- Historial de movimientos.
- Consulta de stock.
- Protección del stock reservado por pedidos online.

### Ventas presenciales
- Registro de ventas por cajero.
- Búsqueda y selección de productos.
- Distintos métodos de pago.
- Cálculo de vuelto para pagos en efectivo.
- Descuento automático de inventario.
- Despacho opcional de ventas presenciales.
- Consulta del historial y detalle de ventas.

### Devoluciones
- Solicitudes de devolución realizadas por cajeros.
- Revisión por administrador o gerente.
- Aprobación y rechazo de solicitudes.
- Devoluciones parciales.
- Devoluciones directas realizadas por administrador.
- Reversión de devoluciones aprobadas.
- Reintegro y descuento automático de stock según corresponda.
- Trazabilidad de las cantidades devueltas.

### Comercio electrónico
- Catálogo público.
- Búsqueda y filtrado de productos.
- Favoritos para clientes registrados.
- Carrito de compras.
- Compra directa mediante "Comprar ahora".
- Compras como cliente registrado o invitado.
- Retiro en tienda o despacho a domicilio.
- Integración con Webpay Plus.
- Reserva temporal de stock durante el proceso de pago.
- Reintentos de pago mediante nuevas transacciones Webpay.
- Historial y seguimiento de pedidos.
- Comprobantes de compra.

Los pedidos realizados como invitado se mantienen asociados de forma segura al dispositivo autorizado.

### Logística
- Preparación de pedidos.
- Retiro en tienda.
- Gestión de repartos.
- Asignación de bodeguero.
- Código QR seguro para operaciones logísticas.
- Consulta protegida de datos de entrega.
- Registro del receptor.
- Fotografía comprobante de entrega.
- Supervisión logística para administrador y gerente.

### Reportes y estadísticas
- Reportes de ventas por fecha o rango.
- Montos originales, devueltos y netos.
- Resumen por cajero.
- Resumen por método de pago.
- Exportación de información.
- Estadísticas gerenciales.

### Promociones y avisos
- Gestión de promociones para comercio electrónico.
- Descuentos porcentuales.
- Promociones 2x1.
- Gestión de avisos y contenido visible en el sitio público.

## Ejecutar con Docker Compose

Requisitos: Docker con Compose y su motor iniciado. Desde la raíz, copiar `.env.example` a `.env` **solo si este último no existe** y reemplazar los placeholders por valores propios. No sobrescribir una configuración existente.

Para validar la configuración e iniciar los servicios:

```bash
docker compose config --quiet
docker compose up --build
```

El frontend queda disponible en `http://localhost:5173`, el backend en `http://localhost:3000` y PostgreSQL en el puerto local `5433`, salvo cambios en `.env`. Nginx envía `/api` y `/uploads` al backend, por lo que el navegador utiliza el mismo origen.

Orden de inicio: PostgreSQL saludable → migraciones → etapa de seed opcional → backend saludable → frontend. Las migraciones se ejecutan con Drizzle Kit; el seed se omite por defecto.

`PORT` modifica únicamente el puerto publicado del backend. Dentro de Docker, PostgreSQL utiliza `db:5432` y el backend `backend:3000`; no se debe usar `localhost` para comunicar estos contenedores. Si cambia el puerto público, ajustar también `WEBPAY_RETURN_URL`.

Los datos de demostración no se cargan automáticamente. Para habilitarlos de forma intencional en una base nueva o descartable:

```bash
POSTGRES_DB=fyf_demo_catalog NODE_ENV=development SEED_DEMO_DATA=true docker compose up --build
```

En PowerShell:

```powershell
$env:SEED_DEMO_DATA="true"
$env:POSTGRES_DB="fyf_demo_catalog"
$env:NODE_ENV="development"
docker compose up --build
Remove-Item Env:SEED_DEMO_DATA
```

Usar esas opciones únicamente en un entorno Compose nuevo y descartable, con su volumen PostgreSQL propio; cambiar POSTGRES_DB no cambia el contenido de un volumen existente. No borrar volúmenes existentes para probar el catálogo. Para aislarlo sin reutilizar Compose, utilizar el procedimiento local de abajo.

El seed crea **96 productos en ocho categorías**, basados en referencias de proveedores, con precios, stock y disponibilidad **ficticios y exclusivos de desarrollo**. Mantiene seis usuarios internos demo, 36 ventas, solicitudes pendientes/rechazadas, devoluciones parciales/completas aprobadas y una devolución revertida. No publica imágenes de proveedores ni utiliza correo/Webpay.

Exige `SEED_DEMO_DATA=true`, `MAIL_ENABLED=false`, ambientes no productivos y una base llamada `fyf_demo_*` o `fyf_seed_demo_*`. Rechaza bases no vacías sin su marca de inicialización. La marca se guarda como comentario de la base, dentro de la misma transacción (no crea tablas ni migraciones). Una segunda ejecución es un no-op, incluso después de operar manualmente en la demo: no reinicia stock ni actualiza usuarios, productos o ventas. No convierte ni elimina datos de la seed anterior. El arranque normal no crea usuarios demo.

El [catálogo para revisión](docs/seed-catalog-review/README.md) contiene la distribución, procedencia y las imágenes pendientes de autorización. Los 96 artículos siguen siendo productos independientes; no hay familias ni cantidades fraccionarias.

La inicialización excepcional de `ferreteria` en `localhost:5433` requiere una autorización efímera de un solo uso en la base y en el proceso de carga. No se guarda en `.env`, no habilita borrados y queda consumida al terminar. Una demo local ya inicializada solo admite el mismo no-op; volver a ejecutar la seed nunca reinicia los datos.

## Ejecutar localmente

Requisitos: Node.js 22.12 o superior de la serie 22 y PostgreSQL. Copiar `backend/.env.example` a `backend/.env` únicamente si no existe, configurar la conexión y los secretos, e iniciar PostgreSQL. Ejecutar desde el directorio indicado para que Drizzle cargue ese `.env`.

```bash
cd backend
npm ci
npm run db:migrate
npm run dev
```

En otra terminal:

```bash
cd frontend
npm ci
npm run dev
```

Para datos de demostración, `npm run db:seed` es una acción manual separada y protegida; no forma parte del inicio normal.

### Ver el catálogo nuevo en una base PostgreSQL aislada (PowerShell)

Este ejemplo crea un clúster local temporal nuevo, sin usar la base normal. Requiere PostgreSQL instalado; ajustar únicamente la ruta de sus binarios. Si el puerto 55444 está ocupado, elegir otro libre en **todos** los comandos. No apuntar a un directorio de datos existente.

Desde `backend`:

```powershell
$pgBin = "C:/Program Files/PostgreSQL/18/bin"
$demoRoot = Join-Path $env:TEMP ("fyf-demo-" + [guid]::NewGuid().ToString("N"))
& "$pgBin/initdb.exe" -D "$demoRoot/data" -U postgres -A trust -E UTF8 --locale=C
if ($LASTEXITCODE -ne 0) { throw "No se creó el clúster demo" }
& "$pgBin/pg_ctl.exe" -D "$demoRoot/data" -l "$demoRoot/postgres.log" -o "-h 127.0.0.1 -p 55444" -w start
if ($LASTEXITCODE -ne 0) { throw "No se inició el clúster demo" }
& "$pgBin/createdb.exe" -h 127.0.0.1 -p 55444 -U postgres fyf_demo_catalog
if ($LASTEXITCODE -ne 0) { throw "No se creó la base demo" }
$env:DATABASE_URL="postgresql://postgres@127.0.0.1:55444/fyf_demo_catalog"
$env:NODE_ENV="development"
$env:WEBPAY_ENVIRONMENT="integration"
$env:MAIL_ENABLED="false"
$env:SEED_DEMO_DATA="true"
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw "Migración demo fallida" }
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw "Carga demo fallida" }
Remove-Item Env:SEED_DEMO_DATA
npm run dev
```

Los secretos de desarrollo deben estar configurados como indica `.env.example`.
No ejecutar simultáneamente otro backend en el puerto 3000. En otra terminal,
iniciar el frontend con `npm run dev` desde `frontend` y abrir
`http://localhost:5173/catalog`. Se muestran 94 artículos activos; los otros dos
permiten probar la consulta administrativa de productos desactivados. Hay seis
artículos sin stock y ocho configurados como Solo presencial, todo ficticio.
Las credenciales demo siguen definidas en `backend/src/config/initDb.ts`.

`MAIL_ENABLED=false` impide completar flujos que requieren códigos por correo;
este ejemplo no pretende probar verificación/checkout Invitado ni cobros reales.
Al terminar, detener backend/frontend con Ctrl+C y detener **solo** este clúster:
`& "$pgBin/pg_ctl.exe" -D "$demoRoot/data" -m fast -w stop` en la consola que
conserva `$demoRoot`. No usar estos datos, cuentas ni autenticación local trust
en producción.

## Variables de entorno

Las listas y comentarios completos están en [.env.example](.env.example) para Compose, [backend/.env.example](backend/.env.example) para ejecución directa y [frontend/.env.example](frontend/.env.example) para Vite. El `.env` raíz configura Compose; no sustituye al `backend/.env` local.

- `DATABASE_URL` tiene prioridad en el backend y es obligatoria para Drizzle Kit. Solo el backend admite la alternativa `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` y `DATABASE`. Compose utiliza esta alternativa para el backend y construye `DATABASE_URL` para migraciones y seed.
- Codificar caracteres reservados al escribir credenciales en una URL PostgreSQL. Como Compose construye la URL directamente, sus credenciales deben ser compatibles con una URI; una contraseña aleatoria hexadecimal evita este problema.
- Configurar un `JWT_SECRET` propio y secretos independientes para correo y QR. `EMAIL_VERIFICATION_SECRET` y `LOGISTICS_QR_SECRET` requieren al menos 32 caracteres; el segundo es necesario para QR y etiquetas de preparación de despachos. Nunca exponerlos mediante variables `VITE_*`.
- Webpay utiliza las credenciales oficiales del SDK en `integration`. En `production` exige código de comercio, API key y URLs públicas HTTPS de retorno/backend y frontend. No usar credenciales productivas para pruebas.
- Sin `MAIL_ENABLED=true` y SMTP válido no se pueden enviar códigos o enlaces de verificación, recuperación y reactivación, incluida la verificación de invitados. Los correos informativos de compras y logística se omiten sin cancelar operaciones realizadas. Configurar `SMTP_HOST`, `MAIL_FROM` y, cuando el proveedor lo requiera, `SMTP_USER` y `SMTP_PASS` juntos. Compose no incluye Mailpit.
- `VITE_API_URL` es la única variable del frontend y es pública: `/api` para el proxy local o mismo origen; URL absoluta terminada en `/api` si el backend usa otro origen. Cambiarla requiere un nuevo build, también en Docker.

## Archivos persistentes en despliegue

Las rutas almacenadas en la base de datos son relativas, por ejemplo:

```text
products/17/imagen.webp
```

El backend publica imágenes de productos mediante:

```text
/uploads/products/...
```

Cuando frontend y backend se encuentran en distintos orígenes o puertos, el build del frontend debe utilizar una URL absoluta para la API:

```bash
VITE_API_URL=http://backend.example:1980/api npm run build
```

El origen de esta URL también se utiliza para resolver correctamente los archivos estáticos.

En ejecuciones directas mediante PM2 se recomienda configurar `UPLOADS_ROOT` con una ruta absoluta y persistente:

```bash
UPLOADS_ROOT=/ruta/absoluta/tesis-ferreteria/backend/uploads
```

El mismo directorio contiene imágenes de presentación/avisos (`customer-notices`) y evidencias de entrega (`deliveries`). Estas últimas son privadas y se entregan mediante endpoints autorizados, no mediante un directorio estático público.

Docker Compose fija `UPLOADS_ROOT=/app/uploads` y conserva todos estos archivos en el volumen `product_uploads`. El nombre es histórico, pero sigue siendo válido y no se renombra para evitar perder acceso a datos existentes. PostgreSQL persiste en `postgres_data`. Recrear contenedores conserva los volúmenes; `docker compose down -v` los elimina. Respaldar tanto la base como los archivos.

Nginx acepta solicitudes de hasta 6 MiB para permitir imágenes de 5 MiB y el envoltorio multipart; los formatos y el límite por archivo siguen siendo responsabilidad del backend.

## Migraciones

### Despacho online: Nivel A y tarifas históricas

La migración aditiva `0030_delivery_tariffs.sql` crea la configuración versionada
de despacho y agrega el desglose histórico a los pedidos online. No cambia los
totales existentes: sus campos nuevos quedan en `NULL`, identificados como
«sin cargo de despacho registrado», sin asignarles una política DEMO.

Después de aplicar la migración **en una base autorizada**, ADMIN y MANAGER pueden abrir
**Pedidos y repartos → Configurar despacho**. El retiro en tienda sigue disponible
sin costo de despacho. Los nuevos despachos requieren una cotización manual
aprobada: el Nivel A todavía no implementa su solicitud, aprobación ni aceptación.
Por eso el backend bloquea nuevas cotizaciones y pedidos DELIVERY antes de crear
reservas o iniciar Webpay. El comprador puede elegir retiro explícitamente.
Sin política guardada, tampoco se permiten nuevas compras online.

La consulta y modificación administrativa están restringidas a ADMIN y MANAGER;
los demás roles e invitados no tienen acceso a estos endpoints. Cada guardado
crea una revisión inmutable con el usuario responsable y controla los cambios
concurrentes. Los pedidos y sus reintentos conservan
los importes originales aunque cambie la configuración. Los campos de tarifa fija
y umbral automático de las revisiones anteriores se conservan como información
heredada, no como un flete aprobado para compras nuevas. La antigua tarifa DEMO
de $3.000 no se cobra automáticamente. Las ventas presenciales no cambian.

Las nuevas revisiones mantienen siempre retiro disponible sin cargo y no exigen
compra mínima. Si una política antigua tiene otras reglas, el formulario informa
la transición antes de confirmar una nueva revisión; nunca se reescribe el historial.
El catálogo deriva un aviso de cotización manual o suspensión desde la política
vigente, sin crear avisos manuales ni promociones. Se actualiza al recuperar el
foco y cada 30 segundos mientras la página está visible. Nunca promete gratuidad
automática. El formulario identifica las opciones heredadas y no permite activar
un cobro fijo como sustituto de la cotización pendiente.

FYF informó cobertura en la Región del Biobío, un recorrido sin cobro hasta 5 km
previa confirmación y una referencia mínima de $1.000 por kilómetro de ida para
distancias mayores. Son referencias informativas: no hay fórmula confirmada para
aplicarlas a toda la distancia o solo al excedente. El valor también depende del
vehículo, carga y viajes. La referencia de $500.000 para solicitar gratuidad exige
coordinación, entrega no urgente y aprobación de FYF; no aplica un descuento ni
registra un flete de $0 automáticamente. Su configuración comercial requiere el
Nivel B, aún pendiente; no se reutiliza el umbral automático antiguo.

Checkout, historial, PDF, correo y ficha administrativa comparten el desglose:
subtotal original + despacho previo al beneficio − descuentos de productos
− beneficio de despacho = total final. La tarifa previa se obtiene de la revisión
histórica del pedido, nunca de la política actual. Los registros sin desglose
conservan su identificación histórica y no se les inventan cargos.
Un cambio de cotización exige revisar y aceptar el nuevo resumen y volver a pulsar
el pago; no se reenvía una compra automáticamente. Los errores de conexión ofrecen
«Reintentar cálculo» y la suspensión permite elegir retiro explícitamente.

El checkout informa la cobertura regional, sin geocodificación ni cálculo de
distancias. El bloqueo DELIVERY impide confundir una dirección ingresada con un
destino o flete aprobado; ampliar el flujo persistido queda para el Nivel B.
En checkout se muestra «Despacho: Por cotizar», sin un total final cobrable. La
nota breve enlaza a `/delivery-conditions`, también disponible desde el pie de
página. Esta página reúne las referencias informadas por FYF y explica que la
gratuidad no es automática. El enlace de Google Maps permanece pendiente hasta
confirmar la dirección oficial completa y verificar que el resultado corresponde
al local (`FYF_CONTACT.confirmed.address` continúa en `false`). No se usan
coordenadas ni una dirección de referencia no confirmada.
Las estadísticas separan productos,
despacho y total cobrado neto de devoluciones presenciales.

Prueba aislada, sin seed ni conexiones a 5432/5433 (requiere binarios PostgreSQL
en `PG_TEST_BIN` o la instalación local PostgreSQL 18):

```powershell
cd backend
npm run build
node scripts/test-delivery-tariffs.mjs
```

Esta prueba crea un clúster desechable en 55446 y verifica el bloqueo vigente,
retiro, permisos y revisiones. Las tarifas FLAT/FREE_THRESHOLD se prueban mediante
pedidos históricos sintéticos en esa base aislada, nunca habilitando el antiguo
checkout automático. Comprueba reintentos, importes, documentos y stock. No
requiere una migración de cotización manual ni utiliza bases habituales.

### Familias y variantes

La migración aditiva `0027_charming_carnage.sql` amplía las 27 anteriores. No
reemplaza productos: cada variante conserva su ID, stock, precio, imágenes y
referencias comerciales. Los productos simples mantienen `family_id` nulo.
Antes de usar este backend, aplicar la nueva migración en la base autorizada.

ADMIN utiliza **Inventario → Nuevo producto / Editar producto**. **Nuevo producto**
abre por defecto el modo simple y permite elegir **Producto con variantes** en la
misma ventana; el botón inferior **Agregar variantes** también cambia de modo
conservando los datos ingresados. El editor muestra datos generales, atributos y
variantes desplegables, además de una vista previa sin guardar.

Una familia nueva exige al menos dos variantes configuradas. Con una sola se
ofrece agregar otra o continuar explícitamente como simple. Al volver a simple se
conservan los datos, stock inicial e imágenes de la primera variante; los atributos
y demás filas no se guardan, pero su borrador permanece disponible en esa ventana.
La transacción conjunta también admite ese artículo simple sin crear una familia,
reutilizando idempotencia, auditoría, imágenes y ENTRY. No se crea un producto
general vendible adicional ni se repite el stock inicial al reintentar.

La regla de dos variantes no impide editar familias históricas con un solo miembro.
La acción **Convertir en producto con variantes** transforma el mismo modal de
edición. Conserva el ID, stock e historial del original y exige motivo y confirmación.
Volver al producto no guarda ni elimina el borrador de conversión. Los cambios de
identidad pendientes deben guardarse o descartarse explícitamente antes de convertir.

En familias existentes, el editor reúne datos generales, atributos contraíbles y
variantes inicialmente contraídas. Cada artículo tiene su propia descripción,
unidad (bloqueada si tiene historial), precio, código, mínimo e imágenes. Ordenar,
quitar o elegir la foto principal modifica el borrador; el guardado conjunto aplica
esos cambios transaccionalmente, con revisión e idempotencia. Los archivos retirados
se eliminan solo tras confirmar COMMIT y comprobar que ningún producto los referencia.
La activación/desactivación sigue siendo una operación explícita con confirmación,
permitida solo sin cambios pendientes. No hay un segundo editor individual.
Los cambios ordinarios se guardan directamente; la conversión y la retirada de
fotografías guardadas requieren confirmación explícita.

Nombre y descripción generales son metadatos de la familia; no se propagan a los
artículos. La unidad general se propone solo para nuevas variantes. Marca y categoría
siguen bloqueadas mientras existan variantes/historial. Agregar una dimensión a una
familia existente también permanece bloqueado: cambiaría `variant_key`, protegido
por el trigger histórico. Permitirlo exige diseñar y autorizar una reclasificación
auditada y compatible con asociaciones históricas; no se relajan esas reglas aquí.

La edición conjunta conserva las restricciones históricas y el control de versión.
Cada variante se activa o desactiva individualmente con confirmación, sin perder
su asociación ni generar nuevas entradas. La interfaz antigua de gestión familiar
ya no forma parte del flujo habitual; sus endpoints ADMIN de mantenimiento
excepcional conservan validaciones, auditoría y protecciones contra borrado físico.

Para asociar el catálogo demo ya existente, sin ejecutar seed ni reiniciar datos,
después de autorizar y aplicar la migración, desde `backend` en PowerShell:

```powershell
$env:ASSOCIATE_DEMO_FAMILIES = 'true'
try { npm run db:associate-families } finally { Remove-Item Env:ASSOCIATE_DEMO_FAMILIES }
```

Este comando exige PostgreSQL local, puerto explícito distinto de 5432, entorno
no productivo y la marca de la seed revisada. Verifica nombre, categoría, marca,
unidad y referencia documental antes de asociar. Crea 19 familias para 71 de los
96 artículos y mantiene 25 simples. Su repetición es un no-op; no modifica precios,
existencias, imágenes ni operaciones. La seed de una base nueva incluye estas
asociaciones; una seed ya completada sigue sin reescribir datos.

El catálogo filtra productos concretos y agrupa antes de paginar. La tarjeta permite
seleccionar una combinación existente y agregar únicamente esa variante. El detalle
mantiene botones compactos por atributo. Precio, imagen y disponibilidad corresponden
al producto seleccionado, descontando visualmente lo que ya está en su carrito.
El carrito, el POS y Webpay utilizan siempre el ID del
producto concreto. Las promociones 2x1 no se combinan entre variantes.

Pruebas aisladas en Windows: compilar backend y ejecutar
`node scripts/test-product-families.mjs` desde `backend`. Requiere PostgreSQL 18
en su ruta habitual (o `PG_TEST_BIN`) y puertos 55440/55441/55444/55445 libres.
Crea y elimina solo su propio clúster temporal, sin utilizar 5432/5433. Webpay y
SMTP están simulados localmente. No publica las imágenes de proveedores.

Para aplicar las migraciones manualmente:

```bash
cd backend
npm run db:migrate
```

Las migraciones deben ejecutarse antes de iniciar una versión del backend que dependa de nuevos cambios de base de datos.

Este comando aplica los archivos existentes de `backend/drizzle`; no genera nuevas migraciones ni ejecuta seed. No sustituirlo por `db:push` en una base productiva.

## Cotizaciones manuales de despacho — Etapas 3A y 3B

La migración aditiva `0031_manual_delivery_quotes` crea solicitudes, artículos,
revisiones de flete, eventos y tokens de invitados. Agrega configuración manual a
las revisiones de política y referencias opcionales en pedidos. **No activa una
política, modifica pedidos anteriores ni recalcula importes.** El backend compilado
con este esquema requiere la migración antes de iniciarse; no apuntarlo a una base
sin actualizar. `0032_delivery_quote_checkout` amplía estados/eventos y el guard de
aceptación para la Etapa 3B, sin tablas duplicadas ni backfill. Su aplicación a una
base habitual requiere autorización separada; ambas se probaron solo en clústeres temporales.

El checkout de despacho registra una solicitud, nunca un pedido ni un cobro inmediato.
La interfaz permite seguimiento, evaluación, aprobación y aceptación del resumen
antes del pago único productos + flete. Retiro conserva el flujo habitual.
Una solicitud o aprobación no reserva stock ni crea movimientos o pedidos. Los precios
y promociones se consultan con el calculador existente: son una estimación, no un
importe pagadero ni una garantía de existencias.

Estados: `REQUESTED`, `ASSIGNED`, `PROPOSED`, `APPROVED`, `REJECTED`, `CANCELLED`,
`EXPIRED`, `ORDER_CREATED` y `CLOSED_UNPAID`. Propuestas y aprobaciones son revisiones independientes e inmutables;
corregir revoca la vigencia de la aprobación sin borrar su historial. Las decisiones
generan eventos append-only. Cada comando exige `expectedVersion` y `commandKey`
(clave aleatoria estable de 20–80 caracteres para sus reintentos). Crear exige
`requestKey`; repetir la misma clave con datos diferentes devuelve conflicto.

### API autenticada

Rutas bajo `/api/delivery-quotes`, con JWT y comprobación de rol en servicio y ruta:

| Operación | Ruta | Permiso |
| --- | --- | --- |
| Configuración manual | `GET /settings`, `PUT /settings` | ADMIN, MANAGER |
| Encargados habilitados | `GET /assignees` | ADMIN, MANAGER |
| Crear solicitud | `POST /` | CLIENT con correo verificado |
| Listar / consultar | `GET /`, `GET /:id` | ADMIN/MANAGER; CLIENT propio; WAREHOUSE asignado |
| Asignar | `POST /:id/assign` | ADMIN, MANAGER |
| Proponer flete | `POST /:id/proposals` | ADMIN/MANAGER o WAREHOUSE asignado |
| Aprobar | `POST /:id/approve` | ADMIN, MANAGER, decisión explícita separada |
| Corregir / rechazar | `POST /:id/request-changes`, `POST /:id/reject` | ADMIN, MANAGER |
| Cancelar | `POST /:id/cancel` | ADMIN/MANAGER o CLIENT propietario |
| Revocar acceso invitado | `POST /:id/revoke-guest-access` | ADMIN, MANAGER |
| Resumen final actualizado | `GET /:id/summary` | Propietario o ADMIN/MANAGER |
| Aceptar y crear pedido/pago | `POST /:id/checkout` | CLIENT propietario |
| Pedido asociado | `GET /:id/order` | Propietario o ADMIN/MANAGER |
| Continuar/reintentar pedido | `POST /:id/payment` | CLIENT propietario |
| Cerrar pedido impago terminal | `POST /:id/close-unpaid` | Propietario o ADMIN/MANAGER |

CASHIER no recibe permisos. WAREHOUSE recibe destino, contacto del receptor y carga
solo cuando está asignado, sin datos de cuenta ni estimación comercial de productos.
CLIENT/Invitado no reciben notas internas ni propuestas pendientes. El listado usa
cursor `beforeId` y devuelve como máximo 100 solicitudes por página.

`POST /` recibe `requestKey`, `items: [{productId, quantity}]`, `recipientName`,
`phone`, `address`, `commune`, `reference` opcional y `nonUrgent`. No recibe importes.
La comuna admite destinos fuera de Santa Juana y se informa `coverageVerified:false`:
FYF debe confirmar manualmente la cobertura del Biobío, sin geocodificación ni GPS.
Cambiar productos, cantidades o destino requiere una solicitud nueva.

Una propuesta recibe `commandKey`, `expectedVersion`, `amount` entero CLP, `reason`,
`vehicle`, `distanceKm`, `trips`, `routeConfirmed`, `coordinated`, `notes` (motivo
interno obligatorio) y `customerNote` opcional. Motivos:

- `PAID_FREIGHT`: monto positivo aprobado manualmente, sin fórmula automática.
- `FREE_RADIUS`: monto cero y recorrido de hasta 5 km confirmado manualmente.
- `FREE_CONDITIONAL`: monto cero, beneficio habilitado, neto de productos después
  de descuentos igual o superior al umbral, coordinación y entrega no urgente.
- `FREE_EXCEPTION`: excepción comercial gratuita expresamente aprobada y motivada.

Aprobar exige además `proposalRevisionId` y `reason`; nunca aprueba una revisión
obsoleta o de otra solicitud. No hay aprobación implícita por quien propone.

### Activación y configuración explícitas

`PUT /settings` exige `expectedRevisionId`, `deliveryEnabled` y
`conditionalFreeEnabled`. Permite `conditionalFreeFrom` (valor inicial propuesto
500000 CLP), `approvalValidityHours` (24, rango 1–168) y `evaluationValidityHours`
(72 desde creación, rango 1–720). Estos plazos son provisionales para el sistema,
no condiciones comerciales confirmadas por FYF. El umbral nuevo es independiente
del antiguo `freeShippingFrom` automático. Cada guardado crea una revisión con
responsable; no modifica la revisión DEMO. Tras activar modo manual, el endpoint
heredado de tarifas no puede reemplazarlo silenciosamente.

La migración no efectúa esta activación. ADMIN/MANAGER la confirman desde
Configurar despacho en Pedidos y repartos. Deshabilitar despacho
bloquea solicitudes y propuestas/aprobaciones nuevas, pero no toca pedidos pagados
ni callbacks o conciliaciones existentes. Los vencimientos se registran al consultar,
listar o actuar; no hay tarea programada en esta etapa.

### Invitados

Rutas bajo `/api/online-orders/guest/delivery-quotes`:

- `POST /verification/request` y `/verification/verify`: PIN para creación.
- `POST /`: cuerpo anterior más `guestName`, `guestEmail`, `challengeId` verificado.
- `POST /access/request` y `/access/verify`: PIN independiente para recuperar acceso.
- `POST /:id/recover-access`: `challengeId` específico verificado.
- `GET /:id` y `POST /:id/cancel`: token de esa solicitud.
- `GET /:id/summary`, `GET /:id/order`, `POST /:id/checkout`, `POST /:id/payment`
  y `POST /:id/close-unpaid`: las mismas reglas comerciales, con token propietario.

Creación y PIN usan `X-Guest-Session`; consulta/cancelación usan
`X-Delivery-Quote-Token`. El token se devuelve solo al crearlo/recuperarlo, se guarda
como hash y no se coloca en URLs ni logs. El frontend guarda el acceso en
`sessionStorage`, separado de los tokens de pedidos; cerrada la pestaña, se recupera
con PIN específico e ID. El pedido final utiliza las cookies y tokens de seguimiento
ya existentes. Vigencia de token: 168 horas por defecto,
ajustable con `DELIVERY_QUOTE_TOKEN_HOURS` (1–720); máximo 10 tokens no revocados por
solicitud. Conocer ID o correo no concede acceso. La verificación se consume dentro
de la transacción de creación; un rollback no la consume.

Límites: PIN con controles existentes; solicitudes limitadas en PostgreSQL por
propietario (10/hora y 5 activas), acceso invitado 90 intentos/minuto por IP en cada
proceso. En despliegues multiproceso será necesario un límite compartido/proxy.
No enviar tokens en enlaces compartidos ni usar estas rutas desde un origen CORS
no autorizado.

### Aceptación, reservas y recuperación 3B

El resumen vincula solicitud/versión, destino, revisión aprobada, artículos,
cantidades, precios, promociones y desglose mediante firma comercial y
`quoteFingerprint`. `POST /:id/checkout` recibe ambos, `expectedVersion`,
`commandKey` y `accepted:true`; no acepta precios ni flete del navegador.
`QUOTE_CHANGED` bloquea el pago, devuelve un conflicto y exige revisar/aceptar otra vez;
la interfaz no reenvía automáticamente la compra.

Aceptación, pedido, artículos, reserva temporal e intento de pago se registran en una
transacción. Se reutiliza la creación de pedidos existente y la clave determinista
`delivery-quote-ID`, junto con la restricción UNIQUE por solicitud. Webpay se inicia
después del COMMIT. Un error de inicio conserva el pedido impago y libera la reserva;
se recupera ese pedido, nunca se crea otro. Los reintentos mantienen el importe histórico
y verifican autorización vigente y habilitación del despacho antes de crear un intento.
Continuar una sesión ya iniciada o conciliar su callback no invalida un pago por un
vencimiento posterior. Se conservan los controles existentes de callbacks duplicados,
reservas vencidas y pagos ambiguos.

Una solicitud aprobada usa el plazo desde aprobación, no el vencimiento de evaluación
pendiente. Generado el pedido, la solicitud no vuelve a aprobarse ni modifica importes.
Si el pedido impago ya no puede reintentarse, `close-unpaid` requiere motivo y versión:
solo cierra pedidos terminales sin intentos abiertos/ambiguos. Conserva el pedido y su
importe y bloquea futuros intentos; una nueva evaluación requiere solicitud nueva.
No se cierra silenciosamente una transacción pendiente de conciliación.

El pedido manual copia directamente el destino inmutable aprobado, incluyendo comunas
fuera de Santa Juana. El checkout genérico sigue sin aceptar despachos sin cotización;
no se relajan sus validaciones antiguas ni se modifican direcciones históricas.

### Validación y revisión manual aislada

Desde `backend`: `npm run build` y `node scripts/test-delivery-quotes.mjs`. El lanzador
crea y elimina exclusivamente su clúster PostgreSQL temporal en puerto 55448, valida
su directorio antes de operar y aplica migraciones solo allí. Comprueba instalación
limpia, actualización desde 31 migraciones y repetición; SMTP y Webpay son dobles de
prueba sin conexiones reales. Incluye fallos deliberados de auditoría y envío para
verificar rollback. No usa seed ni las bases 5432/5433.

Para una revisión visual **solo sobre datos desechables**, desde `backend`:

```powershell
npm run build
$env:DELIVERY_QUOTES_VISUAL = '1'
try { node scripts/test-delivery-quotes.mjs } finally { Remove-Item Env:DELIVERY_QUOTES_VISUAL -ErrorAction SilentlyContinue }
```

Esperar `QA_READY`. El backend temporal escucha en `127.0.0.1:5193`; el correo
simulado se consulta en `/__qa/mail` y Webpay es un doble local, sin contacto externo.
Las rutas `/__qa/*` pertenecen exclusivamente al lanzador de pruebas, no a la aplicación.
En otra terminal, desde `frontend`:

```powershell
$env:VITE_API_URL = 'http://127.0.0.1:5193/api'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5192 --strictPort
```

Abrir `http://127.0.0.1:5192`. Usuarios **ficticios y temporales**:
`client21@example.test`, `admin@example.test`, `manager@example.test`,
`warehouse@example.test`; contraseña de prueba `QaOnly-Quotes-3B!`.
No corresponden a usuarios ni credenciales habituales. Algunas solicitudes ya están
preparadas por las pruebas; se pueden crear otras desde un carrito y revisar su ID.
CLIENT/Invitado acceden desde Mis compras → Solicitudes de despacho; los trabajadores,
desde Pedidos y repartos → Solicitudes de despacho. Primero asignar, luego proponer,
aprobar expresamente, volver como comprador y consultar/aceptar el total.

Al terminar, `Invoke-RestMethod -Method Post http://127.0.0.1:5193/__qa/stop` cierra
el backend y elimina exclusivamente su clúster temporal. Detener Vite con Ctrl+C.
No ejecutar estos lanzadores ni migraciones contra 5432/5433. No trasladar cuentas,
dobles, rutas QA o contraseñas de pruebas a producción. CORS y límites compartidos
de acceso deben revisarse antes del despliegue. Las notificaciones de nuevas
solicitudes/aprobaciones no están implementadas: su seguimiento es manual.

## Ejecución directa y seguridad en producción

Para desplegar el backend mediante PM2, ejecutar `npm ci`, `npm run build` y las migraciones desde `backend`, y luego administrar `dist/server.js` con PM2 usando ese directorio como `cwd`. Configurar `backend/.env` y `UPLOADS_ROOT` persistente antes de iniciar. El repositorio no incluye un archivo de configuración PM2.

En producción, usar `NODE_ENV=production`, HTTPS, SMTP real y Webpay configurado para el ambiente correspondiente. La cookie de dispositivo Invitado es `Secure` en este modo. Los ejemplos usan `development` para la prueba HTTP local; no trasladar esa configuración sin ajustes a un despliegue real.

Se recomienda servir frontend y backend mediante un mismo origen HTTPS. Distintos puertos del mismo host pueden funcionar con la URL absoluta y cookies; dominios distintos están sujetos a las restricciones `SameSite` del navegador y no se garantizan con solo cambiar `VITE_API_URL`. El frontend compilado necesita un servidor estático con fallback de SPA y un proxy configurado según el despliegue.

Los ejemplos contienen únicamente placeholders, no credenciales utilizables en producción. No versionar `.env`, secretos ni evidencias. Las imágenes Docker excluyen `.env` y sus variantes, además de uploads locales. No ejecutar seed en producción. Restringir la exposición de PostgreSQL y del puerto backend mediante red/firewall; Compose publica esos puertos para uso local y no configura TLS ni una política CORS restrictiva.

El backend refleja actualmente el origen CORS y permite credenciales. Antes de
producción debe definirse una lista explícita de orígenes autorizados del despliegue;
confiar en cualquier origen es un riesgo de exposición entre sitios. CORS no
sustituye JWT, permisos ni controles de acceso. Esta limpieza documenta el riesgo,
pero no modifica la configuración sin conocer esos orígenes.

## Consideraciones del proyecto

El sistema desarrollado corresponde al alcance funcional actual del proyecto de título.

El módulo de predicción de stock contemplado originalmente en la propuesta no
fue implementado en la versión actual del software y se considera como una
mejora futura del proyecto.

Entre las mejoras futuras consideradas se encuentran:

- Predicción y sugerencias de reposición basadas en historial de ventas.
- Integración con el sistema administrativo y tributario utilizado actualmente por la ferretería.
- Migración o importación de los productos existentes en el sistema actual.
- Puesta en producción definitiva y adopción operacional en la ferretería.
- Ampliación de los procesos de cambios, devoluciones y reintegros para compras online según las necesidades definidas por la empresa.

## Estado del proyecto

El sistema se encuentra en etapa de finalización y validación para el proyecto
de título de Ingeniería de Ejecución en Computación e Informática de la
Universidad del Bío-Bío.
