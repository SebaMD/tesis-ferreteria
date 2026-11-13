# Correcciones de la demo HTTP y PostgreSQL 13.23 — 2 de noviembre de 2026

## Diagnóstico verificado

1. El frontend llamaba crypto.randomUUID directamente para identidades de borrador
   y claves de operaciones auditadas. En HTTP sobre IP pública la API puede faltar.
   El fallo durante render rompía formularios; en ProductAttributeRenameDialog se
   capturaba antes del POST y se mostraba un mensaje genérico de resultado incierto.
2. La consulta de product-audits usaba `authorization` como alias SQL sin delimitar.
   Reproducido en PostgreSQL 13.23 real con tabla vacía: SQLSTATE 42601,
   `syntax error at or near "authorization"`. El mismo código pasó en 16.15.
   `AS "authorization"` conserva exactamente el DTO y funciona en ambos motores.
3. El caso exacto TN0192→TN0191 aprobó contra backend/PG13.23 con UUID válido:
   auditoría única, replay/recuperación y campos comerciales intactos. Esto apoya
   que el fallo observado de renombrado era de generación de clave en frontend;
   no se accedió a logs privados ni al navegador del servidor para afirmar que no
   existan además otros problemas de despliegue.

## Cambios

- `frontend/src/helpers/createId.js`: UUID v4 centralizado, API nativa o 16 bytes
  criptográficos mediante getRandomValues; fija bits de versión/variante, sin
  Math.random ni timestamps como sustitución de seguridad.
- Todos los consumidores directos (familias, atributos, opciones, dimensiones,
  clasificación simple, borradores, checkout y compatibilidad de solicitudes)
  importan el helper. Las claves congeladas de operaciones pendientes se conservan.
- El marcador de navegación informativa también usa el helper. Sin RNG seguro
  falla hacia Catálogo, no inventa una identidad débil.
- AppErrorBoundary evita una pantalla vacía por errores de render. No reenvía
  comandos ni muestra detalles internos. No sustituye los errores propios de cada
  formulario ni captura errores arbitrarios de handlers o red.
- El diálogo de nombre distingue fallo local previo al envío de una respuesta
  incierta cuando ya había un comando congelado. Los rechazos de backend siguen
  mostrando su motivo; una respuesta incierta mantiene la misma clave recuperable.
- Backend: solo se delimita el alias de lectura; no hay migraciones ni cambios de
  permisos, SQL histórico, pagos, unidades, stock, correos o conciliación.

No se puede demostrar equivalencia física por comparar dos nombres. El caso de
modelo corregido es válido solo si el administrador confirma que fue un error de
registro; si TN0191 representa otro artículo físico, corresponde otro SKU.

## Pruebas

- Frontend 310/310, incluido fallback HTTP sin randomUUID, versión/variante UUID,
  10 000 IDs distintos, ausencia total de RNG seguro, inicialización de filas y
  atributos/opciones y búsqueda de consumidores directos fuera del helper.
- Backend 64/64 unitarios. Build/TypeScript backend, ESLint/build frontend y
  git diff --check aprobados. Advertencia preexistente de bundle >500 kB.
- PostgreSQL 13.23 oficial en contenedor independiente, solo 127.0.0.1:55458:
  43 migraciones en base descartable, auditoría vacía/con registros/cursor,
  corrección exacta de nombre, corrección de marca simple, replay y recuperación,
  auditoría única, revisión obsoleta y devolución pendiente con HTTP 409 explicativo.
  IDs, stock, unidades y snapshots conservados. No se usó la base universitaria.
- Suite amplia productBundles en PostgreSQL 16.15 temporal, puerto 55447, aprobada:
  nombres, marca/categoría, atributos/opciones/dimensiones, roles, auditoría,
  concurrencia, idempotencia, rollback, stock, devoluciones y Webpay simulado.
- Seed en PostgreSQL 16.15 temporal, puerto 55444, aprobada con lecturas de auditoría
  agregadas para la seed académica. No se ejecutó seed en bases habituales.
- Sin nueva comprobación visual de navegador/móvil ni persistencia del servidor.
  El helper se probó con la forma de API que tiene un navegador HTTP.

## Reproducir localmente (Git Bash)

```bash
(
  cd frontend && node --test tests/*.test.mjs && npm run lint && npm run build
)
(
  cd backend && npm run build
)
```

Para la integración 13.23 usar SOLO un contenedor nuevo de pruebas (Docker ya debe
estar encendido de forma segura). No reutilizar ferreteria-db ni publicar 5432/5433:

```bash
docker run --rm -d --name fyf-ux-pg13-check --restart=no \
  -p 127.0.0.1:55458:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:13.23
docker exec fyf-ux-pg13-check pg_isready -U postgres
(
  cd backend &&
  UNIVERSITY_UX_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55458/postgres' \
  node tests/universityUx.integration.mjs
)
docker stop fyf-ux-pg13-check
```

Esperar disponibilidad antes de ejecutar el test. Ese contenedor no debe contener
datos ajenos: la suite valida puerto, nombre y versión y crea su propia base.

## Actualización universitaria posterior, exclusivamente manual

No se realizó despliegue, acceso SSH ni reinicio PM2. No se conocen los nombres/IDs
de procesos ni sus cwd reales; no adivinarlos. Primero hacer commits/publicación
manualmente y respaldar los archivos de despliegue actuales para revertir código.
No hace falta modificar la base para estas correcciones.

En Termius:

```bash
pm2 list
```

Usar `pm2 describe ID_REAL` para identificar backend, frontend, cwd y cómo sirve
el frontend (Vite, preview, servidor estático u otro). No imprimir `pm2 env` ni
compartir tokens o variables secretas. Desde el checkout real, con worktree limpio:

```bash
git status --short
git branch --show-current
git pull --ff-only origin feature/tarifas-despacho
(cd backend && npm ci && npm run build)
(cd frontend && npm ci && npm run build)
```

Conservar la configuración VITE_API_URL que ya utiliza el despliegue. Después de
autorizar el reinicio manual, reiniciar solo los IDs identificados; no usar
`pm2 restart all`, no agregar `--update-env` ni cambiar correo o pagos:

```bash
pm2 restart ID_REAL_BACKEND
# Solo si el modo de servir frontend requiere reiniciar su proceso:
pm2 restart ID_REAL_FRONTEND
```

Si el frontend sirve estáticamente dist, basta publicar la compilación según el
mecanismo real existente; no inventar un nuevo proceso ni una ruta de servidor.
No ejecutar db:seed, db:push, reset, migraciones ni restauraciones para este fix.

Validación manual en computador/celular (recargar sin caché la versión nueva):

- Nuevo producto, familia existente y Guardar categoría→agregar producto abren.
- Corrección de marca simple abre y permite confirmar cuando cumple las reglas.
- Auditoría devuelve 200, con eventos reales o mensaje vacío, y pagina sin repetir.
- Corregir nombre una vez; si quedó una operación pendiente del intento anterior,
  consultar su resultado antes de crear otra. Conservar el motivo/auditoría.
- Comprobar en Network que no hay POST duplicados y en consola que ya no aparece
  randomUUID is not a function. Ante otro 500, revisar `pm2 logs ID_REAL_BACKEND
  --lines 80 --nostream` localmente y compartir solo datos depurados.

HTTP sigue sin cifrar credenciales/tráfico; este arreglo de compatibilidad no es
un sustituto de HTTPS. No se cambia esa infraestructura dentro de esta tarea.
