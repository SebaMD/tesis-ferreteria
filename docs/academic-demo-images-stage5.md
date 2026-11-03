# Quinta etapa: imágenes de la demostración académica

Revisión del **2 de noviembre de 2026**, sin acceso al servidor, PostgreSQL,
PM2 ni bases habituales. El entorno universitario descrito por el usuario usa
**PM2 y PostgreSQL 13.23**, no el Compose de la guía histórica. No ejecutar
seed, migraciones, reset ni procedimientos Docker para incorporar este paquete.

## Resultado y significado de los conteos

| Concepto | SKU |
|---|---:|
| Revisados, con clave, categoría, familia, variante y medida | 96 |
| Página externa con identidad textual coincidente | 39 |
| Referencia externa parcial/de familia | 42 |
| Resultado externo ambiguo o contradictorio | 12 |
| Sin resultado externo fiable | 3 |
| Con algún candidato fotográfico externo o privado | 95 |
| Sin candidato fotográfico, incluyendo los privados | 1 |
| Fotos privadas ya existentes, hashes verificados, permiso pendiente | 13 |
| Nuevas fotografías descargadas/publicadas | 0 |
| Fotografías con permiso de publicación comprobado | 0 |
| Fichas gráficas originales referenciales preparadas | 96 |
| Asociaciones realizadas en una base real | 0 |

Los 39 resultados coincidentes son **páginas de productos**, no 39 fotografías
visualmente aprobadas ni licenciadas. No se confundieron estos conceptos.
Las 13 fotos privadas se superponen con los resultados externos: no sumar ambos
conteos como si fueran productos diferentes. Todos los SKU siguen sin fotografía
exacta autorizada. Si se adopta el paquete original, todos tendrán una ficha
referencial, pero no se convierten por ello en productos fotografiados.

### Entregables

- `seed-catalog-review/image-review.md`: tabla legible de los 96 SKU.
- `seed-catalog-review/image-review.json`: identidad completa, familia/opciones,
  fuentes, comprobaciones visuales pendientes, archivo privado y ficha preparada.
- `seed-catalog-review/research-groups.json`: selección conservadora de fuentes.
- `seed-catalog-review/search-log-2026-11-02.json`: 75 consultas y las aperturas
  efectuadas; incluye fallos de acceso, que NO se aceptaron como coincidencias.
- `seed-catalog-review/reference-package/index.html`: galería local de revisión.
- `seed-catalog-review/reference-package/extracted-images.json`: manifiesto
  compatible con el importador existente, una entrada por SKU.
- `seed-catalog-review/reference-package/rights-evidence.json`: procedencia de
  autoría original, huella del generador y alcance académico. No concede derechos
  sobre fotografías de fabricantes ni atribuye patrocinio a las marcas.
- 96 PNG de 900 × 900, aproximadamente **5,4 MB en total**.

Las fichas se diseñaron mediante SVG nativo original y se rasterizaron con
Chromium. No contienen fotografías descargadas, logotipos, recortes de catálogo
ni fotografías inventadas mediante IA. Están rotuladas **REFERENCIAL / NO ES FOTO
DEL MODELO / SIN ESCALA**. El esquema es tipológico; las medidas y códigos se
muestran como texto exacto de la seed, no como dimensiones verificadas del dibujo.
Cada PNG es distinto y está vinculado a la identidad de un SKU; no se propaga a
otras variantes. La marca se utiliza únicamente para identificar el artículo.
En el manifiesto, `sourceDocument/sourcePage` identifican el artículo en el
catálogo fuente; NO afirman que el dibujo fue extraído de ese PDF. La procedencia
del recurso es `assetKind=ORIGINAL_REFERENCE_CARD`, el generador y su evidencia.

`AUTHORIZED` se declara únicamente para estas creaciones originales encargadas
para la demo, con evidencia local y alcance `academic-web`. Las **13 entradas
originales de proveedores no se modificaron**: siguen `PENDING_AUTHORIZATION`,
`publish=false`. Revisar y aprobar la apariencia del paquete original antes de
decidir utilizarlo en la demostración. No se ha importado automáticamente.

## Hallazgos que impiden asociaciones automáticas de fotografías

- REX requiere autorización previa escrita para reproducir o distribuir contenido
  en sus términos, sección 5. Sus fichas técnicas antiguas permiten determinadas
  copias completas para uso correcto del producto; eso no autoriza recortar y
  reutilizar fotografías en otra tienda.
  Fuente: https://www.rex.cl/producto/pintura-spray-uso-general/
- Truper exige autorización escrita en sus fichas. La ficha WT-400 corresponde a
  400 ml; referencias de 110 ml aparecen como WT-110/WT-400M. Se conservó la
  identidad histórica de la seed sin corregir datos ni asignar una lata de 400 ml
  al SKU de 110 ml.
  Fuente: https://www.truper.com/ficha_tecnica_pdf/views/ficha-print.php?id=10854
- EPBH15702/EPBH02702 aparecen intercambiados en un catálogo de distribuidor;
  otras fuentes señalan 1,5/2 pulgadas respectivamente. No se aceptó la foto por
  coincidencia de código sin contrastar el ancho. Las aperturas directas EMTOP de
  algunas brochas fallaron y no se presentaron como fuentes verificadas.
- El resultado de amarra UYUS 4,8 × 300 era **negro**, pero la seed requiere blanco.
  Se rechazó. Las mallas de 65% o de 2,10 m tampoco sustituyen las de 80%/4,20 m.
- TN0192 corresponde a 400 ml y TN0191 aparece como 250 ml en distribuidores.
  No se intercambiaron fotografías ni se modificó el nombre de la seed.
- Un resultado FP9410 era un pedal Yamaha: descartado, no es una llave.
- Bandeja Lizcal y algunos martillos/sopletes Truper carecen de modelo o medida
  suficiente en la seed para seleccionar una foto inequívoca.

No se localizaron los tres PDF originales ni las fotografías de páginas en el
workspace. Para completar la revisión, proporcionar **CATALOGO COM. CADENA.pdf,
CATALOGO LYS 2025.pdf, Cotizacion_COT-2026-0934.pdf y las fotos originales** en una
carpeta privada externa al repositorio. No subirlos a `frontend/public` ni a uploads.

## Comprobación local sin base de datos (Git Bash)

Desde la raíz del proyecto:

```bash
(
  cd backend &&
  npm run build &&
  npm run db:demo-images -- ../docs/seed-catalog-review/reference-package --check-files &&
  node tests/demoCatalog.unit.mjs &&
  node --test tests/seedAuthorization.unit.mjs &&
  node --experimental-test-module-mocks --test tests/demoImagePreparation.unit.mjs
)
```

`--check-files` no importa el cliente de BD, abre sockets ni escribe archivos:
comprueba claves, identidad, documento/página de identificación, rutas, formato,
tamaño, hashes y evidencia de autoría. Devuelve `READY_PACKAGE_ONLY`, no `READY`:
todavía falta comprobar la identidad real en BD y las fotografías existentes.
No combinar `--check-files` con `--apply`.

Para reproducir las fichas, usar una instalación existente de Playwright y Chromium,
sin añadir dependencias al proyecto. En este computador se utilizó:

```bash
FYF_PLAYWRIGHT_MODULE='C:/Users/Sebastian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright' \
node backend/scripts/prepare-demo-image-review.mjs

FYF_PLAYWRIGHT_MODULE='C:/Users/Sebastian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright' \
node backend/tests/demoImageGallery.browser.mjs
```

El preparador no descarga imágenes ni conecta a BD. Repetirlo reutiliza los
archivos idénticos y rechaza sobrescribir uno diferente. Si se cambia el diseño
o la plataforma de renderizado, generar en un directorio NUEVO para revisión,
no borrar el paquete anterior. La evidencia registra el hash del generador.

## Incorporación posterior mediante Termius: sin repetir la seed

**Estos pasos son instrucciones, no se ejecutaron.** Primero revisar las fichas,
publicar manualmente el código elegido y trasladar únicamente el paquete aprobado
al checkout universitario. No copiar `seed-catalog-review/images` (fotos privadas),
documentos fuente ni candidatos pendientes.

1. Verificar el checkout/rama y el proceso PM2 real con `git status --short`,
   `git branch --show-current` y `pm2 ls`. No adivinar nombres de procesos, rutas
   o bases. No es necesario reiniciar PM2 para que una imagen nueva aparezca.
2. Identificar la conexión exacta y `UPLOADS_ROOT` del backend en ejecución, sin
   imprimir contraseñas. Verificar `current_database()`, versión y comentario de
   la base mediante una consulta de solo lectura. Debe estar marcada como demo
   académica ya inicializada. Si falta el marcador o hay una identidad inesperada,
   **detenerse**: no escribir comentarios ni repetir la seed para eludir el control.
3. Respaldar la BD y el directorio REAL de uploads juntos y comprobar la copia en
   un entorno de restauración aislado antes de aplicar. No se suministra un
   comando de backup con nombres/rutas de servidor desconocidos.
4. Desde la raíz REAL del checkout universitario, comprobar archivos sin BD:

```bash
(
  cd backend &&
  npm run build &&
  npm run db:demo-images -- ../docs/seed-catalog-review/reference-package --check-files
)
```

5. Exportar **en la sesión privada** los valores exactos y verificados de
   `DATABASE_URL`, `SEED_ACADEMIC_HOST`, `SEED_ACADEMIC_PORT`,
   `SEED_ACADEMIC_DATABASE` y `UPLOADS_ROOT`, coincidentes con PM2. La URL debe ser
   la universitaria, no la del computador. No incluir credenciales en Git, reportes
   o mensajes. Sin estos valores exactos no hay un comando universal seguro.
   Ejecutar primero SOLO la vista previa normal:

```bash
(
  : "${DATABASE_URL:?Falta la conexion universitaria verificada}"
  : "${SEED_ACADEMIC_HOST:?Falta el host exacto}"
  : "${SEED_ACADEMIC_PORT:?Falta el puerto exacto}"
  : "${SEED_ACADEMIC_DATABASE:?Falta la base exacta}"
  : "${UPLOADS_ROOT:?Falta el directorio persistente real de PM2}"
  test -d "$UPLOADS_ROOT" || exit 1
  cd backend || exit 1
  NODE_ENV=test SEED_DEMO_DATA=true MAIL_ENABLED=false WEBPAY_ENVIRONMENT=integration \
    npm run db:demo-images -- ../docs/seed-catalog-review/reference-package
)
```

Los valores de seguridad son **solo del proceso importador**: no cambian `.env`,
PM2, SMTP del backend activo ni el Webpay de la aplicación. El importador no envía
correos ni inicia pagos. La vista previa normal consulta y bloquea filas dentro de
una transacción, pero no inserta imágenes ni escribe archivos. Revisar los 96
resultados y el destino antes de autorizar la ejecución siguiente.

6. Únicamente tras respaldo validado y aprobación del reporte, repetir el mismo
   bloque y añadir `--apply` al comando final. No se ejecutan seed ni migraciones:

```bash
NODE_ENV=test SEED_DEMO_DATA=true MAIL_ENABLED=false WEBPAY_ENVIRONMENT=integration \
  npm run db:demo-images -- ../docs/seed-catalog-review/reference-package --apply
```

Este último comando se ejecuta desde `backend` y exige las mismas variables
verificadas del bloque anterior. Preserva fotos existentes. Un producto editado
durante pruebas puede producir `IDENTITY_MISMATCH`; no se empareja por ID, por
semejanza de nombre ni con otra medida. Resolver ese caso mediante revisión manual.

7. Repetir primero la vista previa: las imágenes incorporadas deben aparecer
   `ALREADY_ASSOCIATED`, sin filas ni movimientos nuevos. Comprobar catálogo e
   Inventario, selección de cada variante y las URLs devueltas por la API
   (`/uploads/products/<id>/demo-<hash>.png`). El `<id>` se obtiene del reporte,
   nunca se supone a partir del código de proveedor.
8. El catálogo debe seguir mostrando su placeholder donde no exista imagen o se
   haya conservado un producto incompatible. Revisar desde computador/celular.
   No borrar uploads al actualizar el código; debe permanecer en la misma ruta
   persistente de PM2. Verificar nuevamente después del próximo reinicio autorizado.

**Límite importante:** el importador preserva cualquier imagen existente, también
una ficha referencial ya importada. No la reemplazará por una fotografía nueva en
un lote posterior. Utilizar la gestión administrativa normal de imágenes para
ese reemplazo aprobado; no eliminar filas/archivos mediante SQL improvisado.

## Pruebas y límites

- Validación real de 96 PNG: 900 × 900, hashes distintos, tamaño individual <150 KB,
  correspondencia de identidad y conservación de 19 familias/71 variantes/25 simples.
- Comprobación offline del paquete: 96 listas; proveedores originales: 0 listas,
  13 pendientes. No hay escrituras ni conexión a PostgreSQL.
- Prueba del importador real con BD simulada EXPLÍCITA y filesystem temporal real:
  preview 96, preservación de una foto previa, 95 asociaciones, segundo pase sin
  duplicados, rechazo de identidad/medida, rutas, hash, formato, tamaño y evidencia.
- HTTP local real de las 95 copias y lectura desde otro proceso con hash idéntico.
  Esto no prueba consultas SQL, transacciones o bloqueos de PostgreSQL/PM2.
- Chromium abre la galería local: 96 PNG decodificados con dimensiones y textos
  alternativos correctos; sin desbordamiento a 320/360/375/400/1280 px. No equivale
  a consultar el catálogo contra una BD real.
- Frontend: 325 pruebas, lint y build aprobados; TypeScript backend y diff check
  aprobados. Se conserva el aviso preexistente de bundle frontend >500 KB.
- No se ejecutó integración PostgreSQL: la prueba existente requiere inicializar
  un esquema y seed, operaciones expresamente excluidas de esta etapa. No se
  reutilizó una base habitual para obtener un resultado de integración aparente.
- Pendientes: revisión visual final del usuario, originales/permisos de fotos,
  preview contra identidad real universitaria y persistencia tras reinicio PM2.

Sin cambios en frontend/UX, inventario, pedidos, precios, stock, ventas, Webpay,
correo, conciliación, permisos ni migraciones.

## Inventario de archivos de esta etapa

Modificados:

- `backend/src/db/demo/imageImport.ts`: reutiliza las mismas validaciones en el
  preflight; conserva SQL, locks, autorización de destino y política de no reemplazo.
- `backend/src/db/importDemoImages.ts`: opción offline y carga diferida del cliente DB.
- `docs/academic-demo-deployment.md`: aviso para no aplicar la guía histórica
  Compose/seed al entorno PM2 ya cargado.
- `docs/seed-catalog-review/README.md`: distingue fotos privadas y gráficas originales.
- `docs/seed-catalog-review/image-candidates.json`: conserva los tres candidatos
  previos y enlaza el reporte completo.

Nuevos:

- `backend/src/db/demo/imageManifest.ts`.
- `backend/scripts/prepare-demo-image-review.mjs`.
- `backend/tests/demoImagePreparation.unit.mjs`.
- `backend/tests/demoImageGallery.browser.mjs`.
- Esta guía, `docs/academic-demo-images-stage5.md`.
- `docs/seed-catalog-review/image-review.json` y `image-review.md`.
- `docs/seed-catalog-review/research-groups.json`.
- `docs/seed-catalog-review/search-log-2026-11-02.json`.
- `docs/seed-catalog-review/reference-package/`: 96 PNG originales, manifiesto,
  evidencia, galería y `.gitignore` local. Esa excepción permite versionar SOLO las
  imágenes originales de este paquete; las 13 fotografías de proveedores siguen
  ignoradas. No cambió el `.gitignore` general ni se agregó nada al índice.
