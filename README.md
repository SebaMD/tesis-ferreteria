# tesis-ferreteria

Arquitectura Definida inicialmente:

- **Backend**: Node.js, Express
- **Frontend**: React
- **Python**: 3.12
- **Base de datos**: PostgreSQL 16

## Ejecutar docker compose

Para iniciar el contenedor, utiliza el comando:

```bash
docker compose up --build
```

En una base de datos nueva, Docker ejecuta las migraciones y luego carga los
datos de demostracion antes de iniciar el backend. El seed es constante, por
lo que volver a levantar los contenedores no duplica los datos demostrativos.

Para iniciar el sistema sin cargar datos de demostracion:

```bash
SEED_DEMO_DATA=false docker compose up --build
```

En PowerShell se puede usar:

```powershell
$env:SEED_DEMO_DATA="false"
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

# Frontend
VITE_API_URL=/api
```
