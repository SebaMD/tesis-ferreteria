# tesis-ferreteria

Arquitectura Definida inicialmente:

- **Backend**: Node.js, Express
- **Frontend**: React
- **Base de datos**: PostgreSQL 16

## Ejecutar docker compose

Para iniciar el contenedor, utiliza el comando:

```bash
docker compose up --build
```

Docker ejecuta las migraciones antes de iniciar el backend. Por seguridad, los
datos de demostracion no se cargan a menos que se habiliten explicitamente para
una base nueva o descartable.

Para cargar los datos de demostracion de forma intencional:

```bash
SEED_DEMO_DATA=true docker compose up --build
```

En PowerShell se puede usar:

```powershell
$env:SEED_DEMO_DATA="true"
docker compose up --build
```

## Ejecutar el seed localmente

Con PostgreSQL iniciado y las variables de `backend/.env` configuradas:

```bash
cd backend
npm run db:migrate
npm run db:seed
npm run dev
```

El seed prepara roles, usuarios internos, 10 categorias, 100 productos,
movimientos de inventario y ventas recientes. Incluye productos con stock
normal, stock bajo, sin stock y desactivados, ademas de ventas activas y
canceladas. Tambien incluye una venta reactivada para demostrar la trazabilidad
completa de sus movimientos de stock.

Usuarios principales de demostracion:

| Rol | Correo | Contrasena |
| --- | --- | --- |
| Administrador | `admin@gmail.com` | `@dmin.2026` |
| Gerente | `gerente@gmail.com` | `Gerente123.` |
| Cajero manana | `cajero@gmail.com` | `Cajero123.` |
| Cajero tarde | `cajero.tarde@gmail.com` | `Cajero123.` |
| Bodeguero | `bodeguero@gmail.com` | `Bodeguero123.` |

Estas credenciales son solo para demostracion y deben cambiarse en una
instalacion real.

## Variables de entorno

Para utilizar tanto backend, frontend y la base de datos, se debe utilizar las siguientes variables de entorno:

```sh
# Postgres
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

# Frontend
VITE_API_URL=/api
```

## Imágenes persistentes en despliegue

Las rutas guardadas en la base de datos son relativas, por ejemplo
`products/17/imagen.webp`. El backend las publica en `/uploads/products/...`.

Cuando frontend y backend se exponen en orígenes o puertos distintos, el build
del frontend debe recibir la URL absoluta de la API. El origen de esa URL se
utiliza también para resolver los archivos estáticos, sin conservar el segmento
`/api`:

```sh
VITE_API_URL=http://backend.example:1980/api npm run build
```

En ejecuciones directas con PM2 conviene configurar `UPLOADS_ROOT` como ruta
absoluta y persistente. De ese modo la carpeta no depende del directorio desde
el que PM2 haya iniciado Node:

```sh
UPLOADS_ROOT=/ruta/absoluta/tesis-ferreteria/backend/uploads
```

Docker Compose ya mantiene `/app/uploads` en el volumen `product_uploads`.
