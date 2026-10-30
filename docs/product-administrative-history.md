# Historial de cambios administrativos de Inventario

## Alcance

Nuevo acceso ADMIN en Historial de inventario, a la derecha de los filtros.
Abre una consulta de solo lectura; no agrega auditorías ni altera operaciones de
edición. No requiere migración. Las migraciones 0037/0038 previas no se aplicaron
a bases habituales durante esta tarea.

## Fuentes inspeccionadas

La fuente de cambios de catálogo es `product_family_events`. No se duplicó en una
tabla nueva. `users`/`roles` se consultan para permisos y nombre visible del actor;
no se usa el producto actual para reconstruir valores anteriores faltantes.
El ID del actor es el registrado; su nombre visible procede de la cuenta vigente,
no de una instantánea de su nombre en la fecha del evento.

| Registro | Información disponible y límites |
|---|---|
| PRODUCT_NAME_CORRECTION | Producto anterior, nombre nuevo, actor, motivo y fecha. |
| FAMILY_BRAND_AUTHORIZATION/CORRECTION | Estado anterior y resultado vinculado; marca anterior/nueva, miembros, actor, motivo y fecha. Se presenta una entrada. |
| FAMILY_CATEGORY_CHANGE | Categorías anterior/nueva capturadas, miembros, actor, motivo y fecha. |
| ATTRIBUTE_RENAME | ID/nombre anterior/nuevo del atributo, actor, motivo y fecha. |
| OPTION_LABEL_AUTHORIZATION/CORRECTION | Etiquetas anterior/nueva y miembros afectados, con autorización vinculada. Una entrada. |
| DIMENSION_ADD_AUTHORIZATION/ADD | Atributo/opciones nuevos, clasificación anterior y asignaciones registradas. Una entrada. |
| CONVERT_SIMPLE y BUNDLE_SAVE vinculados por clave | Producto original, atributos asignados, stock conservado y artículos guardados. Una entrada de conversión, conservando IDs/tipos de los eventos de origen. |
| BUNDLE_SAVE/SIMPLE_SAVE | Artículos anteriores/posteriores cuando existen. Motivo automático, no motivo individual de cada campo. Algunos metadatos familiares posteriores no se capturaron. |
| DETACH | Asociación/clasificación anterior y desvinculación, motivo, actor y fecha. |
| ARCHIVE/REACTIVATE | Estado de archivado anterior/posterior. Motivo automático; usuario solo si quedó registrado. |
| Asociación sin `next.operation` | Se muestra como asociación por la estructura existente y se informa que el tipo no estaba registrado. No se deduce su pertenencia a otro comando por una mera coincidencia temporal. |
| Tipos desconocidos/autorizaciones sin resultado vinculado | Se preserva la referencia y el tipo original, sin revelar el payload ni inventar diferencias o éxito. |

Otras fuentes revisadas no se mezclan con esta consulta: `inventory_movements`
describe existencias; `commercial_identity_snapshots` conserva identidad comercial;
`delivery_quote_events`, revisiones de política de despacho y solicitudes de
anulación pertenecen a procesos comerciales distintos, algunos con información de
clientes. No son un registro de correcciones del catálogo.

No existe auditoría completa uniforme para todos los PATCH comerciales, imágenes,
cambios de estado o edición genérica de familias. No se fabrican eventos faltantes.
La consulta no promete que todas las auditorías antiguas sean inmutables: conserva
las protecciones existentes, sin ampliar ni relajar triggers.

## Contrato

`GET /api/product-audits`, ADMIN en middleware y comprobación de usuario activo/rol
en servicio. No existen métodos de escritura para este recurso.

Parámetros opcionales:

- `operation`: tipo de la entrada administrativa, del catálogo devuelto por API.
- `productId`, `familyId`: enteros positivos. Producto también considera listas
  de miembros capturadas y artículos de una conversión vinculada; no se calcula
  con las asociaciones actuales del catálogo.
- `from`, `to`: AAAA-MM-DD, días UTC, fin inclusive. La UI lo indica explícitamente.
- `limit`: 1–100, predeterminado 25; la UI ofrece 10/25/50.
- `cursor`: opaco base64url con fecha exacta de seis decimales e ID.

Orden PostgreSQL `created_at DESC, id DESC`, paginación keyset y `LIMIT n+1`.
No se descargan todos los eventos ni se realiza paginación en memoria. No se
expone un total estimado como si fuera exacto. Una nueva entrada reciente no
desplaza ni repite filas de la página siguiente. Al cambiar filtros se vuelve
a la primera página. Cada consulta usa transacción REPEATABLE READ / READ ONLY,
sin locks administrativos, inserciones de auditoría ni efectos operativos.

La respuesta contiene IDs, fecha, tipo/etiqueta, sujeto, actor, motivo, diferencias
permitidas, límites de información y procedencia. Autorizaciones/resultados se
agrupan solo mediante sus referencias/clave de comando verificadas. Se conservan
sus IDs/tipos de origen, pero **nunca se devuelve la clave idempotente**.

## Protección de información

Proyección por lista permitida, no serialización de `previous`/`next`. Se excluyen
hashes, revisiones internas, claves de recuperación, archivos/imágenes/rutas,
contraseñas y objetos de clientes. Solo se toma el nombre visible del actor, no
su correo, RUT, teléfono ni credenciales. Se ocultan patrones de credenciales,
correo, enlaces, RUT y teléfonos en textos mostrados. React escapa el contenido;
no se usa HTML proporcionado por el evento.

Los motivos son texto libre administrativo: la minimización y los patrones no
constituyen un detector semántico universal de información personal. No deben
ingresarse secretos o datos de clientes en motivos. Los datos ausentes se indican
como no registrados/no aplicables; no se completan desde el catálogo vigente.

## Interfaz y archivos

- `backend/src/modules/productAudits/productAudits.dto.ts`: proyección segura.
- `backend/src/modules/productAudits/productAudits.service.ts`: permisos, filtros,
  agrupación y paginación SQL de solo lectura.
- `backend/src/modules/productAudits/productAudits.routes.ts`: ruta GET ADMIN.
- `backend/src/modules/index.ts`: registro de la ruta.
- `frontend/src/components/ProductAuditHistory.jsx`: filtros, tarjetas compactas,
  detalles nativos desplegables, motivos/valores, carga/vacío/error y paginación.
- `frontend/src/services/productAudits.service.js`: GET cancelable, sin escrituras.
- `frontend/src/pages/ProductsPage.jsx`: acceso ADMIN y apertura del diálogo.
- Pruebas nuevas: `backend/tests/productAudits.unit.mjs`,
  `backend/tests/productAudits.integration.mjs`,
  `backend/scripts/test-product-audits.mjs`, `frontend/tests/product-audits.test.mjs`.

Se reutiliza AppModal para Escape, foco y bloqueo de scroll; no se creó otro
sistema de modales. Los detalles funcionan con teclado. Filtros/páginas llevan
el foco al encabezado de resultados. Al cerrar vuelve al botón de origen.

## Verificación

- Frontend: 216/216; backend unitario: 54/54. Se conservan las pruebas previas.
- ESLint, TypeScript backend y builds aprobados; aviso existente de bundle
  frontend mayor a 500 kB, no fallo.
- Integración real en PostgreSQL **16.15**, `fyf_demo`, localhost:**55461**.
  ADMIN/roles rechazados, servicio, parámetros inválidos, fechas, IDs, empate de
  microsegundos, paginación con una inserción posterior, agrupación, datos
  ausentes, redacción y conservación de datos. Los eventos artificiales se crean
  solo para el test y se retiran; no se modifican auditorías preexistentes.
- Comparación antes/después de consultas: catálogo, snapshots, ventas, movimientos,
  pedidos, pagos, solicitudes de despacho y auditorías sin cambios.
- Navegador con API real aislada: botón, motivos/diferencias, filtros, siguiente,
  vacío, teclado, Escape y restauración de foco. Claro/oscuro en anchos
  320/360/375/400/1280 sin overflow horizontal en las vistas comprobadas.
- Error de conexión real comprobado al detener exclusivamente la API temporal de
  esta revisión: mensaje persistente y opción de reintento, sin datos obsoletos
  presentados como resultado de la consulta fallida.

El primer intento de la suite backend tuvo EACCES del sandbox en el servidor
HTTP efímero de la prueba estática de imágenes; se repitió con permiso de red
local y aprobó completa. No era un fallo de lógica del historial.

Runner de integración: requiere `TEST_DATABASE_URL` explícita para una base de
prueba localhost y puerto distinto de 5432/5433. No toma la conexión habitual
como fallback. Importa app, nunca server.ts ni conciliación. No hubo migraciones
ni accesos a bases habituales. Para volúmenes muy grandes, medir el plan de la
consulta antes de proponer índices: no se modificó el esquema para anticiparlo.

## Presentación semántica del historial

El resumen distingue incorporaciones de dimensiones, opciones, asignaciones y productos nuevos de las correcciones antes/nuevo. Los guardados mixtos separan SKU agregados y campos realmente modificados comparando IDs. La clasificación previa a una nueva dimensión no se presenta como eliminada; conversión, desvinculación y archivado tampoco significan eliminación de SKU. No existe en el contrato actual un evento de eliminación física: no se infieren eliminaciones por valores nulos ni por ausencias en una lista.

Se utilizan solo nombres y etiquetas registrados en el DTO. Las asignaciones extensas tienen una lista comprensible por producto, contraída inicialmente. Los eventos desconocidos o sin datos suficientes conservan una presentación informativa, sin reconstruir nombres. La fecha se muestra en español de Chile, zona America/Santiago y sin segundos; su valor original permanece intacto. Los filtros de fecha conservan su contrato UTC.

La vista administrativa no muestra desplegables de alcance, diagnósticos JSON, códigos, fuentes ni referencias técnicas. No se reemplazan por otra sección técnica. El DTO recibido, los contratos y los registros persistidos permanecen intactos: solo se omite su representación interna. Un evento incompleto conserva encabezado, fecha, responsable, motivo y datos verificados disponibles, con una explicación breve si no alcanza para describir valores. No cambia auditorías ni permisos.

Verificación de este pulido: pruebas de helpers/contratos frontend y navegador con API simulada (no persistencia del historial). La regresión real de unidades utiliza un PostgreSQL 16.15 temporal independiente, esquema 0036, sin acceder a bases habituales. No se modifica configuración de correos ni conciliación.
