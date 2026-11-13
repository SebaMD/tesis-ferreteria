# Formularios de productos: ajustes y límites de integridad

Revisión sobre `feature/tarifas-despacho`, después de los commits locales
642172a, b32464b y e990d9e. No requiere nuevas migraciones.

## Implementado

- Categoría y unidad usan los mismos controles de búsqueda en ambos modos.
  Categoría exige elegir una existente; la unidad admite una denominación propia.
- Los modos ocupan dos columnas iguales también en móvil.
- Una familia nueva con una sola variante abre una decisión centrada, sin guardar.
  El formulario se suspende, se conserva el borrador y se restaura el foco.
- Descripción individual a todo el ancho; unidad y mínimo en la fila siguiente.
- Alta simple normal reutiliza la transacción de bundles existente: imágenes,
  producto y ENTRY inicial quedan en una sola operación idempotente. El flujo
  enlazado categoría/producto conserva su navegación y reconoce la entrada inicial
  ya registrada, sin sugerir repetirla. Cero unidades no genera un movimiento.
- Stock existente solo se informa; conversiones no crean ENTRY para el original.
- Se retira solo la frase DEMO del detalle de familia, no el aviso de no reserva.

## Datos generales y propagación

`product_families.name` y `.description` son metadatos. El catálogo consume el
nombre familiar en tarjetas y detalle; la descripción familiar sirve como respaldo
si el artículo no tiene descripción. Cambiarlos no renombra ni reescribe productos.
No se añade un aviso de propagación porque no hay una actualización masiva.

La unidad general no tiene columna familiar: es un valor inicial del borrador
para artículos nuevos. Los artículos existentes tienen su propia unidad. Nombre,
marca y unidad de artículos con ventas, pedidos o movimientos están protegidos por
el servicio y por `fyf_preserve_product_identity` (0027 y su ampliación posterior).

Marca y categoría de familia permanecen bloqueadas. `saveFamily` las protege si
hay miembros o historial; `fyf_verify_variant` exige coherencia con cada producto.
Marca además forma parte de la identidad histórica. Categoría interviene en
promociones y reportes. No basta con habilitar dos inputs ni actualizar la familia.

Propuesta posterior: comando ADMIN separado con revisión esperada, motivo y lista
explícita de artículos afectados; bloqueo de familia/productos, validación de
promociones y duplicados por categoría, comprobación histórica, auditoría antes y
después, y COMMIT único. No propagar precio, stock, barcode, imágenes ni descripciones
particulares. Para artículos históricos cuya marca cambie se necesita primero una
decisión sobre identidad/reclasificación y la correspondiente autorización técnica.

## Atributos: cuatro operaciones distintas

| Operación | Restricción real | Propuesta, no implementada |
| --- | --- | --- |
| A. Renombrar atributo | No cambia IDs ni `variant_key`; el servicio actual bloquea el cambio con miembros/historial. El nombre se lee vivo en catálogo y clasificación. | Es el caso más pequeño: comando de renombrado descriptivo, sin cambiar dimensión/valores, con revisión esperada, unicidad, confirmación y auditoría del nombre anterior/nuevo. No requiere por sí mismo cambiar `variant_key` ni un trigger, pero debe definirse cómo se presenta el nombre histórico antes de habilitarlo. |
| B. Cambiar el valor de una variante | Cambia la opción seleccionada y `variant_key`. Con historial, el trigger de identidad lo impide. Renombrar una opción utilizada también está protegido por otro trigger. | Sin historial, el editor ya permite elegir un valor y el backend valida la combinación. Con historial requiere reclasificación explícita, no renombrar un valor compartido que afecte otras variantes. |
| C. Agregar atributo | Cambia la dimensión de todas las combinaciones y todas las claves. El servicio lo bloquea con miembros; los triggers diferidos verifican completitud. | Asignación completa por cada `product_id`, unicidad, locks, revisión, auditoría e idempotencia. Para familias históricas requiere una excepción estrecha/auditada al trigger mediante migración autorizada, no deshabilitarlo globalmente. |
| D. Eliminar atributo | Puede colapsar dos combinaciones en la misma clave; existen FKs y protección histórica. | Validación previa de colisiones, confirmación y conservación de la clasificación anterior. No fusionar productos ni stocks. En históricos necesita el mismo diseño de reclasificación autorizado. |

`variant_key` es la lista de IDs de opciones ordenada por atributo. Existe UNIQUE
por `(family_id, variant_key)`, PK por producto/atributo y FKs compuestas que impiden
usar valores ajenos. Las validaciones del backend no se han eliminado. Los cambios
estructurales siguen bloqueados con un texto breve y no generan combinaciones.

## Fotografías: límite del modelo actual

Solo existe `product_images(product_id, image_path, position, is_primary, ...)`.
No hay `family_id`, clasificación común/específica ni biblioteca de archivos de
familia. Las fotos “comunes” del editor son un lote de carga aplicado explícitamente
a artículos marcados: hoy cada artículo recibe una copia física independiente.
Una vez guardadas, no hay un dato fiable para distinguir esas copias de fotografías
específicas. No se puede inferir que una foto del primer producto sea general.

Por eso no se compone una galería usando imágenes de otras variantes: podría mostrar
una fotografía particular equivocada o exponer fotos de una variante inactiva.
El detalle y la tarjeta conservan únicamente las fotos del artículo seleccionado,
su principal y su orden. Seleccionar otra variante cambia esas fotos. No se borran
archivos por cambiar de variante ni se inventan asociaciones.

Para cumplir una galería general persistente sin copias se requiere autorizar una
relación de imágenes de familia y su ciclo de vida (tabla/referencia, orden y
principal), sin asignar automáticamente fotos antiguas como generales. El backend
debe devolver `generalImages` por separado. El frontend podría componer generales
más específicas de la seleccionada, deduplicar por referencia de archivo y dar
prioridad a la principal específica. La eliminación física solo sería válida sin
referencias en productos ni familias. Requiere migración y pruebas; no se implementa
ni se añade una tabla en esta tarea.

No se cambian despachos, cotizaciones, Webpay ni las migraciones 0031/0032.

## Validación de esta revisión

- Frontend completo: 169 pruebas correctas (6 nuevas).
- Backend unitario: 40 pruebas correctas.
- Integración de productos: clúster temporal 55447; creación simple/familiar,
  conversión, imágenes, rollback, idempotencia, concurrencia, ENTRY, estados,
  promociones, ventas, devoluciones y Webpay simulado. Incluye siete intentos de
  reclasificación incompatibles, todos rechazados sin cambios parciales.
- Integración de cotizaciones 3A/3B: clúster temporal 55448, sin pagos ni correo real.
- ESLint frontend, TypeScript `--noEmit`, builds frontend/backend y diff checks.
- Navegador con API aislada: creación simple con foto y stock 7; familia con dos
  artículos y stocks 5/9; decisión de una variante y conversión explícita; preview;
  foco, Escape y retorno; edición individual y ambos temas. Sin desbordamiento en
  320, 360, 375, 400 y 1280 px. No se guardó una tercera variante de prueba.
- El primer `initdb` fue rechazado por el sandbox de Windows; se repitió el mismo
  lanzador aislado con autorización. No se recurrió a las bases habituales.

Los fallos 500/502/SMTP de los tests son inyecciones deliberadas para comprobar
rollback/recuperación. Vite conserva su advertencia no bloqueante de bundle grande.
Los clústeres de pruebas se detuvieron y eliminaron; no se aplicaron migraciones ni
escrituras a 5432/5433. No se modificó el lanzador antiguo `test-part-a.mjs`.
