import { Eye, Plus, RotateCcw, Search, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { compareByNewest, formatClp, formatDate, formatSaleFolio, formatTableRecordCount } from "../helpers/formatters.js";
import { getAvailableStockStatus } from "../helpers/inventory.js";
import { getPaymentMethodLabel, getSaleStatusLabel } from "../helpers/labels.js";
import { PAYMENT_METHODS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { getProductsRequest } from "../services/products.service.js";
import { cancelSaleRequest, createSaleRequest, getSaleByIdRequest, getSalesRequest, undoCancelSaleRequest } from "../services/sales.service.js";
import {
  badgeClass,
  dangerButtonClass,
  emptyTableCellClass,
  formActionsClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  panelClass,
  secondaryButtonClass,
  tableActionButtonClass,
  tableHeadingClass,
  tablePanelClass,
  tableScrollClass,
} from "../helpers/uiClasses.js";

const SALE_TIME_OPTIONS = {
  hour: "2-digit",
  minute: "2-digit",
};
const SALE_DATE_TIME_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const SALE_DATE_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function getSaleDetails(sale) {
  if (Array.isArray(sale?.details)) return sale.details;
  if (Array.isArray(sale?.saleDetails)) return sale.saleDetails;
  return [];
}

export default function SalesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [cashReceived, setCashReceived] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [saleToReactivate, setSaleToReactivate] = useState(null);
  const [saleDetail, setSaleDetail] = useState(null);
  const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState("");
  const [activeView, setActiveView] = useState(user?.role === "CASHIER" ? "sales" : "history");

  const canCreate = user?.role === "CASHIER";
  const canCancel = user?.role === "ADMIN";
  const viewParam = searchParams.get("view");

  useEffect(() => {
    if (user?.role === "CASHIER") {
      setActiveView(viewParam === "history" ? "history" : "sales");
      return;
    }

    setActiveView("history");
  }, [user?.role, viewParam]);

  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredSales = useMemo(
    () => sales.filter((sale) => {
      if (!normalizedSearch) return true;

      const cashierName = `${sale.userNames || ""} ${sale.userSurnames || ""}`;
      const productValues = getSaleDetails(sale).flatMap((detail) => [
        detail.productName,
        detail.name,
        detail.productId,
      ]);
      const searchableValues = [
        String(sale.id),
        formatSaleFolio(sale.id),
        cashierName,
        sale.paymentMethod,
        getPaymentMethodLabel(sale.paymentMethod),
        String(sale.total),
        String(Number(sale.total || 0)),
        formatClp(sale.total),
        ...productValues,
      ];

      return searchableValues.some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch));
    }).sort(compareByNewest),
    [normalizedSearch, sales],
  );
  const salesPagination = usePagination(filteredSales, {
    resetKey: `${normalizedSearch}|${sales.length}`,
  });
  const hasSalesFilters = Boolean(normalizedSearch);

  const loadData = async () => {
    const [productData, saleData] = await Promise.all([getProductsRequest(), getSalesRequest()]);
    setProducts(productData);
    setSales(saleData);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch((err) => toast.error(getApiError(err, "No se pudieron cargar ventas")));
  }, []);

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
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
  const cartQuantityByProduct = useMemo(
    () => new Map(cartItems.map((item) => [String(item.productId), Number(item.quantity || 0)])),
    [cartItems],
  );
  const normalizedCatalogSearch = catalogSearch.trim().toLocaleLowerCase("es");
  const filteredCatalogProducts = useMemo(
    () =>
      activeProducts
        .filter((product) => {
          const quantityInCart = cartQuantityByProduct.get(String(product.id)) || 0;
          const availableStock = Number(product.currentStock || 0) - quantityInCart;
          const matchesCategory = !catalogCategoryFilter || String(product.categoryId) === catalogCategoryFilter;
          const matchesSearch =
            !normalizedCatalogSearch ||
            String(product.id).includes(normalizedCatalogSearch) ||
            product.name.toLocaleLowerCase("es").includes(normalizedCatalogSearch) ||
            product.categoryName.toLocaleLowerCase("es").includes(normalizedCatalogSearch);

          return availableStock > 0 && matchesCategory && matchesSearch;
        })
        .sort((left, right) => {
          const categoryOrder = left.categoryName.localeCompare(right.categoryName, "es");
          if (categoryOrder !== 0) return categoryOrder;
          return left.name.localeCompare(right.name, "es");
        }),
    [activeProducts, cartQuantityByProduct, catalogCategoryFilter, normalizedCatalogSearch],
  );
  const catalogPagination = usePagination(filteredCatalogProducts, {
    pageSize: 9,
    resetKey: `${catalogCategoryFilter}|${normalizedCatalogSearch}|${activeProducts.length}`,
  });

  const cartRows = useMemo(
    () =>
      cartItems
        .map((item) => {
          const product = productById.get(String(item.productId));
          if (!product) return null;
          const quantity = Number(item.quantity || 0);

          return {
            ...item,
            product,
            quantity,
            subtotal: Number(product.price || 0) * quantity,
          };
        })
        .filter(Boolean),
    [cartItems, productById],
  );
  const cartTotal = cartRows.reduce((total, row) => total + row.subtotal, 0);
  const cartHasInvalidStock = cartRows.some((row) => row.quantity < 1 || row.quantity > Number(row.product.currentStock || 0));
  const isCashPayment = paymentMethod === "efectivo";
  const receivedAmount = Number(cashReceived || 0);
  const cashChange = receivedAmount - cartTotal;
  const hasInsufficientCash = isCashPayment && cashReceived !== "" && receivedAmount < cartTotal;
  const canSubmitSale =
    !submitting &&
    cartRows.length > 0 &&
    !cartHasInvalidStock &&
    (!isCashPayment || (cashReceived !== "" && receivedAmount >= cartTotal));

  const getCartQuantity = (productId) => {
    const item = cartItems.find((cartItem) => String(cartItem.productId) === String(productId));
    return Number(item?.quantity || 0);
  };

  const addProductToCart = (product) => {
    const currentQuantity = getCartQuantity(product.id);
    const availableStock = Number(product.currentStock || 0);

    if (availableStock < 1) {
      toast.error("Este producto no tiene stock disponible para venta");
      return;
    }

    if (currentQuantity >= availableStock) {
      toast.error("No puedes agregar más unidades que el stock disponible");
      return;
    }

    setCartItems((current) => {
      const exists = current.some((item) => String(item.productId) === String(product.id));

      if (exists) {
        return current.map((item) =>
          String(item.productId) === String(product.id)
            ? { ...item, quantity: Number(item.quantity || 0) + 1 }
            : item,
        );
      }

      return [...current, { productId: String(product.id), quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId, value) => {
    const product = productById.get(String(productId));
    const availableStock = Number(product?.currentStock || 0);
    const requestedQuantity = Math.max(1, Number(value || 1));
    const nextQuantity = availableStock > 0 ? Math.min(requestedQuantity, availableStock) : 1;

    if (requestedQuantity > availableStock) {
      toast.warning("La cantidad no puede superar el stock disponible");
    }

    setCartItems((current) =>
      current.map((item) =>
        String(item.productId) === String(productId)
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    );
  };

  const removeCartItem = (productId) => {
    setCartItems((current) => current.filter((item) => String(item.productId) !== String(productId)));
  };

  const clearCart = () => {
    setCartItems([]);
    setPaymentMethod("efectivo");
    setCashReceived("");
  };

  const openPaymentModal = () => {
    if (cartRows.length === 0) {
      toast.warning("Agrega al menos un producto al carrito");
      return;
    }

    if (cartHasInvalidStock) {
      toast.warning("Revisa las cantidades del carrito antes de finalizar la venta");
      return;
    }

    setPaymentMethod("efectivo");
    setCashReceived("");
    setPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    if (submitting) return;
    setCashReceived("");
    setPaymentModalOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (cartRows.length === 0) {
      toast.warning("Agrega al menos un producto al carrito");
      return;
    }

    if (cartHasInvalidStock) {
      toast.error("No se puede finalizar la venta porque una cantidad supera el stock disponible");
      return;
    }

    if (isCashPayment) {
      if (cashReceived === "") {
        toast.warning("Ingresa el monto recibido para calcular el vuelto");
        return;
      }

      if (receivedAmount < cartTotal) {
        toast.error("El monto recibido es menor al total de la venta");
        return;
      }
    }

    try {
      setSubmitting(true);
      await createSaleRequest({
        paymentMethod,
        details: cartRows.map((row) => ({
          productId: Number(row.product.id),
          quantity: Number(row.quantity),
        })),
      });
      clearCart();
      toast.success("Venta registrada exitosamente");
      setPaymentModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo registrar la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailModal = async (sale) => {
    setSaleDetail(sale);
    setLoadingSaleDetail(true);

    try {
      setSaleDetail(await getSaleByIdRequest(sale.id));
    } catch (err) {
      toast.error(getApiError(err, "No se pudo cargar el detalle de la venta"));
      setSaleDetail(null);
    } finally {
      setLoadingSaleDetail(false);
    }
  };

  const closeDetailModal = () => {
    if (loadingSaleDetail) return;
    setSaleDetail(null);
  };

  const openCancelModal = (sale) => {
    if (!canCancel || sale.status !== "ACTIVE") return;
    setSaleToCancel(sale);
    setSaleToReactivate(null);
  };

  const closeCancelModal = () => {
    if (submitting) return;
    setSaleToCancel(null);
  };

  const handleCancel = async () => {
    if (!saleToCancel) return;

    if (saleToCancel.status !== "ACTIVE") {
      toast.error("No se puede cancelar una venta que ya fue cancelada");
      setSaleToCancel(null);
      return;
    }

    try {
      setSubmitting(true);
      await cancelSaleRequest(saleToCancel.id);
      toast.success(`Venta ${formatSaleFolio(saleToCancel.id)} cancelada y stock restaurado`);
      setSaleToCancel(null);
      await loadData();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo cancelar la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  const openUndoCancelModal = (sale) => {
    if (!canCancel || sale.status !== "CANCELLED") return;
    setSaleToReactivate(sale);
    setSaleToCancel(null);
  };

  const closeUndoCancelModal = () => {
    if (submitting) return;
    setSaleToReactivate(null);
  };

  const handleUndoCancel = async () => {
    if (!saleToReactivate) return;

    if (saleToReactivate.status !== "CANCELLED") {
      toast.error("Solo se puede deshacer la cancelación de una venta cancelada");
      setSaleToReactivate(null);
      return;
    }

    try {
      setSubmitting(true);
      await undoCancelSaleRequest(saleToReactivate.id);
      toast.success(`Cancelación de la venta ${formatSaleFolio(saleToReactivate.id)} deshecha y stock descontado nuevamente`);
      setSaleToReactivate(null);
      await loadData();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo deshacer la cancelación de la venta"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={`${pageClass} gap-3 py-4`}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Ventas</h1>
          <p>{canCreate && activeView === "sales" ? "Punto de venta presencial con carrito." : "Historial de ventas presenciales registradas."}</p>
        </div>
        {canCreate && (
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:[&>button]:flex-1">
            <button
              className={`min-h-11 rounded-[4px] border-2 px-4 py-2 text-sm font-extrabold ${activeView === "sales" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
              type="button"
              onClick={() => setActiveView("sales")}
              aria-pressed={activeView === "sales"}
            >
              Ventas
            </button>
            <button
              className={`min-h-11 rounded-[4px] border-2 px-4 py-2 text-sm font-extrabold ${activeView === "history" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
              type="button"
              onClick={() => setActiveView("history")}
              aria-pressed={activeView === "history"}
            >
              Historial de ventas
            </button>
          </div>
        )}
      </div>

      <AppModal
        open={canCreate && paymentModalOpen}
        title="Finalizar venta"
        description="Confirma el método de pago antes de registrar la venta."
        onClose={closePaymentModal}
        size="medium"
      >
        <form className="grid gap-3.75" onSubmit={handleSubmit}>
          <div className="rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5">
            <span className="text-xs font-semibold text-slate-500">Total a pagar</span>
            <strong className="mt-1 block font-mono text-2xl text-ink-950">{formatClp(cartTotal)}</strong>
          </div>
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
                  Total venta: {formatClp(cartTotal)}
                </span>
              </div>
            </div>
          )}

          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closePaymentModal} disabled={submitting}>
              No, volver
            </button>
            <button type="submit" disabled={!canSubmitSale}>
              Confirmar venta
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

      <AppModal
        open={canCancel && Boolean(saleToReactivate)}
        title="Deshacer cancelación"
        description="¿Estás seguro de deshacer la cancelación de esta venta? El stock será descontado nuevamente."
        onClose={closeUndoCancelModal}
        size="small"
      >
        <div className="grid gap-4">
          {saleToReactivate && (
            <div className="rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5">
              <span className="text-xs font-semibold text-slate-500">Venta seleccionada</span>
              <div className="mt-1 flex items-center justify-between gap-3">
                <strong className="font-mono text-ink-950">Folio: {formatSaleFolio(saleToReactivate.id)}</strong>
                <strong className={numericCellClass}>{formatClp(saleToReactivate.total)}</strong>
              </div>
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeUndoCancelModal} disabled={submitting}>
              No, volver
            </button>
            <button type="button" onClick={handleUndoCancel} disabled={submitting}>
              <RotateCcw size={17} />
              Sí, deshacer cancelación
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(saleDetail)}
        title="Detalle de venta"
        description={saleDetail ? `Información completa de ${formatSaleFolio(saleDetail.id)}` : ""}
        onClose={closeDetailModal}
        size="large"
      >
        <div className="grid gap-4">
          {loadingSaleDetail && <p className="m-0 rounded-[5px] border border-slate-200 bg-[#fafbfc] px-3.5 py-3 text-sm font-semibold text-slate-600">Cargando detalle de la venta...</p>}
          {saleDetail && (
            <>
              <div className="grid grid-cols-3 gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5 max-[720px]:grid-cols-1">
                <div>
                  <span className="text-xs font-semibold text-slate-500">Folio</span>
                  <strong className="mt-1 block font-mono text-ink-950">{formatSaleFolio(saleDetail.id)}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Fecha</span>
                  <strong className="mt-1 block text-ink-950">{formatDate(saleDetail.date || saleDetail.createdAt, SALE_DATE_OPTIONS, "-")}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Hora</span>
                  <strong className="mt-1 block text-ink-950">{formatDate(saleDetail.date || saleDetail.createdAt, SALE_TIME_OPTIONS, "-")}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Cajero</span>
                  <strong className="mt-1 block text-ink-950">{saleDetail.userNames} {saleDetail.userSurnames}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Método de pago</span>
                  <strong className="mt-1 block text-ink-950">{getPaymentMethodLabel(saleDetail.paymentMethod)}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total</span>
                  <strong className="mt-1 block font-mono text-lg text-ink-950">{formatClp(saleDetail.total)}</strong>
                </div>
              </div>

              <div className="rounded-[5px] border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-3.5 py-3">
                  <h3 className="m-0 text-sm font-bold text-ink-950">Productos vendidos</h3>
                </div>
                <div className={tableScrollClass}>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio unitario</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSaleDetails(saleDetail).map((detail) => (
                        <tr key={`${detail.saleId}-${detail.productId}`}>
                          <td className="font-mono text-xs font-semibold text-ink-950">#{detail.productId}</td>
                          <td>{detail.productName || detail.name || `Producto #${detail.productId}`}</td>
                          <td className={numericCellClass}>{detail.quantity}</td>
                          <td className={numericCellClass}>{formatClp(detail.unitPrice)}</td>
                          <td className={numericCellClass}>{formatClp(detail.subtotal)}</td>
                        </tr>
                      ))}
                      {getSaleDetails(saleDetail).length === 0 && (
                        <tr>
                          <td className={emptyTableCellClass} colSpan="5">No hay productos asociados a esta venta.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeDetailModal} disabled={loadingSaleDetail}>
              Cerrar
            </button>
          </div>
        </div>
      </AppModal>

      {canCreate && activeView === "sales" && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(310px,370px)] items-start gap-3 max-[1080px]:grid-cols-1">
          <section className={`${panelClass} gap-3 p-3.5`}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <h2 className="m-0 text-base font-bold text-ink-950">Catálogo de productos</h2>
                <p className="mt-0.75 mb-0 text-xs text-slate-500">Busca por ID, producto o categoría para agregar al carrito.</p>
              </div>
              <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-ink-700">
                {filteredCatalogProducts.length} productos
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-[720px]:flex-col max-[720px]:items-stretch">
              <label className="relative block min-w-[260px] flex-1 max-[720px]:min-w-0">
                <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                <input
                  className="min-h-9 pl-9.75"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Buscar por ID, producto o categoría"
                  aria-label="Buscar productos para venta"
                />
              </label>
              <select
                className="min-h-9 w-full max-w-[220px] max-[720px]:max-w-none"
                value={catalogCategoryFilter}
                onChange={(event) => setCatalogCategoryFilter(event.target.value)}
                aria-label="Filtrar productos por categoría"
              >
                <option value="">Todas las categorías</option>
                {productCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-[980px]:grid-cols-2 max-[620px]:grid-cols-1">
              {catalogPagination.paginatedItems.map((product) => {
                const cartQuantity = getCartQuantity(product.id);
                const availableStock = Number(product.currentStock || 0) - cartQuantity;
                const addButtonStatus = getAvailableStockStatus(product, availableStock);
                const addButtonClass = addButtonStatus.tone === "warning"
                    ? "border-rust-600 bg-rust-500 text-white hover:border-rust-700 hover:bg-rust-600"
                    : "";

                return (
                  <article className="grid min-h-[138px] content-between gap-2 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3" key={product.id}>
                    <div className="grid gap-0.75">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="line-clamp-2 text-[13px] leading-[1.25] text-ink-950">{product.name}</strong>
                        <span className="font-mono text-[11px] font-bold text-slate-500">#{product.id}</span>
                      </div>
                      <span className="truncate text-[11px] font-semibold text-slate-500">{product.categoryName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded bg-white px-2 py-1.5">
                        <span className="block text-slate-500">Precio</span>
                        <strong className="font-mono text-ink-950">{formatClp(product.price)}</strong>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5">
                        <span className="block text-slate-500">Stock</span>
                        <strong className="font-mono text-ink-950">{availableStock} {product.unitMeasure}</strong>
                      </div>
                    </div>
                    <button
                      className={`min-h-8 text-xs ${addButtonClass}`}
                      type="button"
                      onClick={() => addProductToCart(product)}
                    >
                      <Plus size={17} />
                      Agregar
                    </button>
                  </article>
                );
              })}
              {filteredCatalogProducts.length === 0 && (
                <p className="col-span-full rounded-[5px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No se encontraron productos activos con los filtros ingresados.
                </p>
              )}
            </div>

            <Pagination
              page={catalogPagination.page}
              pageSize={catalogPagination.pageSize}
              totalItems={catalogPagination.totalItems}
              totalPages={catalogPagination.totalPages}
              onPageChange={catalogPagination.setPage}
            />
          </section>

          <aside className={`${panelClass} sticky top-4 gap-3 p-3.5 max-[1080px]:static`}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2.5">
              <div>
                <h2 className="m-0 flex items-center gap-2 text-base font-bold text-ink-950">
                  <ShoppingCart size={18} />
                  Carrito de venta
                </h2>
                <p className="mt-0.75 mb-0 text-xs text-slate-500">{cartRows.length} productos agregados</p>
              </div>
              {cartRows.length > 0 && (
                <button className={`${secondaryButtonClass} mr-0 min-h-8 px-2.5 text-xs`} type="button" onClick={clearCart}>
                  Limpiar
                </button>
              )}
            </div>

            <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
              {cartRows.length === 0 ? (
                <p className="m-0 rounded-[5px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Agrega productos desde el catálogo para iniciar la venta.
                </p>
              ) : (
                cartRows.map((row) => (
                  <article className="grid gap-2 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-2.5" key={row.product.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-0.5">
                        <strong className="truncate text-[13px] text-ink-950">{row.product.name}</strong>
                        <span className="text-[11px] text-slate-500">
                          {formatClp(row.product.price)} · stock {row.product.currentStock}
                        </span>
                      </div>
                      <button
                        className={`${dangerButtonClass} h-8 w-8 p-0`}
                        type="button"
                        onClick={() => removeCartItem(row.product.id)}
                        title="Quitar producto"
                        aria-label="Quitar producto"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-end gap-2">
                      <label className="text-xs">
                        Cantidad
                        <input
                          type="number"
                          min="1"
                          max={row.product.currentStock}
                          value={row.quantity}
                          onChange={(event) => updateCartQuantity(row.product.id, event.target.value)}
                          required
                        />
                      </label>
                      <div className="grid justify-items-end gap-0.5 text-right">
                        <span className="text-[11px] text-slate-500">Subtotal</span>
                        <strong className="font-mono text-sm text-ink-950">{formatClp(row.subtotal)}</strong>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="grid gap-2.5 border-t border-slate-200 pt-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-600">Total</span>
                <strong className="font-mono text-2xl text-ink-950">{formatClp(cartTotal)}</strong>
              </div>
              <button type="button" onClick={openPaymentModal} disabled={cartRows.length === 0 || cartHasInvalidStock || submitting}>
                Finalizar venta
              </button>
            </div>
          </aside>
        </div>
      )}

      {activeView === "history" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3.5 max-[720px]:flex-col max-[720px]:items-stretch">
            <label className="relative block w-full max-w-120 max-[720px]:max-w-none">
              <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
              <input
                className="pl-9.75"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por folio, cajero, método de pago o total"
                aria-label="Buscar ventas"
              />
            </label>
          </div>

          <div className={tablePanelClass}>
            <div className={tableHeadingClass}>
              <div>
                <h2>Ventas registradas</h2>
                <p>{formatTableRecordCount({
                  visibleCount: salesPagination.paginatedItems.length,
                  totalCount: sales.length,
                  filteredCount: filteredSales.length,
                  hasFilters: hasSalesFilters,
                })}</p>
              </div>
            </div>
            <div className={tableScrollClass}>
              <table>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha y hora</th>
                    <th>Usuario</th>
                    <th>Metodo</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th className="text-left">Acciones</th>
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
                      <td className="font-mono text-xs font-semibold text-ink-950">
                        {formatDate(sale.date || sale.createdAt, SALE_DATE_TIME_OPTIONS, "Sin fecha")}
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
                      <td className="text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            className={`${secondaryButtonClass} ${tableActionButtonClass} !mr-0`}
                            type="button"
                            onClick={() => openDetailModal(sale)}
                            disabled={loadingSaleDetail}
                          >
                            <Eye size={17} />
                            Detalle
                          </button>
                          {canCancel && sale.status === "ACTIVE" && (
                            <button
                              className={`${dangerButtonClass} ${tableActionButtonClass}`}
                              type="button"
                              onClick={() => openCancelModal(sale)}
                              disabled={submitting}
                            >
                              <XCircle size={17} />
                              Cancelar
                            </button>
                          )}
                          {canCancel && sale.status === "CANCELLED" && (
                            <button
                              className={`${secondaryButtonClass} ${tableActionButtonClass}`}
                              type="button"
                              onClick={() => openUndoCancelModal(sale)}
                              disabled={submitting}
                            >
                              <RotateCcw size={17} />
                              Deshacer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td className={emptyTableCellClass} colSpan="7">
                        {sales.length === 0 ? "No hay ventas registradas." : "No se encontraron ventas con la búsqueda ingresada."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={salesPagination.page}
              pageSize={salesPagination.pageSize}
              totalItems={salesPagination.totalItems}
              totalPages={salesPagination.totalPages}
              onPageChange={salesPagination.setPage}
            />
          </div>
        </>
      )}
    </section>
  );
}
