# Demo académica: tercera ronda UX

## Creación e inventario

Se conserva `POST /product-families/bundle`, su transacción, auditoría, operación idempotente y recuperación. No cambia el contrato de inventario.

| Stock inicial | Acción simple | Resultado |
| --- | --- | --- |
| Vacío | Guardar y registrar entrada → | Se crea con stock cero y se abre el formulario existente de entrada. Todavía no se registra un movimiento adicional. |
| Cero explícito | Guardar y revisar existencias → | Se revisa el SKU guardado. No existe una entrada de cero unidades. |
| Positivo | Guardar y revisar entrada → | Se revisan el stock persistido y la cantidad inicial ya registrada, sin volver a sumarla. |

Las familias usan las mismas etiquetas en plural según sus cantidades. Tras guardar se muestra una revisión de los SKU reales, con su ID, stock y entrada inicial conocida. Cada variante permite abrir explícitamente el formulario de una nueva entrada; los SKU inactivos no reciben un atajo que eluda las restricciones existentes. No se propaga el stock de una variante a otra. La conversión conserva su confirmación y no recibe stock inicial en el SKU original.

La revisión posterior es de lectura: cerrarla no deshace el guardado confirmado. En recuperación sin el payload original no se inventa una cantidad inicial. Si falla la consulta posterior, se indica que el guardado ya se confirmó y que debe consultarse Inventario, sin volver a crear el producto.

Cuando se inició desde una categoría, la revisión conserva el acceso a agregar otro producto en esa misma categoría, utilizando el flujo existente y sin duplicar el guardado anterior.

## Categoría de origen

El botón de regreso del producto y el de entrada usan layout normal, no `position: fixed`. El título de conversión prevalece sobre el estado del flujo rápido. Se conserva en memoria el formulario, sus imágenes pendientes y el borrador de variantes al volver a categoría. Si se recupera una conversión, se vuelve a consultar el SKU y solo se reutiliza el borrador con la misma revisión; de lo contrario se exige revisar la información vigente. No se persisten estos borradores en almacenamiento del navegador.

## Scroll y contexto

- `ClientScrollRestoration` se monta una vez en Root y actúa únicamente sobre rutas cliente.
- Una navegación nueva comienza arriba; no se reinicia por render, selección de variante ni reemplazo de parámetros de búsqueda.
- POP, recarga y regreso contextual recuperan coordenadas por entrada del historial. El catálogo también conserva filtros, orden y paginación de esa entrada.
- Durante una restauración se reserva temporalmente altura antes de pintar, evitando que una carga corta/asíncrona recorte la posición guardada. Observadores liberan esa reserva al completarse el contenido. La interacción manual la cancela; hay un límite de seguridad de 20 segundos para contenido que nunca termina de cargar.
- Se consideran window y ancestros desplazables del contenido principal, sin restaurar arbitrariamente el interior de tablas, menús ni modales.
- Se evita competir con la restauración automática del navegador y con los antiguos reinicios locales de las páginas informativas. Se conserva el desplazamiento intencional a los resultados del catálogo al buscar o cambiar de página.
- Los metadatos de scroll se acotan a 60 entradas por pestaña; el contexto público de catálogo, a 40. No se guardan tokens, hashes de seguimiento, credenciales, direcciones ni datos de checkout en esos registros.
- Los enlaces contextuales rechazan destinos externos y retornos a la misma página; una visita directa conserva el fallback seguro al catálogo.

## Encabezados e invitados

Los encabezados cliente usan columnas simétricas en móvil: el título permanece centrado independientemente de la flecha. La flecha tiene fondo naranja, icono blanco, nombre accesible y área de 44 px; escritorio conserva texto y presentación. Sin botón de regreso, el título ocupa el ancho disponible. Los invitados sin compras ven **Explorar catálogo**; con compras tienen el regreso contextual en el encabezado. No se modificaron cookies, tokens ni permisos de consulta.

## Verificación

```bash
node --test frontend/tests/*.test.mjs
(cd frontend && npm run lint && npm run build)
(cd backend && npm run build)
git diff --check
```

El arnés existente ahora incluye la tercera ronda. Usa los componentes reales compilados, pero intercepta todas las API. Requiere una instalación existente de Playwright/Chromium; no añade dependencias al proyecto:

```bash
FYF_PLAYWRIGHT_MODULE='/ruta/a/node_modules/playwright' \
FYF_BROWSER_EXECUTABLE='/ruta/a/chrome' \
node frontend/tests/academic-ux-stage2.browser.mjs
```

Comprueba temas claro/oscuro, 320/360/375/400/1280 px, encabezados centrados, regreso, stock vacío/cero/positivo, conversión, borrador de categoría/familia, flechas y botones sin desbordamiento, catálogo con carga asíncrona, POP, recarga, contexto y filtros. También conserva las regresiones de la segunda etapa. Las capturas quedan en un directorio temporal fuera de Git. No equivale a persistencia real.

La persistencia se verifica separadamente con el runner PostgreSQL 16.15 temporal existente, puerto 55447:

```bash
cd backend
PG_TEST_BIN='/ruta/a/PostgreSQL-16.15/bin' node scripts/test-product-bundles.mjs
```

Incluye creación simple y de variantes, cero sin movimiento, positivo con exactamente una entrada, concurrencia, reintentos, recuperación, rollback y conversión sin sumar stock al original. Los pagos son simulados; los correos están aislados en el proceso de pruebas. No conecta a las bases habituales ni a la universidad.

## Revisión manual pendiente

Comprobar Android/iOS físicos, conexiones lentas y documentos con imágenes que cambien mucho de altura. Si el contenido anterior deja de existir, la posición se limita a la altura actual; no se reconstruye información eliminada. No se ha desplegado ni reiniciado PM2. No hay migraciones ni cambios de backend de producción.

## Archivos

Nuevos:

- `frontend/src/components/ClientScrollRestoration.jsx`
- `frontend/src/components/CreatedProductsStockDialog.jsx`
- `frontend/src/helpers/creationStock.js`
- `frontend/src/helpers/routeScroll.js`
- `frontend/tests/academic-ux-stage3.test.mjs`
- `docs/academic-ux-stage3.md`

Modificados:

- `backend/tests/unifiedCreation.integration.mjs`
- `frontend/src/components/ClientNavbar.jsx`
- `frontend/src/components/InformationNavigation.jsx`
- `frontend/src/components/ProductBundleEditor.jsx`
- `frontend/src/helpers/catalogNavigation.js`
- `frontend/src/helpers/informationNavigation.js`
- `frontend/src/helpers/productBundleForm.js`
- `frontend/src/pages/CatalogPage.jsx`
- `frontend/src/pages/ClientAccountPage.jsx`
- `frontend/src/pages/ClientOrdersPage.jsx`
- `frontend/src/pages/DeliveryConditionsPage.jsx`
- `frontend/src/pages/FavoritesPage.jsx`
- `frontend/src/pages/GuestDeviceOrdersPage.jsx`
- `frontend/src/pages/ProductsPage.jsx`
- `frontend/src/pages/ReturnsInformationPage.jsx`
- `frontend/src/pages/Root.jsx`
- `frontend/src/styles/styles.css`
- `frontend/tests/academic-ux-stage2.browser.mjs`
- `frontend/tests/academic-ux-stage2.test.mjs`
- `frontend/tests/catalog-detail-navigation.test.mjs`
- `frontend/tests/final-polish.test.mjs`
- `frontend/tests/fixtures/academic-ux-stage2.jsx`
- `frontend/tests/returns-navigation-and-mobile-notice.test.mjs`
- `frontend/tests/variant-admin-final.test.mjs`
