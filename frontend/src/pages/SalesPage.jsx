import { useEffect, useState } from "react";
import { getApiError } from "../api/api.js";
import { getProductsRequest } from "../api/products.api.js";
import { createSaleRequest, getSalesRequest } from "../api/sales.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function SalesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState({ productId: "", quantity: 1, paymentMethod: "efectivo" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canCreate = user?.role === "CASHIER";

  const loadData = async () => {
    const [productData, saleData] = await Promise.all([getProductsRequest(), getSalesRequest()]);
    setProducts(productData);
    setSales(saleData);
  };

  useEffect(() => {
    loadData().catch((err) => setError(getApiError(err, "No se pudieron cargar ventas")));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const product = products.find((item) => item.id === Number(form.productId));
    if (!product) {
      setError("Selecciona un producto");
      return;
    }

    try {
      await createSaleRequest({
        paymentMethod: form.paymentMethod,
        details: [
          {
            productId: product.id,
            quantity: Number(form.quantity),
          },
        ],
      });
      setForm({ productId: "", quantity: 1, paymentMethod: "efectivo" });
      setMessage("Venta registrada exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar la venta"));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Ventas</h1>
          <p>Registro simple de venta presencial.</p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {canCreate && (
        <form className="panel compact-form" onSubmit={handleSubmit}>
          <h2>Nueva venta</h2>
          <label>
            Producto
            <select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} required>
              <option value="">Seleccionar</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - stock {product.currentStock} - ${product.price}
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
            Metodo de pago
            <input
              value={form.paymentMethod}
              onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
            />
          </label>
          <button type="submit">Registrar venta</button>
        </form>
      )}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Metodo</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.id}</td>
                <td>
                  {sale.userNames} {sale.userSurnames}
                </td>
                <td>{sale.paymentMethod}</td>
                <td>${sale.total}</td>
                <td>{sale.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
