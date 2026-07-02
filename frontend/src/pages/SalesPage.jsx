import { Plus, Search, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { compareByNewest, formatClp, formatSaleFolio } from "../helpers/formatters.js";
import { getPaymentMethodLabel, getSaleStatusLabel } from "../helpers/labels.js";
import { PAYMENT_METHODS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { getProductsRequest } from "../services/products.service.js";
import { cancelSaleRequest, createSaleRequest, getSalesRequest } from "../services/sales.service.js";
import {
  alertClasses,
  badgeClass,
  dangerButtonClass,
  emptyTableCellClass,
  formActionsClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
} from "../helpers/uiClasses.js";

const emptyDetail = () => ({ productId: "", quantity: 1, categoryId: "", productSearch: "" });

export default function SalesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [cashReceived, setCashReceived] = useState("");
  const [details, setDetails] = useState([emptyDetail()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [search, setSearch] = useState("");

  const canCreate = user?.role === "CASHIER";
  const canCancel = user?.role === "ADMIN";
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredSales = useMemo(
    () => sales.filter((sale) => {
      if (!normalizedSearch) return true;

      const cashierName = `${sale.userNames || ""} ${sale.userSurnames || ""}`;
      const searchableValues = [
        String(sale.id),
        formatSaleFolio(sale.id),
        cashierName,
        sale.paymentMethod,
        getPaymentMethodLabel(sale.paymentMethod),
        String(sale.total),
        String(Number(sale.total || 0)),
        formatClp(sale.total),
      ];

      return searchableValues.some((value) => String(value).toLocaleLowerCase("es").includes(normalizedSearch));
    }).sort(compareByNewest),
    [normalizedSearch, sales],
  );
  const salesPagination = usePagination(filteredSales, {
    resetKey: `${normalizedSearch}|${sales.length}`,
  });

  const loadData = async () => {
    const [productData, saleData] = await Promise.all([getProductsRequest(), getSalesRequest()]);
    setProducts(productData);
    setSales(saleData);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch((err) => setError(getApiError(err, "No se pudieron cargar ventas")));
  }, []);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const activeProducts = useMemo(
    () => products.filter((product) => product.status !== false),
    [products],
  );
  const productCategories = useMemo(
    () =>
      [...new Map(activeProducts.map((product) => [product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
      }])).values()].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [activeProducts],
  );

  const estimatedTotal = details.reduce((total, detail) => {
    const product = productById.get(Number(detail.productId));
    return total + (product ? Number(product.price) * Number(detail.quantity || 0) : 0);
  }, 0);
  const isCashPayment = paymentMethod === "efectivo";
  const receivedAmount = Number(cashReceived || 0);
  const cashChange = receivedAmount - estimatedTotal;
  const hasInsufficientCash = isCashPayment && cashReceived !== "" && receivedAmount < estimatedTotal;
  const canSubmitSale = !submitting && (!isCashPayment || (cashReceived !== "" && receivedAmount >= estimatedTotal));

  const updateDetail = (index, field, value) => {
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, [field]: value } : detail,
      ),
    );
  };

  const updateProductFilter = (index, field, value) => {
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, [field]: value, productId: "" } : detail,
      ),
    );
  };

  const addDetail = () => setDetails((current) => [...current, emptyDetail()]);

  const removeDetail = (index) => {
    setDetails((current) => current.filter((_, detailIndex) => detailIndex !== index));
  };

  const startNewSale = () => {
    setPaymentMethod("efectivo");
    setCashReceived("");
    setDetails([emptyDetail()]);
    setMessage("");
    setError("");
    setSaleFormOpen(true);
  };

  const closeSaleForm = () => {
    setPaymentMethod("efectivo");
    setCashReceived("");
    setDetails([emptyDetail()]);
    setError("");
    setSaleFormOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (details.some((detail) => !detail.productId || Number(detail.quantity) < 1)) {
      setError("Selecciona un producto y una cantidad valida en cada linea");
      return;
    }

    if (isCashPayment) {
      if (cashReceived === "") {
        setError("Ingresa el monto recibido para calcular el vuelto");
        return;
      }

      if (receivedAmount < estimatedTotal) {
        setError("El monto recibido es menor al total de la venta");
        return;
      }
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
      setCashReceived("");
      setDetails([emptyDetail()]);
      setMessage("Venta registrada exitosamente");
      await loadData();
      setSaleFormOpen(false);
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  const openCancelModal = (sale) => {
    if (!canCancel || sale.status !== "ACTIVE") return;
    setSaleToCancel(sale);
    setError("");
    setMessage("");
  };

  const closeCancelModal = () => {
    if (submitting) return;
    setSaleToCancel(null);
  };

  const handleCancel = async () => {
    if (!saleToCancel) return;

    if (saleToCancel.status !== "ACTIVE") {
      setError("No se puede cancelar una venta que ya fue cancelada");
      setSaleToCancel(null);
      return;
    }

    setError("");
    setMessage("");

    try {
      setSubmitting(true);
      await cancelSaleRequest(saleToCancel.id);
      setMessage(`Venta ${formatSaleFolio(saleToCancel.id)} cancelada y stock restaurado`);
      setSaleToCancel(null);
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo cancelar la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Ventas</h1>
          <p>Registro simple de venta presencial.</p>
        </div>
        {canCreate && (
          <button type="button" onClick={startNewSale}>
            <Plus size={18} />
            Registrar nueva venta
          </button>
        )}
      </div>

      {message && <div className={alertClasses.success}>{message}</div>}
      {error && !saleFormOpen && <div className={alertClasses.error}>{error}</div>}

      <AppModal
        open={canCreate && saleFormOpen}
        title="Registrar nueva venta"
        description="Agrega productos y selecciona el método de pago."
        onClose={closeSaleForm}
        size="xlarge"
      >
        <form className="grid gap-3.75" onSubmit={handleSubmit}>
          {error && <div className={alertClasses.error}>{error}</div>}
          <label>
            Metodo de pago
            <select
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.target.value);
                if (event.target.value !== "efectivo") setCashReceived("");
              }}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-2.5">
            {details.map((detail, index) => {
              const selectedProduct = productById.get(Number(detail.productId));
              const normalizedProductSearch = detail.productSearch.trim().toLocaleLowerCase("es");
              const hasProductFilter = Boolean(detail.categoryId || normalizedProductSearch);
              const availableProducts = hasProductFilter ? activeProducts.filter((product) => {
                const matchesCategory = !detail.categoryId || String(product.categoryId) === detail.categoryId;
                const matchesSearch =
                  !normalizedProductSearch ||
                  product.name.toLocaleLowerCase("es").includes(normalizedProductSearch) ||
                  String(product.id).includes(normalizedProductSearch);
                return matchesCategory && matchesSearch;
              }) : [];

              return (
                <div className="grid grid-cols-[minmax(0,1fr)_120px_175px_42px] items-end gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.25 max-[980px]:grid-cols-[minmax(0,1fr)_110px_145px_42px] max-[720px]:grid-cols-1" key={index}>
                  <div className="grid min-w-0 grid-cols-[150px_minmax(150px,0.8fr)_minmax(220px,1.3fr)] gap-2.5 max-[980px]:grid-cols-2 max-[980px]:[&>label:last-child]:col-span-full max-[720px]:grid-cols-1 max-[720px]:[&>label:last-child]:col-auto">
                    <label>
                      Categoría
                      <select
                        value={detail.categoryId}
                        onChange={(event) => updateProductFilter(index, "categoryId", event.target.value)}
                      >
                        <option value="">Todas</option>
                        {productCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Buscar producto
                      <input
                        value={detail.productSearch}
                        onChange={(event) => updateProductFilter(index, "productSearch", event.target.value)}
                        placeholder="Nombre o ID"
                      />
                    </label>
                    <label>
                      Producto
                      <select
                        value={detail.productId}
                        onChange={(event) => updateDetail(index, "productId", event.target.value)}
                        required
                      >
                        <option value="">
                          {hasProductFilter ? "Seleccionar producto" : "Elige categoría o busca por nombre"}
                        </option>
                        {hasProductFilter && availableProducts.length === 0 && (
                          <option disabled>Sin productos activos para este filtro</option>
                        )}
                        {availableProducts.map((product) => (
                          <option
                            disabled={details.some(
                              (item, itemIndex) => itemIndex !== index && Number(item.productId) === product.id,
                            )}
                            key={product.id}
                            value={product.id}
                          >
                            #{product.id} · {product.name} · {product.categoryName} · stock {product.currentStock}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
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
                  <div className="grid min-h-10.25 content-center gap-0.5">
                    <span className="text-[11px] text-slate-500">{selectedProduct ? `Stock disponible: ${selectedProduct.currentStock}` : "Subtotal referencial"}</span>
                    <strong className="font-mono text-sm text-ink-950">
                      {formatClp(Number(selectedProduct?.price || 0) * Number(detail.quantity || 0))}
                    </strong>
                  </div>
                  <button
                    className={`${dangerButtonClass} w-10 p-0 max-[720px]:w-full`}
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

          {isCashPayment && (
            <div className="grid grid-cols-[minmax(180px,260px)_minmax(0,1fr)] items-end gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5 max-[720px]:grid-cols-1">
              <label>
                Monto recibido
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashReceived}
                  onChange={(event) => setCashReceived(event.target.value)}
                  placeholder="Ej: 10000"
                  required={isCashPayment}
                />
              </label>
              <div className={`grid gap-1 border-l-4 px-3.25 py-2.75 ${hasInsufficientCash ? "border-l-critical-600 bg-critical-50 text-critical-600" : "border-l-positive-600 bg-positive-50 text-positive-600"}`}>
                <span className="text-xs font-semibold">
                  {cashReceived === "" ? "Ingresa el monto recibido" : hasInsufficientCash ? "Monto recibido insuficiente" : "Vuelto"}
                </span>
                <strong className="font-mono text-lg text-ink-950">
                  {cashReceived === "" ? "-" : formatClp(Math.max(cashChange, 0))}
                </strong>
                <span className="text-xs">
                  Total venta: {formatClp(estimatedTotal)}
                </span>
              </div>
            </div>
          )}

          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={addDetail}>
              <Plus size={18} />
              Agregar producto
            </button>
            <strong>Total referencial: {formatClp(estimatedTotal)}</strong>
            <button type="submit" disabled={!canSubmitSale}>
              Registrar venta
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={canCancel && Boolean(saleToCancel)}
        title="Cancelar venta"
        description="¿Estás seguro de cancelar esta venta? El stock será restaurado automáticamente."
        onClose={closeCancelModal}
        size="small"
      >
        <div className="grid gap-4">
          {saleToCancel && (
            <div className="rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5">
              <span className="text-xs font-semibold text-slate-500">Venta seleccionada</span>
              <div className="mt-1 flex items-center justify-between gap-3">
                <strong className="font-mono text-ink-950">{formatSaleFolio(saleToCancel.id)}</strong>
                <strong className={numericCellClass}>{formatClp(saleToCancel.total)}</strong>
              </div>
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeCancelModal} disabled={submitting}>
              No, volver
            </button>
            <button className={dangerButtonClass} type="button" onClick={handleCancel} disabled={submitting}>
              <XCircle size={17} />
              Sí, cancelar venta
            </button>
          </div>
        </div>
      </AppModal>

      <div className="flex flex-wrap items-center justify-between gap-3.5 max-[720px]:items-stretch">
        <label className="relative block w-full max-w-110 max-[720px]:max-w-none">
          <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
          <input
            className="pl-9.75"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por folio, ID, cajero, método o total"
            aria-label="Buscar ventas"
          />
        </label>
        <span className="text-xs font-semibold text-slate-500">
          {filteredSales.length} de {sales.length} ventas
        </span>
      </div>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Ventas registradas</h2>
            <p>Historial de ventas presenciales</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Usuario</th>
              <th>Metodo</th>
              <th>Total</th>
              <th>Estado</th>
              {canCancel && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {salesPagination.paginatedItems.map((sale) => (
              <tr key={sale.id}>
                <td>
                  <div className="grid gap-0.5">
                    <strong className="font-mono text-xs text-ink-950">{formatSaleFolio(sale.id)}</strong>
                    <span className="text-[11px] text-slate-500">ID {sale.id}</span>
                  </div>
                </td>
                <td>
                  {sale.userNames} {sale.userSurnames}
                </td>
                <td>{getPaymentMethodLabel(sale.paymentMethod)}</td>
                <td className={numericCellClass}>{formatClp(sale.total)}</td>
                <td>
                  <span className={badgeClass(sale.status === "ACTIVE" ? "success" : "critical")}>
                    {getSaleStatusLabel(sale.status)}
                  </span>
                </td>
                {canCancel && (
                  <td>
                    {sale.status === "ACTIVE" && (
                      <button
                        className={dangerButtonClass}
                        type="button"
                        onClick={() => openCancelModal(sale)}
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
            {filteredSales.length === 0 && (
              <tr>
                <td className={emptyTableCellClass} colSpan={canCancel ? 6 : 5}>
                  {sales.length === 0 ? "No hay ventas registradas." : "No se encontraron ventas con la búsqueda ingresada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={salesPagination.page}
          pageSize={salesPagination.pageSize}
          totalItems={salesPagination.totalItems}
          totalPages={salesPagination.totalPages}
          onPageChange={salesPagination.setPage}
        />
      </div>
    </section>
  );
}
