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

### Familias y variantes

La migración aditiva `0027_charming_carnage.sql` amplía las 27 anteriores. No
reemplaza productos: cada variante conserva su ID, stock, precio, imágenes y
referencias comerciales. Los productos simples mantienen `family_id` nulo.
Antes de usar este backend, aplicar la nueva migración en la base autorizada.

ADMIN gestiona familias desde **Inventario → Nuevo producto / Editar producto**,
en la sección junto a **Solo presencial**. **Crear nueva familia** reutiliza la
categoría y marca del producto y permite definir atributos y opciones. Elegir
una familia compatible y una opción por atributo; al editar se conserva la
asociación actual. **Administrar familias y atributos** permite revisar sus
miembros sin un panel independiente. El stock se ingresa
mediante las operaciones de inventario habituales. Las combinaciones deben ser
únicas. Los productos con historial conservan su identidad; su primera asociación
requiere un motivo y una variante ya utilizada no puede cambiar de combinación.

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

El catálogo agrupa antes de paginar. **Ver opciones** abre únicamente las
combinaciones existentes mediante botones compactos por atributo. La tarjeta
muestra el precio de variantes comprables online y usa **Desde** solo si difieren.
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

## Ejecución directa y seguridad en producción

Para desplegar el backend mediante PM2, ejecutar `npm ci`, `npm run build` y las migraciones desde `backend`, y luego administrar `dist/server.js` con PM2 usando ese directorio como `cwd`. Configurar `backend/.env` y `UPLOADS_ROOT` persistente antes de iniciar. El repositorio no incluye un archivo de configuración PM2.

En producción, usar `NODE_ENV=production`, HTTPS, SMTP real y Webpay configurado para el ambiente correspondiente. La cookie de dispositivo Invitado es `Secure` en este modo. Los ejemplos usan `development` para la prueba HTTP local; no trasladar esa configuración sin ajustes a un despliegue real.

Se recomienda servir frontend y backend mediante un mismo origen HTTPS. Distintos puertos del mismo host pueden funcionar con la URL absoluta y cookies; dominios distintos están sujetos a las restricciones `SameSite` del navegador y no se garantizan con solo cambiar `VITE_API_URL`. El frontend compilado necesita un servidor estático con fallback de SPA y un proxy configurado según el despliegue.

Los ejemplos contienen únicamente placeholders, no credenciales utilizables en producción. No versionar `.env`, secretos ni evidencias. Las imágenes Docker excluyen `.env` y sus variantes, además de uploads locales. No ejecutar seed en producción. Restringir la exposición de PostgreSQL y del puerto backend mediante red/firewall; Compose publica esos puertos para uso local y no configura TLS ni una política CORS restrictiva.

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
