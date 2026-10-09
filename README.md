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

Para iniciar los servicios:

```bash
docker compose up --build
```

Docker ejecuta las migraciones antes de iniciar el backend.

Los datos de demostración no se cargan automáticamente. Para habilitarlos de forma intencional en una base nueva o descartable:

```bash
SEED_DEMO_DATA=true docker compose up --build
```

En PowerShell:

```powershell
$env:SEED_DEMO_DATA="true"
docker compose up --build
```

## Ejecutar localmente

Con PostgreSQL iniciado y las variables de `backend/.env` configuradas:

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

El `seed` se utiliza únicamente para pruebas y demostraciones locales.

No debe ejecutarse sobre una base de datos productiva que contenga información real.

## Variables de entorno

Ejemplo básico:

```sh
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=una_clave_segura
POSTGRES_DB=ferreteria

# Backend
DB_HOST=db
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=una_clave_segura
DATABASE=ferreteria
PORT=3000

JWT_SECRET=una_clave_jwt_segura
COOKIE_KEY=una_clave_cookie_segura
EMAIL_VERIFICATION_SECRET=otro_secreto_largo_e_independiente
LOGISTICS_QR_SECRET=otro_secreto_largo_e_independiente

# Frontend
VITE_API_URL=/api
```

Las variables adicionales relacionadas con correo electrónico, Webpay y otros servicios deben configurarse de acuerdo con los archivos `.env.example` del proyecto.

Las claves y secretos reales no deben almacenarse en el repositorio.

## Imágenes persistentes en despliegue

Las rutas almacenadas en la base de datos son relativas, por ejemplo:

```text
products/17/imagen.webp
```

El backend publica estos archivos mediante:

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

Docker Compose mantiene `/app/uploads` mediante el volumen persistente configurado para las imágenes.

## Migraciones

Para aplicar las migraciones manualmente:

```bash
cd backend
npm run db:migrate
```

Las migraciones deben ejecutarse antes de iniciar una versión del backend que dependa de nuevos cambios de base de datos.

## Consideraciones del proyecto

El sistema desarrollado corresponde al alcance funcional actual del proyecto de título.

El módulo de predicción de stock contemplado originalmente en la propuesta no forma parte de la versión actual del software.

Entre las mejoras futuras consideradas se encuentran:

- Predicción y sugerencias de reposición basadas en historial de ventas.
- Integración con el sistema administrativo y tributario utilizado actualmente por la ferretería.
- Migración o importación de los productos existentes en el sistema actual.
- Puesta en producción definitiva y adopción operacional en la ferretería.
- Ampliación de los procesos de cambios, devoluciones y reintegros para compras online según las necesidades definidas por la empresa.

## Estado del proyecto

El sistema se encuentra en etapa de finalización y validación para el proyecto de título de Ingeniería de Ejecución en Computación e Informática de la Universidad del Bío-Bío.