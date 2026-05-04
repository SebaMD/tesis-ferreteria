# tesis-ferreteria

Arquitectura Definida inicialmente:

- **Backend**: Node.js, Express
- **Frontend**: React
- **Python**: 3.12
- **Base de datos**: PostgreSQL 18

## Ejecutar docker compose

Para iniciar el contenedor, utiliza el comando:

```bash
docker compose up
```

## Variables de entorno

Para utilizar tanto backend, frontend y la base de datos, se debe utilizar las siguientes variables de entorno:

```sh
# Postgres
POSTGRES_USER = (usuario postgres)
POSTGRES_PASSWORD = (clave postgres)
POSTGRES_DB = (base de datos)

# Backend
DB_HOST = db
DB_PORT = (puerto base de datos)
DB_USERNAME = (usuario postgres)
DB_PASSWORD = (clave postgres)
DATABASE = (base de datos)
PORT = (puerto)
JWT_SECRET = (JWT secret)
COOKIE_KEY = (cookie key)

# Frontend
VITE_API_URL = (url api)
```