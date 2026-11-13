# Catálogo de referencia y revisión privada de imágenes

El catálogo demo contiene **96 SKU en ocho categorías**. Su
fuente versionada es `backend/src/db/demo/catalog.ts`: registra nombre, marca
identificada, modelo/referencia, especificación, presentación, código del
proveedor/catálogo, precio ficticio y documento/página PDF de origen. Las
existencias iniciales ficticias se declaran en `demoProducts`; las ventas demo
posteriores modifican esas cantidades mediante movimientos normales.
`catalog.json` permite revisar los 96 artículos con sus valores iniciales exactos,
incluyendo códigos, marcas, referencias y fuentes. Para regenerarlo desde backend:
`npm run build` y `node scripts/export-demo-catalog.mjs` (sin conexión a BD).

**Todos los precios, existencias, estados y condiciones de venta son fixtures de
desarrollo; no representan oferta, stock ni disponibilidad real de FYF.** Los
códigos de proveedor se conservan como referencias, nunca como códigos de barras.
Las marcas no identificadas y todos los códigos de barras quedan sin informar.
La presentación pública del entorno demo indica expresamente que los precios y
existencias son ficticios; también se incluye esta advertencia en cada descripción.

| Categoría | Artículos |
|---|---:|
| Pinturas y recubrimientos | 12 |
| Brochas, rodillos y accesorios de pintura | 22 |
| Clavos y fijaciones | 14 |
| Mallas y cercos | 10 |
| Abrasivos, corte y perforación | 14 |
| Herramientas manuales | 14 |
| Sopletes y accesorios | 5 |
| Lubricantes y mantención | 5 |

## Imágenes: NO publicar todavía

**Actualización, 2 de noviembre de 2026:** esta restricción sigue vigente para
las fotografías de proveedores. La quinta etapa entrega por separado 96 fichas
gráficas originales referenciales, no fotografías. Revisar el [reporte por SKU](image-review.md),
la [galería local](reference-package/index.html) y la [guía actual de imágenes/PM2](../academic-demo-images-stage5.md).
El paquete no se importó en ninguna base real y no aprueba las 13 fotos privadas.

`images/` contiene 13 objetos originales extraídos de la cotización. Se revisó
su asociación con las filas y referencias catalogadas. `extracted-images.json`
registra producto, página, objeto PDF, dimensiones y hashes de origen/imagen.
Todas las autorizaciones permanecen en `PENDING_AUTHORIZATION` y `publish=false`.
No se retiraron marcas ni se fabricaron fotos de colores o medidas diferentes.
Son imágenes pequeñas de proveedor, no fotografías nuevas de stock FYF.

La seed **no inserta product_images ni copia archivos a uploads o frontend/public**.
Este directorio no forma parte del contexto Docker del backend/frontend ni posee
una ruta HTTP. No desplegar ni copiar esta carpeta a un hosting público. La
autorización debe cubrir también su eventual publicación en un repositorio público.
Las imágenes quedan ignoradas por Git para evitar publicarlas accidentalmente;
el script permite reproducir la preparación local desde los PDF originales.

Se descartaron la imagen del gato asociada al rodillo de la cotización, logotipos
aislados, la asociación contradictoria de bandeja de LYS p. 59 y fotografías
genéricas compartidas entre varias medidas/colores/granos. Las fotos WhatsApp se
usaron para contrastar Lizcal y mallas; no se publicaron como fotos exactas de cada SKU.
Los restantes artículos quedan sin imagen hasta contar con una asociación precisa
y autorización. La aplicación conserva su presentación existente para productos
sin imagen.

Reproducir la extracción, desde backend, con Python y pypdf:

```powershell
python scripts/prepare-demo-images.py --source-dir "C:/ruta/a/documentos-proveedores"
```

## Confirmaciones comerciales pendientes

- Selección de productos realmente ofrecidos por FYF y canal de venta permitido.
- Precios de venta y existencias reales (no inferirlos de la cotización).
- Presentación minorista: unidad, caja, ciento, set o rollo completo.
- Marcas/modelos no informados y códigos de barras comprobados en envases.
- Permiso de uso de imágenes y confirmación final de envase/modelo/medida.

La seed actual asocia 71 SKU a 19 familias; 25 siguen siendo productos simples.
Cada SKU conserva su identidad y sus cantidades enteras; no hay conversión entre
presentaciones ni venta fraccionaria. `catalog.json` describe los artículos fuente;
las agrupaciones revisadas se definen en `backend/src/db/demo/families.ts`.

## Asociación automática controlada

El comando `db:demo-images` incorpora imágenes aprobadas después de inicializar la
demo, sin repetir productos ni movimientos. Las 13 imágenes de este manifiesto
siguen pendientes y NO se publican. Ver [guía de demostración universitaria](../academic-demo-deployment.md)
para aprobación, vista previa, importación, reporte y persistencia en el volumen
existente. `image-candidates.json` es solo una lista de candidatos, no permisos.
