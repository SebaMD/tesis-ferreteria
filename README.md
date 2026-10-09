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
SEED_DEMO_DATA=true docker compose up --build
```

En PowerShell:

```powershell
$env:SEED_DEMO_DATA="true"
docker compose up --build
Remove-Item Env:SEED_DEMO_DATA
```

El seed crea cuentas, catálogo, inventario y ventas de demostración, con solicitudes pendientes/rechazadas, devoluciones parciales/completas aprobadas y una devolución revertida. Al repetirlo conserva las ventas ya creadas sin duplicarlas; no convierte datos antiguos de otro seed. No utilizarlo para inicializar una operación real ni ejecutarlo sobre una base productiva. El arranque normal no crea usuarios demo.

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

Para datos de demostración, `npm run db:seed` es una acción manual separada y solo debe ejecutarse contra una base nueva o descartable. No forma parte del inicio normal.

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