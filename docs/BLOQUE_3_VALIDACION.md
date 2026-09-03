# Bloque 3 — implementación y validación

## Resultado

Implementado únicamente en `seba`. Sin commit, push ni merge. No se modificaron Webpay, reservas, stock, devoluciones, logística, cookies/tokens guest ni migraciones históricas 0000–0017. No se añadieron dependencias, polling, WebSockets ni cantidades fraccionarias.

## Marca y migración

- `products.brand`: `varchar(100)`, nullable. Filas existentes mantienen `NULL`.
- Crear/editar producto conserva el permiso ADMIN existente. El backend valida tipo y longitud, elimina espacios exteriores, unifica espacios interiores y convierte vacío en `null`.
- Formulario ADMIN reutilizado; marca se precarga al editar y aparece como información secundaria bajo el producto en Inventario, en ProductCard y en detalle público.
- Nueva tabla `client_product_favorites(client_id, product_id, created_at)`. PK compuesta; ambas FK usan `ON DELETE CASCADE`.
- Migración generada con Drizzle: [backend/drizzle/0018_salty_celestials.sql](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/drizzle/0018_salty_celestials.sql>). Solo crea la tabla, sus FK y agrega brand.
- Se compararon snapshots: las tablas anteriores no cambian, salvo la nueva columna brand.
- Para tu BD normal: ejecutar `npm run db:migrate` desde la carpeta backend antes de iniciar el backend actualizado. La migración solo se aplicó aquí en PostgreSQL temporal, no en tu BD normal.

### Seed: no se inventaron marcas

Los 100 productos del seed carecen de un campo de marca fiable; ninguno fue modificado. Permanecen sin marca hasta que ADMIN ingrese datos confirmados.

Casos que podrían inducir una inferencia incorrecta:

| Producto(s) existente(s) | Motivo para no inferir fabricante |
| --- | --- |
| Destornillador Phillips PH2 | Phillips/PH2 describe el tipo de punta; no prueba una marca comercial del producto. |
| Cinta teflón 12 mm | El nombre no identifica de forma fiable al fabricante/proveedor. |
| Mascarilla polvo KN95 | KN95 no identifica una marca. |
| Plancha OSB 9.5 mm; tubos/conexiones PVC | Material/tipo, no marca. |
| Ampolleta LED 12W luz fría; Linterna LED recargable; Pila alcalina AA | Tecnología o formato, no fabricante. |
| Barniz marino brillante, Látex interior blanco, Esmalte sintético blanco, Anticorrosivo rojo, Diluyente sintético | Descripciones comerciales genéricas, sin marca explícita. |
| Martillo carpintero, alicates, cemento, adhesivos y otros productos genéricos | No hay un dato de marca independiente que permita asignarla con certeza. |

## Catálogo: filtros, orden y fondo

`CatalogPage` mantiene un único objeto de filtros y un único orden. `CatalogFilters` se reutiliza en sidebar (desde 1024 px) y en `AppModal` móvil, conservando valores al abrir/cerrar. No hay otra implementación de filtros ni consultas por cada tecla.

Filtros: palabra clave, categoría, mínimo/máximo de precio, marca y disponibilidad. La disponibilidad reutiliza `getOnlineAvailableStock`: prioriza availableStock y conserva su fallback existente. Marcas se obtienen de productos reales; espacios, mayúsculas y equivalencia Unicode se normalizan para evitar opciones duplicadas. Si no hay marcas, “Todas las marcas” sigue funcionando.

Un rango inválido muestra error y no se aplica hasta corregirse; los demás filtros siguen funcionando. Vacío no equivale a cero. Limpiar filtros restablece los filtros sin recargar la página.

Ordenamiento local con `Number(price)` y `Intl.Collator("es")`; cuatro opciones reales (precio asc/desc y nombre A–Z/Z–A), desempate estable por ID. Sin paginación nueva ni rankings inventados. Se conservó el mecanismo de refresco que ya existía; no se agregó polling.

**Fondo futuro:** editar únicamente `CATALOG_BACKGROUND_IMAGE` en [frontend/src/helpers/catalogAppearance.js](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/helpers/catalogAppearance.js>). Actualmente es `null`, por lo que no se solicita una URL inexistente. Cuando tengas la imagen, puedes colocarla en frontend/public/images y asignar su URL pública allí. El contenedor único incluye filtros y cards, usa cover/no-repeat y un overlay blanco para mantener legibilidad; no aplica la imagen a cada card.

**Volver arriba:** aparece después de 600 px de scroll; escucha pasivamente y agrupa mediciones con requestAnimationFrame, actualizando React solo al cambiar visibilidad. Está abajo a la izquierda, separado del toast/carrito, con safe-area, botón de 44 px y aria-label. Respeta prefers-reduced-motion; sin movimiento suave cuando está activado. No utiliza temporizadores de polling.

## Favoritos: arquitectura, seguridad y UX

Endpoints:

| Método/ruta | Comportamiento |
| --- | --- |
| GET /api/favorites | Lista productos activos favoritos del CLIENT autenticado. |
| PUT /api/favorites/:productId | Agrega sin duplicados; repetir es idempotente. |
| DELETE /api/favorites/:productId | Quita solo la relación del CLIENT; repetir es idempotente. |

Todos usan authenticateJwt + verifyRoles CLIENT. El propietario proviene exclusivamente de `req.user.id`. Body/query no pueden asignar otra cuenta: las mutaciones rechazan parámetros extra y la lista no utiliza client_id de query. IDs inválidos se rechazan. Sin sesión: 401; otros roles: 403.

Un producto desactivado conserva su relación pero no aparece en la lista comprable ni puede agregarse como favorito nuevo. Si se elimina físicamente, la FK elimina su relación. El servicio reutiliza el DTO público y el cálculo existente de disponibilidad del catálogo.

`FavoritesProvider` comparte productos/selección/carga por sesión, evita doble operación simultánea sobre un corazón y descarta respuestas de una sesión anterior. No guarda favoritos guest ni utiliza localStorage para persistir favoritos. Revalida al entrar a Favoritos y comparte solicitudes en curso para evitar duplicaciones; sin polling nuevo.

`FavoriteButton` se reutiliza en ProductCard y ProductDetailPage: corazón vacío o relleno rojo, aria-pressed/aria-label, fuera del enlace del producto. La página /favorites usa la misma ProductCard y muestra un empty state con vuelta al catálogo. El acceso CLIENT está junto a “Mis pedidos” en el navbar, adaptándose mediante wrap en móvil. Guest sigue el guard existente hacia Login.

Favorito y carrito son independientes. No se tocaron CartProvider, CartQuantityControl, cartQuantity, Deshacer ni checkout.

## Pruebas ejecutadas

| Área | Resultado |
| --- | --- |
| Backend build | npm run build: exit 0. |
| Backend integración | node tests/block3.integration.mjs: exit 0, contra PostgreSQL temporal 18 en puerto 55438. |
| Migración desde 0017 | 0017 → 0018, con producto existente: conserva stock y brand queda NULL. Reejecución sin duplicados. |
| Migración limpia | 0000 → 0018 aprobada. |
| Drizzle | npx drizzle-kit check: exit 0, “Everything's fine”. |
| Marca API | Crear con/sin marca, editar, normalización, tipo/longitud, lectura pública y rechazo a roles no ADMIN: aprobados. |
| Favoritos API | Agregar/repetir, quitar/repetir, CLIENT A/B, query/body de otro cliente, guest, otros roles, ID inválido, inactivo y CASCADE: aprobados. |
| Inventario | Durante pruebas de marca/favoritos, stock del producto previo se conserva y no se generan movimientos. |
| Frontend tests | 13 grupos aprobados: filtros/orden/marcas y regresiones de unidades, cantidades, Deshacer y geolocalización. |
| Frontend lint | npm run lint: exit 0, sin errores ni advertencias. |
| Frontend build | npm run build: exit 0. Advertencia conocida del chunk grande de Vite; bundle principal ~803.55 kB (~230.89 kB gzip). |
| git diff --check | Sin errores de whitespace. Git informa conversión LF/CRLF según configuración local, no errores de diff. |

### Navegador con API/BD temporales reales

- Filtros combinados precio/stock; rango inválido con mensaje; marca/categoría desde panel móvil; conservación al cerrar/reabrir.
- Catálogo/cards en 360, 390, 430 y 1440 px: sin overflow horizontal. Sidebar desktop, panel móvil legible y scroll vertical propio.
- Navbar CLIENT/Favoritos en los cuatro anchos: logo, carrito y cuenta accesibles; enlaces se ajustan con wrap.
- Formulario de marca ADMIN: precarga, edición, normalización “Marca Visual”, reapertura con valor persistido. Modal sin overflow en 360/390/430.
- Corazón en card/detalle; favorito permanece tras refresh y nuevo login; CLIENT B presenta favoritos vacíos y carrito distinto.
- Guest no tiene corazón persistente y /favorites conduce a Login.
- Favorito no altera carrito; quitarlo no elimina sus unidades.
- Añadir dos unidades guest y “Ver carrito” funciona. -1, 0, punto, vacío, decimal y exceso conservan la última cantidad válida (2); papelera + Deshacer restaura exactamente 2.
- Fusión adicional: CLIENT tenía 5, guest agregó 3 → 8 unidades y total correcto en checkout CLIENT.
- Checkout guest y CLIENT conservan sus productos/resúmenes. No se inició Webpay en estas pruebas ni se repitieron las pruebas de pagos/logística ya validadas.
- Botón Volver arriba aparece al desplazarse (2597 px en la prueba), vuelve a scrollY=0 y desaparece.
- Fondo sin imagen configurada: no se genera URL rota.

Los servicios de prueba fueron apagados, el viewport restaurado y las bases/archivos temporales eliminados. Las cuentas/productos de prueba no se crearon en la BD normal.

## Archivos modificados

- [backend/drizzle/meta/_journal.json](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/drizzle/meta/_journal.json>)
- [backend/src/db/schema/index.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/db/schema/index.ts>)
- [backend/src/db/schema/products.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/db/schema/products.ts>)
- [backend/src/modules/catalog/catalog.repository.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/catalog/catalog.repository.ts>)
- [backend/src/modules/index.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/index.ts>)
- [backend/src/modules/products/products.repository.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/products/products.repository.ts>)
- [backend/src/modules/products/products.validation.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/products/products.validation.ts>)
- [frontend/src/App.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/App.jsx>)
- [frontend/src/components/ClientNavbar.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/components/ClientNavbar.jsx>)
- [frontend/src/components/ProductCard.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/components/ProductCard.jsx>)
- [frontend/src/pages/CatalogPage.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/pages/CatalogPage.jsx>)
- [frontend/src/pages/ProductDetailPage.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/pages/ProductDetailPage.jsx>)
- [frontend/src/pages/ProductsPage.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/pages/ProductsPage.jsx>)
- [frontend/src/pages/Root.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/pages/Root.jsx>)

## Archivos nuevos

- [backend/drizzle/0018_salty_celestials.sql](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/drizzle/0018_salty_celestials.sql>)
- [backend/drizzle/meta/0018_snapshot.json](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/drizzle/meta/0018_snapshot.json>)
- [backend/src/db/schema/clientProductFavorites.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/db/schema/clientProductFavorites.ts>)
- [backend/src/modules/favorites/favorites.controller.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/favorites/favorites.controller.ts>)
- [backend/src/modules/favorites/favorites.repository.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/favorites/favorites.repository.ts>)
- [backend/src/modules/favorites/favorites.routes.ts](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/src/modules/favorites/favorites.routes.ts>)
- [backend/tests/block3.integration.mjs](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/backend/tests/block3.integration.mjs>)
- [frontend/src/components/BackToTop.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/components/BackToTop.jsx>)
- [frontend/src/components/CatalogFilters.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/components/CatalogFilters.jsx>)
- [frontend/src/components/FavoriteButton.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/components/FavoriteButton.jsx>)
- [frontend/src/context/FavoritesContext.js](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/context/FavoritesContext.js>)
- [frontend/src/context/FavoritesProvider.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/context/FavoritesProvider.jsx>)
- [frontend/src/helpers/catalogAppearance.js](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/helpers/catalogAppearance.js>)
- [frontend/src/helpers/catalogFilters.js](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/helpers/catalogFilters.js>)
- [frontend/src/pages/FavoritesPage.jsx](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/pages/FavoritesPage.jsx>)
- [frontend/src/services/favorites.service.js](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/src/services/favorites.service.js>)
- [frontend/tests/catalog-block3.test.mjs](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/frontend/tests/catalog-block3.test.mjs>)
- [docs/BLOQUE_3_VALIDACION.md](<C:/Users/Sebastian/Documents/Ramos UBB/Taller de Desarrollo/Proyecto/tesis-ferreteria/docs/BLOQUE_3_VALIDACION.md>)

## Git

- Rama: `seba`.
- HEAD inicial/final: `5ec0bd9c09bb8d2e0051fa0d975ff80498fa495f`.
- Árbol inicial limpio. Árbol final: cambios de este bloque sin staging/commit.
- main conserva `fcd642231cb5b951ac152f100ba00cde911219c0`.
- practica conserva `80c64093d2b64795a218066e33161a871cdf1622`.
- Sin commit, push ni merge. Migraciones históricas intactas.

