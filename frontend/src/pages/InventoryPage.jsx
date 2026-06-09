import { useEffect, useState } from "react";
import { getApiError } from "../api/api.js";
import { createInventoryMovementRequest, getInventoryMovementsRequest } from "../api/inventory.api.js";
import { getProductsRequest } from "../api/products.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function InventoryPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState({ productId: "", quantity: 1, reason: "Ingreso de stock" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canCreate = user?.role === "ADMIN";

  const loadData = async () => {
    const [productData, movementData] = await Promise.all([getProductsRequest(), getInventoryMovementsRequest()]);
    setProducts(productData);
    setMovements(movementData);
  };

  useEffect(() => {
    loadData().catch((err) => setError(getApiError(err, "No se pudo cargar inventario")));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await createInventoryMovementRequest({
        productId: Number(form.productId),
        movementType: "ENTRY",
        quantity: Number(form.quantity),
        reason: form.reason,
      });
      setForm({ productId: "", quantity: 1, reason: "Ingreso de stock" });
      setMessage("Entrada registrada exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar el movimiento"));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Inventario</h1>
          <p>Ver stock y registrar entradas simples.</p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {canCreate && (
        <form className="panel compact-form" onSubmit={handleSubmit}>
          <h2>Nueva entrada</h2>
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
              min="1"
              value={form.quantity}
              onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
            />
          </label>
          <label>
            Motivo
            <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
          </label>
          <button type="submit">Registrar entrada</button>
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
