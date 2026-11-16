# tesis-ferreteria — Práctica Profesional II

Sistema desarrollado para Comercializadora FYF SpA, orientado a la gestión
interna de inventario y ventas presenciales. La rama `practica` conserva el
alcance de Práctica Profesional II, independiente de las ampliaciones del
Proyecto de Título: no incluye comercio electrónico, Webpay, promociones,
avisos a clientes, variantes de productos ni despacho.

## Arquitectura y tecnologías

- **Backend**: Node.js, Express y TypeScript.
- **Frontend**: React, Vite y Tailwind CSS.
- **Base de datos**: PostgreSQL, con Drizzle ORM y migraciones SQL.
- **Contenedores**: Docker y Docker Compose. Nginx sirve el frontend compilado
  y redirige `/api/` al backend.

Los archivos `package-lock.json` fijan Express 5.2.1, TypeScript 6.0.3,
Drizzle ORM 0.45.2, React 19.2.5, Vite 8.0.10 y Tailwind CSS 4.3.1.
Los Dockerfiles declaran `node:22-alpine` y `nginx:alpine`; Compose declara
`postgres:16-alpine`. Estas etiquetas no acreditan qué versiones están
ejecutándose en una instalación concreta. Para ejecución local, utilizar
Node.js 22 compatible con las dependencias fijadas y PostgreSQL 16.

## Funcionalidades principales

- Autenticación y autorización para administrador, gerente, cajero y bodeguero.
- Administración de usuarios internos según los permisos de cada rol.
- Gestión de productos y categorías.
- Control de inventario, entradas, ajustes y consulta de movimientos.
- Registro de ventas presenciales, historial y detalle de ventas.
- Solicitudes de devolución parcial o completa, aprobación y rechazo;
  registro directo y reversión de devoluciones según los permisos existentes.
- Reportes de ventas y exportaciones Excel.
- Interfaz adaptable a computadores y dispositivos móviles.

## Ejecutar con Docker Compose

**Utilizar exclusivamente un entorno de demostración independiente de la tesis
y de cualquier instalación real.** Compose tiene nombres de contenedor fijos
(`ferreteria-*`) y publica los puertos 5173, 3000 y, por defecto, 5433.
Cambiar solo el nombre del proyecto Compose no evita esos conflictos.
Comprobar el aislamiento y la disponibilidad de nombres y puertos antes de
iniciar. No reutilizar bases de datos ni volúmenes existentes de la tesis.

Desde la raíz del repositorio, con Docker y Docker Compose disponibles,
preparar un `.env` local con valores de demostración (ver la sección de
variables). No incorporarlo a Git. Validar primero la configuración:

```bash
docker compose -f docker-compose.yml config --quiet
```

Para iniciar con datos de demostración, establecer `SEED_DEMO_DATA=true` en
ese `.env` y ejecutar:

```bash
docker compose -f docker-compose.yml up --build
```

Compose espera a PostgreSQL, ejecuta `migrate`, luego `seed` y finalmente
inicia backend y frontend. La interfaz queda en `http://localhost:5173`, el
backend en `http://localhost:3000` y PostgreSQL en `localhost:5433`, salvo
que se cambie `POSTGRES_HOST_PORT`. Los datos persisten en el volumen
`postgres_data` del proyecto Compose; no borrarlo para reiniciar la aplicación.

Para iniciar **sin cargar el catálogo ni las ventas de demostración**:

```bash
SEED_DEMO_DATA=false docker compose -f docker-compose.yml up --build
```

En PowerShell:

```powershell
$env:SEED_DEMO_DATA = "false"
docker compose -f docker-compose.yml up --build
```

Para volver al modo demostración en esa sesión PowerShell, establecer
`$env:SEED_DEMO_DATA = "true"` antes de iniciar. Desactivar el seed no elimina
datos existentes. Incluso sin seed, el backend crea los cuatro roles y cinco
usuarios iniciales si la tabla de usuarios está vacía; este modo no equivale
a una instalación sin credenciales de demostración.

Usar únicamente `docker-compose.yml` para esta versión. El archivo académico
local no pertenece al alcance de la práctica.

## Ejecutar localmente

1. Disponer de Node.js 22 y npm, y de una instancia PostgreSQL 16 aislada.
   Crear previamente una base vacía y un usuario con permisos sobre ella.
   No apuntar a datos reales ni a la base utilizada por la tesis.
2. Preparar `backend/.env` según el ejemplo siguiente. `DATABASE_URL` es
   necesaria para las migraciones y tiene prioridad para la conexión del
   backend y del seed. La aplicación también puede conectarse mediante las
   variables `DB_*` y `DATABASE` si no se proporciona `DATABASE_URL`.
3. Desde la raíz, instalar las dependencias fijadas, aplicar las migraciones
   a la base aislada e iniciar el backend:

```bash
cd backend
npm ci
npm run db:migrate
# Opcional: cargar datos ficticios exclusivamente en la base aislada
npm run db:seed
npm run dev
```

4. En otra terminal, desde la raíz del repositorio:

```bash
cd frontend
npm ci
npm run dev
```

Abrir la dirección indicada por Vite (normalmente `http://localhost:5173`).
Con `VITE_API_URL=/api`, Vite redirige `/api` a `http://localhost:3000`;
mantener el backend local en el puerto 3000 para esta configuración.
El arranque del backend crea los usuarios iniciales si no existen usuarios.
Estos pasos son instrucciones de instalación: no ejecutarlos sobre una base
compartida con otra versión.

## Datos de demostración

Según `backend/src/db/seed.ts` y `backend/src/config/initDb.ts`, en una base
nueva y migrada se preparan:

- Cuatro roles y cinco usuarios activos: administrador, gerente, dos cajeros
  (mañana y tarde) y bodeguero. El seed agrega un sexto usuario, cajero inactivo.
- Diez categorías y cien productos, con stock normal, bajo, agotado y
  productos desactivados (seis productos agotados y ocho desactivados).
- Entradas iniciales, ajustes y movimientos asociados a ventas,
  cancelaciones y una reactivación.
- Treinta y seis ventas con fechas relativas al día de ejecución y distintos
  medios de pago: tres quedan canceladas y treinta y tres activas, incluida
  una que se cancela y luego se reactiva.

**El seed no crea solicitudes de devolución ni devoluciones parciales o
completas en sus tablas específicas.** Sus cancelaciones y reactivación de
ventas no deben confundirse con solicitudes de devolución. Esas funciones
están disponibles en la aplicación para demostrarlas manualmente con datos
ficticios y los permisos correspondientes.

El seed reutiliza categorías y productos y omite generar ventas cuando
detecta ventas del cajero de tarde. Esa comprobación no garantiza una
idempotencia general sobre bases arbitrarias. Puede actualizar turnos de los
cajeros y preparar estados o stock del catálogo cuando aún no detecta esas
ventas. Ejecutarlo únicamente en una base de demostración aislada, nunca
como mecanismo de mantenimiento de datos reales.

Usuarios activos de demostración, cuando se inicializa una base vacía:

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@gmail.com` | `@dmin.2026` |
| Gerente | `gerente@gmail.com` | `Gerente123.` |
| Cajero de mañana | `cajero@gmail.com` | `Cajero123.` |
| Cajero de tarde | `cajero.tarde@gmail.com` | `Cajero123.` |
| Bodeguero | `bodeguero@gmail.com` | `Bodeguero123.` |

**Son credenciales ficticias y públicas, exclusivamente para demostración.
No utilizarlas en producción ni exponer esta instalación como un servicio real.**

## Variables de entorno

Todos los valores siguientes son ejemplos, no secretos ni credenciales reales.
No publicar archivos `.env` privados.

### Docker Compose: `.env` en la raíz

```dotenv
POSTGRES_USER=practica_demo
POSTGRES_PASSWORD=clave_demo_local
POSTGRES_DB=practica_demo
POSTGRES_HOST_PORT=5433
NODE_ENV=production
PORT=3000
JWT_SECRET=ejemplo_jwt_solo_demostracion
COOKIE_KEY=ejemplo_cookie_solo_demostracion
SEED_DEMO_DATA=true
```

Compose proporciona `DB_HOST=db`, `DB_PORT=5432`, `DB_USERNAME`,
`DB_PASSWORD` y `DATABASE` al backend a partir de estas variables; configura
`DATABASE_URL` para `migrate` y `seed`. `COOKIE_KEY` se conserva porque
Compose lo declara; la autenticación actual firma con `SESSION_SECRET` o,
en su ausencia, `JWT_SECRET`. Mantener `PORT=3000` por los puertos y el proxy
ya configurados. Si se usan caracteres reservados en credenciales de una URL
PostgreSQL, deben codificarse adecuadamente.

### Ejecución local: `backend/.env`

```dotenv
DATABASE_URL=postgresql://practica_demo:clave_demo_local@localhost:5432/practica_demo
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=practica_demo
DB_PASSWORD=clave_demo_local
DATABASE=practica_demo
PORT=3000
JWT_SECRET=ejemplo_jwt_solo_demostracion
COOKIE_KEY=ejemplo_cookie_solo_demostracion
```

Ajustar host y puerto a la instancia aislada realmente utilizada. `db` es el
nombre interno de PostgreSQL en Compose, no el host para ejecución local.

### Frontend: `frontend/.env` (opcional)

```dotenv
VITE_API_URL=/api
```

Es el valor predeterminado del cliente HTTP. Vite incorpora estas variables
al compilar; no deben contener secretos. En Docker, el proxy Nginx mantiene
la API bajo el mismo origen.