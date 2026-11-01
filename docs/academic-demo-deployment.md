# Demostración universitaria: seed e imágenes

Solo para el servidor universitario autorizado. Este procedimiento NO se ha
ejecutado en el servidor. No cambia `.env`, no crea otra base permanente, no
restablece datos y no sirve para infraestructura comercial.

## Estado de las fotografías

96 SKU, 8 categorías, 19 familias/71 variantes y 25 simples. Las 13 imágenes
locales siguen PENDING_AUTHORIZATION/publish=false; los 83 restantes no tienen
imagen en el manifiesto. El importador no descarga nada. Los candidatos oficiales
están en `docs/seed-catalog-review/image-candidates.json`, no son autorizaciones.
No se encontraron los PDF originales ni las fotos de páginas en el workspace.
Proporcionar CATALOGO COM. CADENA.pdf, CATALOGO LYS 2025.pdf,
Cotizacion_COT-2026-0934.pdf y las fotografías originales en una carpeta privada
fuera del repositorio (por ejemplo `~/FYF-demo-assets/source-documents`).

Para publicar una fotografía, preparar fuera del repositorio un paquete privado
con `extracted-images.json` y los archivos relativos indicados por `file`.
Conservar productKey, documento/página, hash y correspondencia exacta; añadir
solo después de obtener permiso real:

```json
{
  "rightsStatus": "AUTHORIZED",
  "publish": true,
  "authorization": {
    "scope": "academic-web",
    "reference": "Referencia verificable al permiso escrito y titular"
  }
}
```

Esto describe campos de una entrada existente, no un manifiesto completo. El
permiso debe cubrir la publicación web académica, no solo la descarga personal.
Nunca asignar AUTHORIZED a los archivos actuales para hacer pasar la importación.
Una aprobación puede cubrir un lote de fotos, pero cada SKU y envase se revisa.
Los textos y códigos del producto se contrastan contra el catálogo fuente y su
descripción íntegra en BD; una edición manual incompatible queda pendiente.

## Importador

Desde backend (solo proceso demo autorizado):

```bash
npm run db:demo-images -- /ruta/paquete-aprobado
npm run db:demo-images -- /ruta/paquete-aprobado --apply
```

Sin `--apply` solo vista previa. Requiere SEED_DEMO_DATA=true, NODE_ENV distinto
de production, MAIL_ENABLED=false, WEBPAY_ENVIRONMENT=integration y marcador demo
ya inicializado. No crea productos, familias, ventas, stock ni usuarios. Una
ejecución puede completar imágenes mucho después de la seed, sin repetirla.

Solo una entrada por SKU: las claves ambiguas, hashes y rutas inválidas se
rechazan. Se conservan fotos existentes. No se copian fotos a variantes hermanas.
Los archivos usan `products/<id>/demo-<sha256>.<ext>` en UPLOADS_ROOT y se registran
en product_images con las reglas existentes de imagen principal. El reporte JSON
incluye origen, SKU, permiso declarado y resultado por cada uno de los 96 artículos.
Guardar ese reporte privadamente como evidencia del lote; no contiene credenciales.

La transacción de BD es atómica; el filesystem no participa en esa transacción.
Si falla después de escribir un archivo aprobado puede quedar un archivo sin
referencia. Nunca se borra ni sobrescribe: un reintento reutiliza el hash exacto.
Una fila cuyo archivo desapareció o fue alterado produce error, no reparación
silenciosa. No mover el volumen ni retirar derechos sin revisión posterior.

## Prueba local en Git Bash

Desde la raíz; los binarios deben existir y ser 16.15. El runner verifica también
la versión real del servidor y solo usa el clúster descartable de puerto 55444.

```bash
(
  cd backend &&
  npm run build &&
  node tests/demoCatalog.unit.mjs &&
  node --test tests/seedAuthorization.unit.mjs &&
  PG_TEST_BIN='C:/Users/Sebastian/AppData/Local/Temp/fyf-demo-pg16-20261028/engine/pgsql/bin' \
  FAMILY_TEST_SCOPE=seed NODE_ENV=test MAIL_ENABLED=false WEBPAY_ENVIRONMENT=integration \
  node scripts/test-product-families.mjs
)
```

Las imágenes de integración son PNG sintéticos, no permisos ficticios otorgados a
fotos de proveedores. Se comprueban SQL y HTTP reales. El reinicio de proceso del
importador comprueba reutilización de archivos persistidos; no equivale a haber
reconstruido Docker. Esa verificación debe completarse abajo en el entorno destino.

## Antes de Termius

Realizar los commits manualmente y publicar la rama; NO incluir `.env`, archivos
privados, backups, imágenes sin permiso ni reportes de datos reales. Confirmar
que las pruebas locales aprobaron. Obtener ruta del checkout, host SSH y nombre
real de base/proyecto Compose del servidor; no se conocen desde este workspace.
No elegir otro project-name de Compose: podría crear volúmenes vacíos paralelos.
No cambiar de PostgreSQL en el servidor por iniciativa propia.
El override presupone que el servidor usa los servicios del Compose inspeccionado.
Si la universidad proporciona PostgreSQL externo a ese Compose, detenerse y adaptar
host/puerto/nombre a esa conexión verificada: no levantar una segunda DB para
forzar que encaje este procedimiento. La autorización por token exige permisos
para comentar la base; si el rol universitario no los tiene, coordinar con su
administrador, no saltarse esa comprobación.

## 1. Inspección y respaldo del servidor (todavía con Compose habitual)

En Termius, desde la raíz REAL del checkout existente:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
docker compose version
docker compose ps -a
docker inspect ferreteria-db --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ferreteria-backend --format '{{range .Mounts}}{{println .Type .Name .Destination}}{{end}}'
docker compose exec -T db sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), version(); SELECT datname,shobj_description(oid,'"'"'pg_database'"'"') FROM pg_database WHERE datname=current_database();"'
```

Confirmar personalmente que es el servidor/base UNIVERSITARIOS y que no hay otros
escritores. Detener backend/frontend (no DB) antes de capturar BD y archivos:

```bash
docker compose stop backend frontend
BACKUP="$HOME/FYF-backups/pre-demo-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
umask 077
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$BACKUP/database.dump"
test -s "$BACKUP/database.dump" || exit 1
docker compose exec -T db pg_restore --list < "$BACKUP/database.dump" > "$BACKUP/restore-list.txt"
BACKEND_ID="$(docker compose ps -a -q backend)"
test -n "$BACKEND_ID" || exit 1
docker cp "$BACKEND_ID:/app/uploads" "$BACKUP/uploads"
sha256sum "$BACKUP/database.dump" > "$BACKUP/database.sha256"
```

No continuar si falla alguna comprobación. La lista no demuestra restaurabilidad:
restaurar la copia en PostgreSQL temporal separado antes de seguir. Por ejemplo,
si el servidor original es 16.15, esta prueba crea SOLO un contenedor temporal sin
red ni puertos publicados (no la segunda base permanente de la aplicación):

```bash
CHECK="fyf-restore-check-$(date +%s)"
docker run -d --name "$CHECK" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.15
until docker exec "$CHECK" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec -i "$CHECK" pg_restore -U postgres -d postgres --no-owner --no-privileges --exit-on-error < "$BACKUP/database.dump"
docker exec "$CHECK" psql -U postgres -d postgres -c 'SELECT count(*) FROM products; SELECT count(*) FROM sales;'
docker stop "$CHECK"
```

Comparar conteos/restauración con el original. El contenedor de verificación queda
detenido para inspección; retirar solo ese contenedor cuando se confirme la copia.
Si la versión original es otra, evaluar compatibilidad antes de este paso. No
restaurar sobre la base original. Conservar backup de imágenes y BD conjuntamente.

## 2. Actualizar código y validar el override académico

Solo con worktree limpio y estando YA en feature/tarifas-despacho:

```bash
git pull --ff-only origin feature/tarifas-despacho
dc() { docker compose -f docker-compose.yml -f docker-compose.academic.yml "$@"; }
dc config --quiet
```

Requiere Compose >=2.24.4 por `!override`; si no lo soporta, detenerse, no omitir el
override. El archivo reutiliza db/backend/frontend/seed/migrate y product_uploads.
Despublica puertos DB/backend y deja frontend en 127.0.0.1:5173. Mantiene runtime
NODE_ENV normal, fuerza Webpay integración sin claves comerciales y desactiva SMTP
SOLO con este override. No cambia `.env` ni el comportamiento normal del proyecto.

Para cambiar directorio de paquete, usar `export DEMO_IMAGE_PACKAGE=/ruta/privada`
con ruta absoluta del servidor. Sin paquete aprobado usa el manifiesto pendiente
actual; el resultado esperado son cero fotografías nuevas y placeholders.

## 3. Migraciones, autorización y seed

```bash
dc build backend frontend migrate seed
dc exec -T db sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,created_at FROM drizzle.__drizzle_migrations ORDER BY id;"'
```

Comparar con `backend/drizzle/meta/_journal.json` (actualmente 43 entradas, 0042).
Solo si faltan migraciones y fueron revisadas/autorizadas:

```bash
dc run --rm --no-deps migrate
```

La seed usa la base indicada por POSTGRES_DB existente, no la renombra. Para una
demo ya marcada, no hace falta token. Para una base nueva/vacía con nombre propio,
verificar primero que no tenga información previa ni un comentario ajeno. Solo
roles/catalog_presentation pueden estar inicializadas. Si ya hay usuarios,
productos, ventas u otras filas, DETENERSE: no hay modo merge ni reset automático.

Después de verificar vacío, respaldo/restauración y autorización del propietario:

```bash
export SEED_LOCAL_ONCE_TOKEN="$(openssl rand -hex 32)"
dc exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v seed_token="$1"' sh "$SEED_LOCAL_ONCE_TOKEN" <<'SQL'
SELECT format('COMMENT ON DATABASE %I IS %L', current_database(), 'FYF_ACADEMIC_DEMO_ONCE:' || :'seed_token')
FROM pg_database WHERE datname=current_database() AND shobj_description(oid,'pg_database') IS NULL
\gexec
SQL
SEED_DEMO_DATA=true dc run --rm --no-deps seed npm run db:seed
unset SEED_LOCAL_ONCE_TOKEN
```

El nombre histórico SEED_LOCAL_ONCE_TOKEN se conserva por compatibilidad. En el
override se vincula a host db/puerto 5432/nombre POSTGRES_DB y al comentario exacto.
La seed no usa production; solamente ese proceso va en NODE_ENV=test. El comentario
de inicialización se confirma junto con la transacción y la segunda seed es no-op.

## 4. Fotos y arranque

```bash
mkdir -p "$BACKUP/reports"
SEED_DEMO_DATA=true dc run --rm --no-deps seed node dist/db/importDemoImages.js /demo-images > "$BACKUP/reports/images-preview.json"
# Revisar el reporte antes de aplicar:
SEED_DEMO_DATA=true dc run --rm --no-deps seed node dist/db/importDemoImages.js /demo-images --apply > "$BACKUP/reports/images-applied.json"
dc up -d --no-deps backend frontend
dc exec -T backend node -e 'if(process.env.WEBPAY_ENVIRONMENT!=="integration"||process.env.MAIL_ENABLED!=="false"||process.env.WEBPAY_COMMERCE_CODE||process.env.WEBPAY_API_KEY)process.exit(1);console.log("Demo: Webpay integration, sin claves reales, correo deshabilitado")'
curl --fail http://127.0.0.1:5173/api/health
```

Cambiar las credenciales de prueba mediante el flujo administrativo antes de
compartir acceso. Las credenciales iniciales conocidas en el código no son una
medida de acceso restringido. No probar registro ni pagos con datos reales.

## 5. Computador, celular y persistencia

El destino SSH y el usuario deben ser los reales proporcionados por la universidad.
Desde Git Bash del computador o configurando Local Forward en Termius:

```bash
ssh -N -L 5173:127.0.0.1:5173 USUARIO_UNIVERSITARIO@HOST_UNIVERSITARIO
```

Abrir http://localhost:5173. Para celular, usar un túnel SSH propio en el teléfono
o el acceso HTTPS/VPN restringido proporcionado por la universidad. No abrir DB ni
backend públicamente. No se configura un dominio/TLS inexistente ni se promete que
localhost del computador sea accesible desde el teléfono. Para acceso HTTPS real,
definir DEMO_PUBLIC_URL y DEMO_WEBPAY_RETURN_URL con ese origen correcto antes de
recrear backend; no contiene secretos ni cambia la modalidad de pago.

Comprobar imagen URL obtenida del catálogo (no adivinar IDs), login, inventario,
selección de variantes, carrito y Webpay de integración. Luego:

```bash
dc restart backend frontend
SEED_DEMO_DATA=true dc run --rm --no-deps seed node dist/db/importDemoImages.js /demo-images > "$BACKUP/reports/images-after-restart.json"
dc up -d --no-deps --build backend frontend
```

Volver a consultar las mismas URLs y hashes. El volumen se conserva al reconstruir.
No usar down -v, no eliminar volúmenes ni publicar docs/imágenes pendientes. Si el
servidor contiene datos previos no vacíos y no marcados, la carga queda pendiente
de una decisión explícita; no hay autorización implícita para borrarlos.

## Resultados locales — 1 de noviembre de 2026

- PostgreSQL 16.15 real en clústeres descartables 55444 (seed/imágenes) y 55446
  (despacho/checkout/Webpay simulado). Ninguna conexión a bases habituales.
- 43 migraciones existentes hasta 0042, sin nuevas migraciones.
- 96 SKU, 8 categorías, 19 familias/71 variantes/25 simples, 36 ventas, 90 líneas,
  193 movimientos iniciales y 9 solicitudes ficticias: coherencia aprobada.
- Se corrigió el orden de fixtures: familias antes de ventas/devoluciones. Una
  devolución pendiente bloqueaba correctamente la asociación en el orden antiguo.
- Segunda seed sin escrituras, rechazo de base no vacía/no marcada y autorización
  académica exacta. Sin correos ni pagos reales.
- 13 fotos de proveedores pendientes no asociadas. Tres PNG sintéticos exclusivos
  de tests asociados al SKU exacto, incluyendo familia/simple/inactivo; HTTP y
  catálogo/inventario reales, hash, rutas, preview, rollback, replay, proceso nuevo,
  concurrencia, metadatos existentes y preservación de tablas comerciales aprobados.
- Backend 64/64 unitarios; frontend 305/305; TypeScript/build backend, lint/build
  frontend y diff check aprobados. Advertencia preexistente del bundle >500 kB.
- Compose académico validado sin arrancar Docker. NO se probó reconstrucción de
  contenedores, acceso remoto, teléfono ni nuevos recorridos de navegador en esta
  ejecución. La persistencia Docker se verifica manualmente con el paso 5.
