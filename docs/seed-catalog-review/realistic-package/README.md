# Objetos físicos referenciales: paquete separado de revisión

## Resultado

- 96 SKU con una ilustración realista individual seleccionada; **0 solo ficha**.
- Las **96 fichas anteriores se conservan** en `../reference-package`, sin
  regenerarlas, sustituirlas ni publicarlas. La galería muestra ambas opciones.
- **96 pendientes de aprobación visual**. Preparada no significa aprobada como
  reproducción exacta del modelo, medida, fabricante o envase comercial.
- **0 fotografías oficiales con permiso comprobado**, 0 descargas externas,
  0 asociaciones en BD y 0 publicaciones en esta continuación.
- 98 generaciones originales: 96 selecciones y 2 intentos descartados. No son
  imágenes de proveedores ni fotografías exactas de los productos de la seed.

Abrir `index.html` en un navegador. Funciona con archivos locales y rutas
relativas, sin backend, cuenta, base de datos ni enlaces a discos Windows.
Incluye búsqueda por nombre, código y variante, comparación lado a lado y
advertencias desplegables. En pantallas pequeñas puede abrirse cada imagen
individual en otra pestaña desde el menú contextual para revisar detalles.

## Procedencia y controles

Se reutilizó la investigación previa de `../image-review.json` y sus 75 consultas
documentadas, sin repetir búsquedas ni atribuir nuevos permisos a proveedores.
Las 13 fotografías privadas originales conservan `PENDING_AUTHORIZATION` y
`publish=false`. Sus permisos no cambian por tratarse de una demo académica.

Las ilustraciones se generaron individualmente con la herramienta integrada
`image_gen`, sin fotografías de proveedores como entradas, sin logotipos y sin
afirmar reproducción exacta del fabricante. Cada imagen contiene el rótulo
**Ilustración referencial** y muestra un objeto físico, no una ficha de texto.

- `prompts.json`: plan original para los 96 SKU.
- `generation-records.json` y `generation-batch-*.json`: encargos realmente
  ejecutados, clave del SKU y nombre del PNG fuente generado por la herramienta.
- `review.json`: selección final por SKU, identidad/hash, especificación,
  investigación reutilizada, prompt ejecutado y verificaciones pendientes.
- `extracted-images.json`: manifiesto para el preflight del importador existente.
  Todas sus entradas tienen `publish=false` y `PENDING_VISUAL_REVIEW`.
  `sourceDocument/sourcePage` identifican el SKU en el documento de referencia;
  no afirman que la ilustración se extrajo de ese PDF.
- `provenance.json`: procedencia de las creaciones; **no concede derechos sobre
  fotografías externas ni afirma patrocinio de las marcas**.
- `attempts/`: registro de los dos intentos no seleccionados y su motivo.
- `images/`: archivos locales optimizados WebP, máximo 960 px de lado. Se
  conserva la composición completa, sin recorte, repintado o división de collage.
  Puede contener ensayos conservados; **la selección es la de `review.json` y el
  manifiesto, no todos los archivos encontrados al enumerar el directorio**.

Cada SKU tiene un archivo y hash seleccionados distintos: no se reutilizó una
foto genérica entre todas las variantes. Esto no certifica dimensiones físicas;
una imagen sin escala y un hash de identidad no demuestran coincidencia visual.

## Revisión pendiente

Revisar todas las imágenes antes de asociarlas o publicarlas. Particularmente:

- Sopletes: diseños de carcasa, boquillas, conectores e ignición genéricos. No
  aprobados como los modelos exactos de UYUS, Yanes, Providus o Truper.
- Clavos para pólvora: confirmar cabeza/arandela y notación de diámetro 3,7.
  Se representan pins/clavos genéricos, no una fijación comercial certificada.
- Sets: contar piezas y revisar puntas, montaje y accesorios.
- Brochas EMTOP EPBH15702/EPBH02702: persiste la contradicción del catálogo
  investigado; confirmar ancho y modelo contra el artículo o documento original.
- Truper 110 ml: conflicto histórico de modelo WT-400/WT-110; envase ilustrativo.
- Mallas: comprobar tejido, colores y presentación; el dibujo no acredita 80% de
  sombra, ni los metros de un paño plegado o un rollo.
- Discos: comprobar perfil, orificio, diámetro y 24 dientes cuando corresponda;
  el acabado no certifica el grano del abrasivo.
- Pinturas: tono ilustrativo, no carta de color oficial. Se corrigió el candidato
  verde normal para diferenciarlo del fluorescente.

La revisión detectó y corrigió dos candidatos: verde normal demasiado cercano al
fluorescente y disco flap grano 80 con perforaciones adicionales no verificadas.
Se conservaron los intentos y no se sobreescribieron las fichas previas.

Los PDF originales y fotografías propias siguen siendo necesarios para aprobar
los detalles no documentados. Mientras tanto, conservar placeholder/ficha, según
lo que el usuario apruebe; no publicar la ilustración como fotografía exacta.

## Comprobaciones seguras desde Git Bash

Desde la raíz del repositorio:

```bash
(
  cd backend &&
  npm run build &&
  node --test tests/demoRealisticPreparation.unit.mjs &&
  npm run db:demo-images -- ../docs/seed-catalog-review/realistic-package --check-files
)
```

Resultado esperado: `ready: 0`, `databaseChecked: false`, `filesWritten: 0` y
96 `AUTHORIZATION_PENDING`. El preflight verifica archivos reales, hashes,
formato, tamaño, identidad y procedencia; **no comprueba persistencia en BD**.
No ejecutar `--apply`, seed ni migraciones para revisar esta galería.

En este computador, usando Playwright/Chromium ya instalados, sin dependencias
nuevas del proyecto:

```bash
FYF_PLAYWRIGHT_MODULE='C:/Users/Sebastian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright' \
node backend/tests/demoRealisticGallery.browser.mjs
```

El preparador `backend/scripts/prepare-demo-realistic-review.mjs` solo ensambla
archivos previamente generados. No genera imágenes mediante API/CLI alternativos,
no descarga fotografías, no abre la BD y no importa productos. Su opción
`--assemble` recibe el directorio de PNG fuente de la herramienta y usa Chromium
para optimización de formato. La galería y los WebP entregados ya están listos:
no hace falta regenerarlos en Linux ni transferir rutas del computador.

## Incorporación futura

1. Revisar la galería y aprobar expresamente un subconjunto de SKU/imágenes.
2. Registrar evidencia y alcance de esa aprobación para las ilustraciones
   originales seleccionadas, sin aprobar por arrastre las fotos de proveedores.
3. Preparar una copia del manifiesto únicamente con lo aprobado. No cambiar
   masivamente `rightsStatus` o `publish` para eludir la revisión.
4. Respaldar BD y uploads del entorno universitario y comprobar la identidad real
   del destino, siguiendo `../../academic-demo-deployment.md` y las protecciones
   del importador existente. No repetir la seed.
5. Ejecutar primero preflight y luego la vista previa con BD, antes de una
   eventual aplicación expresamente autorizada. Si un producto ya tiene una
   imagen, el importador actual la conserva: **no usar este paquete para
   reemplazar asociaciones existentes a ciegas**.

No se incluyen comandos de despliegue ni aplicación: esta entrega es para
comparación y aprobación. No se accedió al servidor universitario ni se modificó
UX, catálogo, stock, ventas, Webpay, correo, conciliación, configuración o `.env`.

## Verificación realizada

- 5 pruebas nuevas de preparación/preflight, todas aprobadas.
- Reensamblado idempotente comprobado: mismos 96 archivos seleccionados, hashes
  y fechas de modificación; no se sobrescribieron los recursos.
- Regresión de preparación anterior: 4 aprobadas; persistencia de BD simulada,
  archivos y HTTP locales reales. El primer intento quedó bloqueado por el
  sandbox de red; la repetición autorizada en loopback aprobó.
- Catálogo de 96 SKU y autorización de seed: pruebas unitarias aprobadas, sin
  ejecutar la seed ni abrir PostgreSQL.
- Chromium nativo local: 192 imágenes decodificadas, ambos temas,
  320/360/375/400/1280 px, búsqueda, vacío, teclado y desplegables sin overflow.
- Inspección visual de los 96 candidatos en seis hojas de revisión y revisión
  individual de tipos y dos correcciones; **no aprobación del modelo comercial**.
- Build/TypeScript backend, ESLint y build frontend aprobados. Vite conserva
  advertencia de tamaño de bundle; no se cambió código frontend.
- `git diff --check` aprobado. No staging, commits, push, seed, migraciones ni
  pruebas contra bases habituales/universitarias.
