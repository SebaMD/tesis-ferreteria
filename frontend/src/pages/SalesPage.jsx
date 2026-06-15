import { Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/api.js";
import { getProductsRequest } from "../api/products.api.js";
import { cancelSaleRequest, createSaleRequest, getSalesRequest } from "../api/sales.api.js";
import { useAuth } from "../context/AuthContext.jsx";

const emptyDetail = () => ({ productId: "", quantity: 1 });

export default function SalesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [details, setDetails] = useState([emptyDetail()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canCreate = user?.role === "CASHIER";
  const canCancel = user?.role === "ADMIN";

  const loadData = async () => {
    const [productData, saleData] = await Promise.all([getProductsRequest(), getSalesRequest()]);
    setProducts(productData);
    setSales(saleData);
  };

  useEffect(() => {
    loadData().catch((err) => setError(getApiError(err, "No se pudieron cargar ventas")));
  }, []);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const estimatedTotal = details.reduce((total, detail) => {
    const product = productById.get(Number(detail.productId));
    return total + (product ? Number(product.price) * Number(detail.quantity || 0) : 0);
  }, 0);

  const updateDetail = (index, field, value) => {
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, [field]: value } : detail,
      ),
    );
  };

  const addDetail = () => setDetails((current) => [...current, emptyDetail()]);

  const removeDetail = (index) => {
    setDetails((current) => current.filter((_, detailIndex) => detailIndex !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (details.some((detail) => !detail.productId || Number(detail.quantity) < 1)) {
      setError("Selecciona un producto y una cantidad valida en cada linea");
      return;
    }

    try {
      setSubmitting(true);
      await createSaleRequest({
        paymentMethod,
        details: details.map((detail) => ({
          productId: Number(detail.productId),
          quantity: Number(detail.quantity),
        })),
      });
      setPaymentMethod("efectivo");
      setDetails([emptyDetail()]);
      setMessage("Venta registrada exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (sale) => {
    const confirmed = window.confirm(`¿Cancelar la venta #${sale.id}? El stock sera restaurado.`);
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      setSubmitting(true);
      await cancelSaleRequest(sale.id);
      setMessage(`Venta #${sale.id} cancelada y stock restaurado`);
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo cancelar la venta"));
    } finally {
      setSubmitting(false);
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
        <form className="panel sale-form" onSubmit={handleSubmit}>
          <h2>Nueva venta</h2>
          <label>
            Metodo de pago
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Debito</option>
              <option value="credito">Credito</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>

          <div className="sale-lines">
            {details.map((detail, index) => {
              const selectedProduct = productById.get(Number(detail.productId));

              return (
                <div className="sale-line" key={index}>
                  <label>
                    Producto
                    <select
                      value={detail.productId}
                      onChange={(event) => updateDetail(index, "productId", event.target.value)}
                      required
                    >
                      <option value="">Seleccionar</option>
                      {products.map((product) => (
                        <option
                          disabled={
                            !product.status ||
                            details.some(
                              (item, itemIndex) => itemIndex !== index && Number(item.productId) === product.id,
                            )
                          }
                          key={product.id}
                          value={product.id}
                        >
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
                      max={selectedProduct ? selectedProduct.currentStock : undefined}
                      value={detail.quantity}
                      onChange={(event) => updateDetail(index, "quantity", event.target.value)}
                      required
                    />
                  </label>
                  <div className="line-reference">
                    <span>Subtotal referencial</span>
                    <strong>
                      ${(Number(selectedProduct?.price || 0) * Number(detail.quantity || 0)).toFixed(2)}
                    </strong>
                  </div>
                  <button
                    className="danger-icon-button"
                    type="button"
                    onClick={() => removeDetail(index)}
                    disabled={details.length === 1}
                    title="Quitar producto"
                    aria-label="Quitar producto"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={addDetail}>
              <Plus size={18} />
              Agregar producto
            </button>
            <strong>Total referencial: ${estimatedTotal.toFixed(2)}</strong>
            <button type="submit" disabled={submitting}>
              Registrar venta
            </button>
          </div>
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
              {canCancel && <th>Acciones</th>}
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
                {canCancel && (
                  <td>
                    {sale.status === "ACTIVE" && (
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => handleCancel(sale)}
                        disabled={submitting}
                      >
                        <XCircle size={17} />
                        Cancelar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
