# Segunda etapa UX de demostración académica

No requiere migraciones, cambios de configuración ni código de backend de producción.

## Decisiones

- La creación simple ya envía `initialStock` al guardado transaccional del conjunto y registra su entrada. Se oculta la acción rápida de registrar entrada durante la creación nueva. El recorrido de categoría conserva la revisión de entrada para el producto ya guardado; no vuelve a sumar automáticamente el stock.
- Los tres consumidores internos de `MobileTableTools` (inventario, ventas y pedidos/repartos) reciben un borrador al abrir. Limpiar modifica ese borrador. Solo Ver resultados aplica; Cancelar, X, Escape y fondo lo descartan.
- Comprar ahora ya era independiente del carrito. Ahora transporta una intención acotada, el origen exacto (incluida la variante) y una clave UUID segura de checkout que sobrevive a recargas/inicio de sesión. No se mezcla el carrito de invitado al autenticar esa intención. Se conservan los controles de cotización, stock y pagos pendientes del backend.
- No se almacenan destinatarios ni cotizaciones en almacenamiento persistente del navegador. El borrador en memoria conserva datos al consultar condiciones y regresar, con aislamiento por sesión. Una recarga conserva la selección directa y su clave mediante el estado de navegación, pero puede requerir volver a introducir datos personales no guardados.
- La dirección de cuenta sigue siendo única. Reutilizar o Usar otra dirección no escribe en la cuenta. La casilla opcional usa `saveDeliveryAddress` del checkout existente; si había una dirección solicita confirmación de reemplazo. Se guarda al crear el pedido, no al marcar la casilla ni al aprobar Webpay. Editar posteriormente los datos del reemplazo exige confirmarlo otra vez. Invitados no ven esta opción.
- El carrusel acepta gestos táctiles horizontales deliberados, con umbral y límite temporal, sin bloquear scroll vertical/zoom ni controles embebidos. Mantiene puntos/temporizador, pausa durante el gesto y respeta movimiento reducido. No se añadió arrastre de mouse; se admite teclado con flechas.
- `CompactBackLink` conserva destino/estado contextual y muestra flecha accesible de 44 px en móvil; texto en escritorio.

## Verificación reproducible (Git Bash)

```bash
node --test frontend/tests/*.test.mjs
(cd frontend && npm run lint && npm run build)
(cd backend && npm run build)
```

El arnés de navegador no añade dependencias al proyecto: requiere una instalación existente de Playwright y Chromium/Chrome. Ajustar las rutas al equipo:

```bash
FYF_PLAYWRIGHT_MODULE='/ruta/a/node_modules/playwright' \
FYF_BROWSER_EXECUTABLE='/ruta/a/chrome' \
node frontend/tests/academic-ux-stage2.browser.mjs
```

Compila los componentes reales con Vite en memoria. Intercepta todos los recursos/API; no conecta a servicios reales. Verifica ambos temas, anchos 320/360/375/400/1280, borrador de filtros, cancelación/Escape/foco, encabezados de familia, compra directa/invitado, recarga, dirección/reemplazo, regreso informativo y carrusel táctil/teclado. Las capturas se guardan fuera del repositorio, en un directorio temporal informado por el comando. Estas pruebas no equivalen a persistencia real.

La persistencia de dirección se comprueba en `backend/tests/localDelivery.integration.mjs`, usando exclusivamente el runner desechable existente:

```bash
cd backend
PG_TEST_BIN='/ruta/a/PostgreSQL-16.15/bin' \
DELIVERY_TEST_SCOPE=local node scripts/test-delivery-tariffs.mjs
```

El runner usa únicamente un clúster temporal en 127.0.0.1:55446, pagos dobles de prueba y correos aislados. Incluye guardar primera dirección, no guardar un destino de pedido, reemplazar dirección y reintentar sin sobrescribir una edición posterior; conserva el snapshot del pedido y rechaza otra comuna/rol.

## Límites

- Navegador probado con Chromium de escritorio y emulación táctil; queda la comprobación manual en Safari/iOS y Android físicos.
- No se ha desplegado, reiniciado PM2 ni accedido a la base universitaria. PostgreSQL 13.23 no necesita cambios de esquema para esta etapa.
- La dirección de cuenta conserva el contrato existente, sin revisión optimista entre dispositivos. No se ha introducido un nuevo editor de direcciones ni alterado ese contrato.

## Archivos de esta etapa

Producción frontend:

- `frontend/src/components/CompactBackLink.jsx` (nuevo)
- `frontend/src/components/InformationNavigation.jsx`
- `frontend/src/components/MobileTableTools.jsx`
- `frontend/src/components/ProductBundleEditor.jsx`
- `frontend/src/components/ProductPurchaseControls.jsx`
- `frontend/src/components/CatalogNoticeCarousel.jsx`
- `frontend/src/helpers/checkoutIntent.js`
- `frontend/src/helpers/carouselSwipe.js` (nuevo)
- `frontend/src/pages/ProductsPage.jsx`
- `frontend/src/pages/SalesPage.jsx`
- `frontend/src/pages/OnlineOrdersManagementPage.jsx`
- `frontend/src/pages/CheckoutChoicePage.jsx`
- `frontend/src/pages/CheckoutPage.jsx`
- `frontend/src/pages/ClientOrdersPage.jsx`
- `frontend/src/pages/FavoritesPage.jsx`
- `frontend/src/pages/DeliveryConditionsPage.jsx`
- `frontend/src/pages/ReturnsInformationPage.jsx`
- `frontend/src/styles/styles.css`

Pruebas y documentación:

- `backend/tests/localDelivery.integration.mjs`
- `frontend/tests/academic-ux-stage2.test.mjs` (nuevo)
- `frontend/tests/academic-ux-stage2.browser.mjs` (nuevo)
- `frontend/tests/fixtures/academic-ux-stage2.jsx` (nuevo)
- `frontend/tests/cart-clear-undo.test.mjs`
- `frontend/tests/direct-purchase-and-visual-regressions.test.mjs`
- `frontend/tests/final-polish.test.mjs`
- `frontend/tests/returns-navigation-and-mobile-notice.test.mjs`
- `docs/academic-ux-stage2.md` (nuevo)
