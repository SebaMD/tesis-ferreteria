# Etapa UX 6 — demostración académica FYF

## Alcance y estado de partida

Revisión local de la rama `feature/tarifas-despacho`, sobre HEAD
`650a97617a41b7e5cbda140255c4209de9458448`. Al comenzar, el directorio de trabajo
y el índice estaban limpios. No se ejecutaron staging, commits, push, despliegues,
seed, migraciones ni conexiones a PostgreSQL universitario o habitual.

Se conservaron las imágenes del catálogo, los contratos de creación, los movimientos
de inventario, la compra directa, el carrito, las direcciones y las protecciones de pago.
El único ajuste de backend es una condición en el helper informativo de gratuidad,
explicada abajo; no cambia tablas, tarifas ni importes históricos.

## 1. Capturas frente a la implementación actual

| Captura del 03-11-2026 | Diagnóstico del repositorio y decisión |
| --- | --- |
| 151012 | El encabezado de opciones de compra tenía un hijo flexible junto al regreso: su centro no era el centro de ambas tarjetas. Corregido solo en escritorio. |
| 163437 | El éxito de una entrada enlazada conservaba el modal «Registrar entrada». En el origen resumen ahora se vuelve al resumen con confirmación y stock actualizado. |
| 155708 | Las acciones laterales del producto simple y la ausencia de guardar duplicado ya estaban implementadas. Se conservaron. |
| 161156 | El footer de variantes reservaba tres columnas aunque con acciones externas solo había dos botones. Ahora son dos columnas iguales. |
| 161730 | Los dos botones del pie adaptado podían tener distinta altura al envolver el texto. Ahora se estiran a la misma altura, manteniendo texto y flechas. |
| 161945 | El campo de opción usa `input` con `datalist` nativo, no un tooltip personalizado. Se cierra la sugerencia al desplazar su contenedor o redimensionar, sin borrar el valor. Los menús portados de `AppSelect` también se cierran al mover el ancla. |
| 162318 | El resumen consolidado ya existía y era apropiado. Se reutiliza como pantalla final, sin añadir un tercer paso. |
| 162903 | «Volver a producto» no distinguía la entrada abierta desde el resumen. Ahora vuelve a «Productos guardados», sin abrir un editor individual. |
| 164413 | Conservar administrativamente la única imagen y ocultarla al suspender el despacho es comportamiento intencional actual. Dos imágenes independientes no caben en la persistencia actual; se documenta el cambio pendiente, sin migración. |

No se comprobó qué build sirve actualmente PM2: no se accedió al servidor. Por tanto,
no se atribuye ninguna captura de forma concluyente a un despliegue antiguo.
`git pull` por sí solo no reconstruye los archivos estáticos de Vite. Las correcciones
ya presentes —acciones externas, pie móvil, imagen suprimida y resumen existente—
no se reimplementaron como funcionalidades nuevas.

## 2. Flujo rápido de categoría, productos y entradas

- Se mantiene la distinción vacío / cero explícito / cantidad positiva y el cálculo
  por SKU. La creación sigue usando el contrato transaccional existente.
- La creación nueva con variantes comienza con dos borradores independientes. El
  segundo no copia precio, stock ni opciones. Los campos obligatorios siguen
  validándose: no se envían variantes vacías. Edición de familias, conversión y
  borradores recuperados conservan sus filas existentes.
- Los dos botones interiores de variantes usan todo el ancho útil; guardar continúa
  en las acciones externas o en el pie adaptado según el espacio real disponible.
  No se fuerza una acción lateral cuando no cabe alrededor del modal.
- Desde el resumen, abrir una entrada conserva la familia y todos sus SKU.
  «Volver a productos guardados», «Volver al resumen», X, Escape o cierre sin guardar
  recuperan ese resumen y no crean movimientos.
- Al confirmar, se usa `movement.stock.currentStock` devuelto por el servidor para
  actualizar solo el SKU correspondiente. No se suma otra vez el stock inicial.
  El resumen muestra «Entrada registrada correctamente» y permite ingresar unidades
  nuevas a otra variante. «Finalizar» y «Agregar otro producto a esta categoría»
  permanecen como acciones finales; no se añade «Ver resumen final».
- El producto simple con stock vacío, creado desde categoría, conserva el paso
  directo para registrar entrada, pero su regreso y su éxito también usan el resumen.
  Los orígenes de Inventario ajenos a ese resumen mantienen su contexto anterior.
- Una guarda síncrona bloquea confirmaciones simultáneas, además del estado disabled.
  Si falla refrescar el listado después de un POST confirmado, se advierte que no
  debe repetirse la entrada, en vez de tratarla como un POST fallido.
- Si la conexión o un 5xx deja incierto el resultado, se vuelve al resumen, se
  identifica el stock como último confirmado y se bloquea una nueva entrada para
  ese SKU desde ese resumen. Se pide consultar historial/stock, sin reintento automático.

### Límite importante de idempotencia

El endpoint actual de movimientos no admite una clave durable de idempotencia.
Estas protecciones evitan doble clic, escrituras por regresar y reintentos automáticos;
no equivalen a una garantía «exactamente una vez» entre recargas, pestañas o clientes
distintos. No se cambió ese contrato sin aprobación. Una recuperación durable de
resultados inciertos requeriría diseñar la clave y consulta de resultado en backend
con sus pruebas transaccionales. Tras un resultado incierto, verificar el historial
antes de iniciar manualmente otra operación desde Inventario.

## 3. Navegación, carrito y exploración

- El toast «Ver carrito» y los enlaces al carrito de la barra transmiten un origen
  interno mediante el helper contextual existente. El carrito ofrece un regreso
  accesible al producto/variante, listado o sección de origen, sin `navigate(-1)`.
  La entrada directa o un origen inválido usa Catálogo como alternativa segura.
- Se guarda en `sessionStorage` el último contexto de exploración: ruta permitida
  de catálogo/ficha, variante, búsqueda, filtros, orden, página, tamaño y posición.
  No se copian tokens, datos del checkout ni datos personales del formulario.
- Desde Compras, Favoritos o Carrito, la pestaña «Catálogo» retoma ese contexto.
  Si el último contexto era una ficha familiar, vuelve a la misma variante.
- Estando ya en el catálogo o en una ficha, «Catálogo» lleva al listado. La marca
  del encabezado y los enlaces de estados vacíos también permiten abrir el listado.
  «Explorar desde cero» limpia búsqueda, filtros, orden y página y comienza arriba.
- Las flechas «Volver» mantienen su origen explícito. Atrás del navegador conserva
  la restauración por entrada; una navegación nueva comienza arriba salvo retorno
  explícito. Se reutiliza el mecanismo de scroll existente, incluida la espera de
  contenido asíncrono y contenedores desplazables.
- La memoria se identifica por rol e ID de cuenta (o invitado), se limpia al cambiar
  sesión y rechaza snapshots de otro propietario. El contenido del catálogo se
  reinicia al cambiar de propietario aun si la ruta permanece montada.
  Si el almacenamiento no está disponible se usa memoria, sin impedir la navegación.
- No se cambiaron las operaciones del carrito, su persistencia, compra directa,
  aceptación de resumen, cotización, dirección guardada ni inicio de Webpay.

## 4. Avisos y dependencia de gratuidad

### Cambios seguros implementados

El panel deshabilita la opción de gratuidad y la edición del umbral cuando el despacho
está suspendido, explicando que el monto se conserva. La revisión tampoco promete
gratuidad en ese estado. Al reactivar se reutiliza la configuración conservada.

En backend, `calculateDelivery` ya rechazaba un despacho suspendido antes de calcular
su tarifa; el aviso público ya comunicaba suspensión. Sin embargo, `deliveryBenefit`
podía devolver un beneficio informativo activo sin comprobar `deliveryEnabled`.
Se añadió esa comprobación. No se altera la comparación estricta del subtotal neto,
la cobertura, la tarifa, las solicitudes históricas o los pedidos existentes.

### Dos imágenes: pendiente de aprobación, no implementado

`catalogPresentation` tiene únicamente `deliveryImagePath` y
`deliveryImageRevision`. La proyección pública usa la imagen solo para el aviso
`LOCAL_FIXED`; la administración conserva `savedImageUrl` cuando está suprimida.
No se puede conservar dos archivos independientes por estado utilizando un único
campo sin sobrescritura o un almacenamiento paralelo improvisado.

Propuesta mínima para una etapa autorizada:

1. Añadir una referencia nullable para la imagen de suspensión en la misma
   configuración singleton, sin modificar la referencia existente de disponibilidad.
2. Ampliar las operaciones actuales de imagen con un destino explícito validado
   (disponible/suspendido), reutilizando permisos, almacenamiento, validación y
   control de revisión. Revisar si la revisión común serializa ambos cambios.
3. Proyectar exclusivamente la imagen del estado real; no aceptar textos comerciales
   editables ni crear otro aviso manual.
4. Probar migración incremental, concurrencia, sustitución y retirada de cada imagen
   en PostgreSQL aislado antes de solicitar aplicación en cualquier base existente.

No se creó ninguna migración, no se alteró el esquema ni se guardó una segunda
imagen. Por ahora, la imagen promocional continúa oculta al suspender el despacho,
conservada y reutilizable al habilitarlo: es la alternativa segura existente.

## 5. Verificación ejecutada

| Comprobación | Resultado / alcance |
| --- | --- |
| Frontend `node --test tests/*.test.mjs` | 331 aprobadas, 0 fallos. Incluye seis pruebas nuevas de etapa 6 y regresiones existentes. Algunas pruebas verifican estructura del código; no se presentan como UI o persistencia. |
| Frontend ESLint | Aprobado. |
| Frontend Vite build | Aprobado. Advertencia de tamaño de chunk mayor de 500 kB; no se hizo un refactor ajeno a la tarea. El frontend es JS/JSX, sin comando TypeScript independiente configurado. |
| Backend `npm run build` | Aprobado (`tsc`). |
| Backend cinco archivos unitarios indicados abajo | 8 pruebas aprobadas: precios locales e históricos, autorización manual, imágenes y ciclo de Webpay. No se contactó Webpay ni PostgreSQL. |
| Chromium local, APIs interceptadas | Aprobado: recorridos y geometría en 320, 360, 375, 400, 1280 y 1440 px, temas claro/oscuro; invitado/cliente, filtros, foco/Escape, compra directa, dirección y retorno informativo. Sin errores de ejecución del navegador ni desbordamientos detectados en los casos recorridos. |
| `git diff --check` | Aprobado. |

El navegador usa componentes reales y respuestas HTTP simuladas, con solicitudes
externas bloqueadas. Se verifican transiciones, cantidad de POST y datos enviados;
no se afirma persistencia transaccional en una base real. Los tests de imágenes
unitarios usan archivos temporales locales. No se ejecutó seed ni una integración
que escribiera sobre PostgreSQL habitual o universitario.

Casos específicos añadidos a Chromium: dos variantes iniciales; volver a categoría
y recuperar el borrador; pie adaptable sin superposición; retorno de entrada sin
POST; doble clic con un solo POST; entrada en dos SKU con stocks independientes;
respuesta incierta sin repetición; producto simple rápido hasta finalizar; toast a
carrito y regreso exacto; Compras → Catálogo recuperando ficha y variante; cierre
de sugerencias por scroll y de menús por resize. La restauración asíncrona también
se prueba con Atrás y recarga, sin afirmar que todos los cruces posibles de rol,
tema, ancho y formulario se recorrieron exhaustivamente.

La ejecución final también aprobó la transición del panel de despacho en ambos temas
y los seis anchos: deshabilitar el servicio bloquea gratuidad/umbral, revisar y guardar
conserva `freeShippingFrom: 500000`, reabrir y habilitar recupera ese valor, y Escape
descarta la reactivación sin otro PUT. Se utilizaron identidades simuladas ADMIN y
MANAGER; no se guardó ninguna revisión en una base real.

Se inspeccionaron visualmente las capturas de escritorio claro y móvil oscuro del
encabezado de opciones, carrito de invitado/cliente, pie de variantes a 320/1440 y
resumen con dos SKU y stocks 7/3. Las capturas de esa ejecución están en el directorio
temporal `C:/Users/Sebastian/AppData/Local/Temp/fyf-academic-ux2-hJWSRZ` (no se incorporan
al repositorio). La última ejecución completa, incluyendo la transición de despacho,
aprobó y guardó sus capturas en `C:/Users/Sebastian/AppData/Local/Temp/fyf-academic-ux2-cakEX8`.
Una ejecución intermedia se interrumpió por timeout de captura de
pantalla; la repetición completa aprobó. Dos expectativas de estructura de pruebas
se actualizaron por el nuevo destino del NavLink y la lectura del catálogo por cuenta,
sin eliminar casos de comportamiento.

### Límites de comprobación y revisión manual

- Falta revisar el build efectivamente servido por el servidor y sus recursos
  estáticos; no se desplegó ni reinició PM2.
- ADMIN/MANAGER se conservan en contratos y permisos existentes. Las identidades
  simuladas del panel no sustituyen pruebas reales con ambas cuentas y PostgreSQL.
- No se efectuó un pago Webpay real ni una escritura de inventario persistida.
- El popup nativo de `datalist` no es inspeccionable como un tooltip DOM: se comprueba
  que pierde foco y conserva el valor al desplazar. Revisar también con el teclado
  del celular utilizado en la defensa; no se afirma equivalencia con Safari móvil.
- Dos imágenes por estado y recuperación durable/idempotente de una entrada
  incierta quedan pendientes del diseño y autorización descritos arriba.

## 6. Archivos de esta etapa

Backend:

- `backend/src/modules/deliverySettings/deliveryPricing.ts`
- `backend/tests/localDelivery.unit.mjs`

Frontend, componentes y contexto:

- `frontend/src/components/AppSelect.jsx`
- `frontend/src/components/ClientNavbar.jsx`
- `frontend/src/components/ClientScrollRestoration.jsx`
- `frontend/src/components/CreatedProductsStockDialog.jsx`
- `frontend/src/components/DeliverySettingsManager.jsx`
- `frontend/src/components/ProductBundleEditor.jsx`
- `frontend/src/context/AuthProvider.jsx`

Helpers, hook, páginas y estilos:

- `frontend/src/helpers/catalogNavigation.js`
- `frontend/src/helpers/createdProductsStock.js` (nuevo)
- `frontend/src/helpers/explorationNavigation.js` (nuevo)
- `frontend/src/helpers/productBundleForm.js`
- `frontend/src/helpers/routeScroll.js`
- `frontend/src/hooks/useCartActions.js`
- `frontend/src/pages/CatalogPage.jsx`
- `frontend/src/pages/CheckoutChoicePage.jsx`
- `frontend/src/pages/ClientCartPage.jsx`
- `frontend/src/pages/ProductsPage.jsx`
- `frontend/src/styles/styles.css`

Pruebas y documentación:

- `frontend/tests/academic-ux-stage2.browser.mjs` (suite existente ampliada)
- `frontend/tests/fixtures/academic-ux-stage2.jsx`
- `frontend/tests/academic-ux-stage6.test.mjs` (nuevo)
- `frontend/tests/catalog-detail-navigation.test.mjs`
- `frontend/tests/returns-navigation-and-mobile-notice.test.mjs`
- `docs/academic-ux-stage6.md` (nuevo)

## 7. Comandos locales exactos — Git Bash

Desde la raíz del repositorio, con las dependencias ya instaladas:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --stat

(cd frontend && node --test tests/*.test.mjs)
(cd frontend && npm run lint)
(cd frontend && npm run build)
(cd backend && npm run build)
(cd backend && node --test \
  tests/localDelivery.unit.mjs \
  tests/deliveryPricing.unit.mjs \
  tests/manualDeliveryAuthorization.unit.mjs \
  tests/customerNoticeImages.unit.mjs \
  tests/webpayLifecycle.unit.mjs)

(
  cd frontend &&
  FYF_PLAYWRIGHT_MODULE='C:/Users/Sebastian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright' \
  FYF_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe' \
  node tests/academic-ux-stage2.browser.mjs
)

git diff --check
git status --short
git diff --cached --stat
```

Las dos rutas de Playwright/Chrome son las instalaciones verificadas en este
computador, no rutas de producción. El script imprime el directorio temporal de
capturas. No necesita iniciar backend, conectar una base o instalar otra dependencia
en el proyecto. Los builds generan los `dist` ignorados habituales; no se preparan
para Git. No ejecutar migraciones, seed ni importadores para comprobar esta etapa.

Antes de una actualización manual del servidor, revisar estos cambios y construir
el frontend/backend con los comandos normales del proyecto. Verificar qué artefactos
y proceso sirve realmente PM2; no se inventan aquí nombres de procesos ni órdenes
de reinicio. Este informe no es una autorización ni una ejecución de despliegue.

## 8. Git al finalizar

Se mantiene la rama `feature/tarifas-despacho` y el mismo HEAD inicial. El índice
continúa vacío: 22 archivos modificados sin preparar y 4 archivos nuevos, incluidos
este informe y los tres helpers/pruebas nuevos enumerados arriba. No se modificaron
commits existentes, `.env`, imágenes del catálogo, configuraciones de PM2, correo,
Webpay o conciliación. Los comandos de comprobación de Git son de solo lectura.
