# Edición de identidad ante compromisos pendientes

## Corrección acotada

`productHasHistory` no consulta solicitudes de despacho. Un SKU sin ventas,
pedidos ni ENTRY podía cambiar de unidad o combinación después de solicitar
despacho. La firma económica no demuestra que su presentación siga siendo igual.

Se reutiliza `fyf_assert_product_name_ready` (0034), dentro de la transacción y
con el producto bloqueado. No cambia su definición SQL ni requiere migraciones.
El helper de aplicación `assertNoPendingIdentityCommitments` conserva el motivo
específico del rechazo y lo expresa como cambio de identidad, no de nombre.

- `PATCH /api/products/:id` / `editProductInTransaction`: verifica cambios
  efectivos de unidad, marca, categoría y código de barras antes de escribir.
  El nombre continúa exigiendo su operación auditada independiente.
- `POST /api/product-families/bundle`: los miembros existentes pasan por el
  mismo guard; cualquier fallo revierte también cambios anteriores del bundle.
- `assignVariant`: verifica antes de cambiar familia/combinación y antes de
  borrar asignaciones; no bloquea una selección idéntica ni el alta de un SKU.
- Precios, descripción, mínimos y demás campos sin cambios de identidad
  conservan sus reglas anteriores; no se congelan por tener una solicitud.

El guard compartido bloquea solicitudes abiertas REQUESTED/ASSIGNED/PROPOSED/
APPROVED; pedidos operativos o reintentables según su política vigente (no solo
reservas aún activas); repartos POS pendientes; devoluciones PENDING y capturas
históricas faltantes. No resuelve ni altera esos compromisos. Las restricciones
adicionales por historial siguen aplicándose: terminar un compromiso no habilita
una unidad o reasignación histórica.

## Concurrencia

Creación de solicitudes y checkout ya usan `priceCheckoutItems`, que adquiere
el lock de promociones y bloquea productos por ID antes de insertar artículos y
capturas. No fue necesario modificar esos servicios.

Las entradas de alta/edición de productos y guardado bundle ahora adquieren ese
lock antes del advisory lock familiar y de los productos. `assignVariant` usa
el mismo orden; los llamadores comerciales pertinentes ya lo adquirieron antes.
Se evita la inversión anterior producto → promociones frente a checkout.

Si el compromiso confirma primero, la edición espera y luego lo detecta. Si la
edición confirma primero, la creación lee y captura la nueva identidad. La
aceptación de despacho ya parte de una solicitud abierta, que bloquea la edición;
ORDER_CREATED queda cubierto por su pedido asociado. No se actualizan
revisiones silenciosamente ni se cambian idempotencia, pagos o importes.

La garantía implementada cubre estas rutas de aplicación. No es una nueva
restricción contra SQL arbitrario escrito por el propietario de la base.

## Pruebas y entorno

Prueba dedicada: `backend/tests/identityCommitments.integration.mjs`.
Desde backend en PowerShell:

```powershell
$env:IDENTITY_COMMITMENTS_ONLY='1'
node scripts/test-product-bundles.mjs
```

El modo utiliza un clúster desechable 127.0.0.1:55447, valida su directorio y
copia un journal temporal limitado a 0036. **No aplica 0037 ni 0038**. No cambia
el journal del proyecto. Se comprobó sobre PostgreSQL nativo 18.0; no equivale
a una comprobación de 16.15.

Casos: SKU sintético sin ENTRY con solicitud real, cambios de unidad/opción/
código bloqueados, bundle de unidad/combinación bloqueado, PATCH y bundle inocuos
permitidos, cancelación y edición sin compromisos, pedido pendiente/reintentable,
rollback completo, IDs/stock/compromisos/capturas sin cambios accidentales y carreras
reales de creación de solicitud frente a unidad y reasignación. El estado
ORDER_CREATED/pedido se prepara como fixture; no se inicia Webpay en esta prueba.

Las primeras ejecuciones detectaron errores de la prueba (stock inicial enviado
para un miembro existente y ruta JSON equivocada del variantKey), corregidos sin
relajar validaciones de producción.
