import { useEffect, useState } from "react";
import { getApiError } from "../api/api.js";
import { createInventoryMovementRequest, getInventoryMovementsRequest } from "../api/inventory.api.js";
import { getProductsRequest } from "../api/products.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function InventoryPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState({
    productId: "",
    movementType: "ENTRY",
    quantity: 1,
    reason: "Ingreso de stock",
  });
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canCreate = user?.role === "ADMIN";

  const loadData = async () => {
    const [productData, movementData] = await Promise.all([getProductsRequest(), getInventoryMovementsRequest()]);
    setProducts(productData);
    setMovements(movementData);
  };

  useEffect(() => {
    loadData().catch((err) => setError(getApiError(err, "No se pudo cargar inventario")));
  }, []);

  const selectedProduct = products.find((product) => product.id === Number(form.productId));
  const estimatedStock = selectedProduct
    ? form.movementType === "ENTRY"
      ? selectedProduct.currentStock + Number(form.quantity || 0)
      : Number(form.quantity || 0)
    : null;
  const estimatedLowStock =
    selectedProduct && estimatedStock !== null && estimatedStock <= selectedProduct.minimumStock;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setWarning("");

    try {
      setSubmitting(true);
      const movement = await createInventoryMovementRequest({
        productId: Number(form.productId),
        movementType: form.movementType,
        quantity: Number(form.quantity),
        reason: form.reason,
      });
      setForm({
        productId: "",
        movementType: "ENTRY",
        quantity: 1,
        reason: "Ingreso de stock",
      });
      setMessage(form.movementType === "ENTRY" ? "Entrada registrada exitosamente" : "Ajuste registrado exitosamente");
      if (movement.stock?.lowStock) {
        setWarning(
          `${movement.stock.productName} quedo con stock bajo: ${movement.stock.currentStock} unidades. Minimo: ${movement.stock.minimumStock}.`,
        );
      }
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar el movimiento"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Inventario</h1>
          <p>Consultar movimientos y registrar entradas o ajustes administrativos.</p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {warning && <div className="alert warning">{warning}</div>}
      {error && <div className="alert error">{error}</div>}

      {canCreate && (
        <form className="panel compact-form" onSubmit={handleSubmit}>
          <h2>Nuevo movimiento</h2>
          <label>
            Tipo
            <select
              value={form.movementType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  movementType: event.target.value,
                  quantity: event.target.value === "ADJUSTMENT" ? 0 : 1,
                  reason: event.target.value === "ADJUSTMENT" ? "Ajuste administrativo" : "Ingreso de stock",
                }))
              }
            >
              <option value="ENTRY">Entrada de stock</option>
              <option value="ADJUSTMENT">Ajustar stock exacto</option>
            </select>
          </label>
          <label>
            Producto
            <select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} required>
              <option value="">Seleccionar</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - stock {product.currentStock}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min={form.movementType === "ADJUSTMENT" ? "0" : "1"}
              value={form.quantity}
              onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
              required
            />
          </label>
          <label>
            Motivo
            <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
          </label>
          {selectedProduct && (
            <div className={estimatedLowStock ? "stock-preview warning" : "stock-preview"}>
              <span>Stock final estimado</span>
              <strong>
                {estimatedStock} unidades · mínimo {selectedProduct.minimumStock}
              </strong>
              {estimatedLowStock && <span>Este movimiento dejará el producto con stock bajo.</span>}
            </div>
          )}
          <button type="submit" disabled={submitting}>
            Registrar movimiento
          </button>
        </form>
      )}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Usuario</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td>{movement.id}</td>
                <td>{movement.productName}</td>
                <td>{movement.movementType}</td>
                <td>{movement.quantity}</td>
                <td>
                  {movement.userNames} {movement.userSurnames}
                </td>
                <td>{movement.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
