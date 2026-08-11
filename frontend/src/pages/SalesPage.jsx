import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Eye, Plus, RotateCcw, Search, Send, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import Pagination from "../components/Pagination.jsx";
import { compareByNewest, formatClp, formatDate, formatSaleFolio, formatTableRecordCount, getSaleTotals } from "../helpers/formatters.js";
import { getAvailableStockStatus } from "../helpers/inventory.js";
import {
  getCancellationRequestStatusLabel,
  getPaymentMethodLabel,
  getSaleStatusLabel,
} from "../helpers/labels.js";
import { PAYMENT_METHODS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { getProductsRequest } from "../services/products.service.js";
import {
  approveCancellationRequest,
  createCancellationRequest,
  createDirectReturnRequest,
  createSaleRequest,
  getSaleByIdRequest,
  getSalesRequest,
  rejectCancellationRequest,
  undoCancellationRequest,
} from "../services/sales.service.js";
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

function getCancellationRequestTone(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "critical";
  if (status === "REVERSED") return "info";
  return "warning";
}

function getSaleStatusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "PARTIALLY_RETURNED") return "warning";
  return "critical";
}

function getSaleStatusTextClass(status) {
  if (status === "ACTIVE") return "text-positive-600";
  if (status === "PARTIALLY_RETURNED") return "text-rust-600";
  return "text-critical-600";
}

function getReturnQuantityError(value, availableQuantity) {
  if (String(value ?? "").trim() === "") return "Ingresa una cantidad.";

  const quantity = Number(value);
  if (!Number.isInteger(quantity)) return "La cantidad debe ser un número entero.";
  if (quantity < 1) return "La cantidad mínima es 1.";
  if (quantity > availableQuantity) {
    return `La cantidad máxima disponible es ${availableQuantity}.`;
  }

  return "";
}

function preventNonIntegerQuantityKey(event) {
  if ([".", ",", "e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
}

function preventNonIntegerQuantityPaste(event) {
  const pastedValue = event.clipboardData.getData("text").trim();

  if (!/^\d+$/.test(pastedValue)) {
    event.preventDefault();
  }
}

function ReturnHistoryText({ label, text }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <p className="m-0 min-w-0 whitespace-pre-wrap wrap-break-word text-sm text-ink-700">
        {String(text || "")}
      </p>
    </div>
  );
}

function isReturnableSale(sale) {
  return sale?.status === "ACTIVE" || sale?.status === "PARTIALLY_RETURNED";
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
  const [requestToReverse, setRequestToReverse] = useState(null);
  const [saleForReversal, setSaleForReversal] = useState(null);
  const [saleForReturn, setSaleForReturn] = useState(null);
  const [returnMode, setReturnMode] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [loadingReturnDetail, setLoadingReturnDetail] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [requestToReview, setRequestToReview] = useState(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [saleDetail, setSaleDetail] = useState(null);
  const [returnHistoryOpen, setReturnHistoryOpen] = useState(false);
  const [expandedReturnRequestId, setExpandedReturnRequestId] = useState(null);
  const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState("");
  const [activeView, setActiveView] = useState(user?.role === "CASHIER" ? "sales" : "history");
  const [salesFilter, setSalesFilter] = useState("current");

  const canCreate = user?.role === "CASHIER";
  const canCancel = user?.role === "ADMIN";
  const canRequestCancellation = user?.role === "CASHIER";
  const canReviewCancellation = ["ADMIN", "MANAGER"].includes(user?.role);
  const viewParam = searchParams.get("view");

  useEffect(() => {
    if (user?.role === "CASHIER") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView(viewParam === "history" ? "history" : "sales");
      return;
    }

    setActiveView("history");
  }, [user?.role, viewParam]);

  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const pendingCancellationSales = useMemo(
    () => sales.filter(
      (sale) => isReturnableSale(sale) && sale.cancellationRequest?.status === "PENDING",
    ),
    [sales],
  );
  const salesByStatusFilter = useMemo(() => {
    if (salesFilter === "partial") {
      return sales.filter((sale) => sale.status === "PARTIALLY_RETURNED");
    }
    if (salesFilter === "cancelled") {
      return sales.filter((sale) => sale.status === "CANCELLED");
    }
    if (salesFilter === "pending" && canReviewCancellation) return pendingCancellationSales;
    return sales.filter(isReturnableSale);
  }, [canReviewCancellation, pendingCancellationSales, sales, salesFilter]);
  const filteredSales = useMemo(
    () => salesByStatusFilter.filter((sale) => {
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
        String(getSaleTotals(sale).returnedTotal),
        String(getSaleTotals(sale).netTotal),
        formatClp(getSaleTotals(sale).returnedTotal),
        formatClp(getSaleTotals(sale).netTotal),
        ...productValues,
      ];

      return searchableValues.some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch));
    }).sort(compareByNewest),
    [normalizedSearch, salesByStatusFilter],
  );
  const salesPagination = usePagination(filteredSales, {
    resetKey: `${salesFilter}|${normalizedSearch}|${sales.length}`,
  });
  const hasSalesFilters = Boolean(normalizedSearch || salesFilter !== "current");
  const detailReturnRequests = Array.isArray(saleDetail?.cancellationRequests)
    ? saleDetail.cancellationRequests
    : [];

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [productData, saleData] = await Promise.all([
        getProductsRequest(),
        getSalesRequest(),
      ]);
      setProducts(productData);
      setSales(saleData);
      setSalesFilter((current) => {
        const hasPendingRequests = saleData.some(
          (sale) => isReturnableSale(sale) && sale.cancellationRequest?.status === "PENDING",
        );
        return current === "pending" && !hasPendingRequests ? "current" : current;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch((err) => toast.error(getApiError(err, "No se pudieron cargar ventas")));
  }, [loadData]);

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

  const returnableDetails = useMemo(
    () => getSaleDetails(saleForReturn)
      .map((detail) => ({
        ...detail,
        soldQuantity: Number(detail.quantity || 0),
        returnedQuantity: Number(detail.returnedQuantity || 0),
        availableQuantity: Math.max(
          0,
          Number(detail.quantity || 0) - Number(detail.returnedQuantity || 0),
        ),
      }))
      .filter((detail) => detail.availableQuantity > 0),
    [saleForReturn],
  );
  const selectedReturnDetails = useMemo(
    () => returnableDetails
      .filter((detail) => returnQuantities[String(detail.productId)] !== undefined)
      .map((detail) => {
        const value = returnQuantities[String(detail.productId)];

        return {
          ...detail,
          requestedQuantity: Number(value),
          quantityError: getReturnQuantityError(value, detail.availableQuantity),
        };
      }),
    [returnQuantities, returnableDetails],
  );
  const requestedReturnDetails = useMemo(
    () => selectedReturnDetails.filter((detail) => !detail.quantityError),
    [selectedReturnDetails],
  );
  const invalidReturnDetail = selectedReturnDetails.find((detail) => detail.quantityError);
  const returnRequestTotal = requestedReturnDetails.reduce(
    (total, detail) => total + Number(detail.unitPrice || 0) * detail.requestedQuantity,
    0,
  );
  const allAvailableSelected =
    returnableDetails.length > 0 &&
    returnableDetails.every(
      (detail) => Number(returnQuantities[String(detail.productId)]) === detail.availableQuantity,
    );

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
    setReturnHistoryOpen(false);
    setExpandedReturnRequestId(null);
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
    setReturnHistoryOpen(false);
    setExpandedReturnRequestId(null);
  };

  const openUndoReturnModal = (request, sale) => {
    if (!canCancel || request?.status !== "APPROVED") return;
    setRequestToReverse(request);
    setSaleForReversal(sale);
    setSaleDetail(null);
  };

  const closeUndoReturnModal = () => {
    if (submitting) return;
    const previousSale = saleForReversal;
    setRequestToReverse(null);
    setSaleForReversal(null);
    if (previousSale) setSaleDetail(previousSale);
  };

  const handleUndoReturn = async () => {
    if (!requestToReverse || !saleForReversal) return;

    try {
      setSubmitting(true);
      await undoCancellationRequest(requestToReverse.id);
      toast.success(`Devolución de ${formatSaleFolio(saleForReversal.id)} deshecha`);
      const saleId = saleForReversal.id;
      setRequestToReverse(null);
      setSaleForReversal(null);
      setExpandedReturnRequestId(null);
      try {
        await loadData();
        setSaleDetail(await getSaleByIdRequest(saleId));
      } catch (refreshError) {
        toast.error(getApiError(refreshError, "La devolución se deshizo, pero no se pudo actualizar la vista"));
      }
    } catch (err) {
      toast.error(getApiError(err, "No se pudo deshacer la devolución"));
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnModal = async (sale, mode) => {
    const allowed = mode === "direct" ? canCancel : canRequestCancellation;
    if (!allowed || !isReturnableSale(sale)) return;

    if (sale.cancellationRequest?.status === "PENDING") {
      toast.warning("Esta venta ya tiene una solicitud de devolución pendiente");
      return;
    }

    setSaleForReturn(sale);
    setReturnMode(mode);
    setCancellationReason("");
    setReturnQuantities({});
    setLoadingReturnDetail(true);

    try {
      const detail = await getSaleByIdRequest(sale.id);
      const hasAvailableProducts = getSaleDetails(detail).some(
        (item) => Number(item.quantity || 0) - Number(item.returnedQuantity || 0) > 0,
      );

      if (!hasAvailableProducts) {
        toast.warning("La venta no tiene productos disponibles para devolver");
        setSaleForReturn(null);
        setReturnMode(null);
        return;
      }

      setSaleForReturn(detail);
    } catch (err) {
      toast.error(getApiError(err, "No se pudo cargar el detalle de la venta"));
      setSaleForReturn(null);
      setReturnMode(null);
    } finally {
      setLoadingReturnDetail(false);
    }
  };

  const closeReturnModal = () => {
    if (submitting) return;
    setSaleForReturn(null);
    setReturnMode(null);
    setCancellationReason("");
    setReturnQuantities({});
  };

  const openCancellationRequestModal = (sale) => openReturnModal(sale, "request");
  const openDirectReturnModal = (sale) => openReturnModal(sale, "direct");

  const toggleReturnProduct = (detail, selected) => {
    setReturnQuantities((current) => {
      const next = { ...current };
      const key = String(detail.productId);

      if (selected) next[key] = detail.availableQuantity;
      else delete next[key];

      return next;
    });
  };

  const updateReturnQuantity = (detail, value) => {
    if (value !== "" && !/^\d+$/.test(value)) return;

    const numericValue = Number(value);
    const nextValue = value !== "" && Number.isFinite(numericValue) && numericValue > detail.availableQuantity
      ? String(detail.availableQuantity)
      : value;

    setReturnQuantities((current) => ({
      ...current,
      [String(detail.productId)]: nextValue,
    }));
  };

  const toggleSelectAllReturns = (selected) => {
    if (!selected) {
      setReturnQuantities({});
      return;
    }

    setReturnQuantities(Object.fromEntries(
      returnableDetails.map((detail) => [String(detail.productId), detail.availableQuantity]),
    ));
  };

  const handleReturnAction = async (event) => {
    event.preventDefault();
    if (!saleForReturn || !returnMode) return;

    const reason = cancellationReason.trim();
    if (reason.length < 5) {
      toast.warning("El motivo debe tener al menos 5 caracteres");
      return;
    }

    if (selectedReturnDetails.length === 0) {
      toast.warning("Selecciona al menos un producto para devolver");
      return;
    }

    if (invalidReturnDetail) {
      toast.error(
        `${invalidReturnDetail.productName || `Producto #${invalidReturnDetail.productId}`}: ${invalidReturnDetail.quantityError}`,
      );
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        reason,
        details: requestedReturnDetails.map((detail) => ({
          productId: Number(detail.productId),
          quantity: detail.requestedQuantity,
        })),
      };

      if (returnMode === "direct") {
        await createDirectReturnRequest(saleForReturn.id, payload);
        toast.success(`Devolución registrada para ${formatSaleFolio(saleForReturn.id)}`);
      } else {
        await createCancellationRequest(saleForReturn.id, payload);
        toast.success(`Solicitud de devolución enviada para ${formatSaleFolio(saleForReturn.id)}`);
      }

      setSaleForReturn(null);
      setReturnMode(null);
      setCancellationReason("");
      setReturnQuantities({});
      await loadData();
    } catch (err) {
      toast.error(getApiError(
        err,
        returnMode === "direct"
          ? "No se pudo registrar la devolución"
          : "No se pudo enviar la solicitud de devolución",
      ));
    } finally {
      setSubmitting(false);
    }
  };

  const openReviewModal = (sale) => {
    const request = sale.cancellationRequest;
    if (!canReviewCancellation || request?.status !== "PENDING") return;

    setRequestToReview(request);
    setAdminResponse("");
  };

  const closeReviewModal = () => {
    if (submitting) return;
    setRequestToReview(null);
    setAdminResponse("");
  };

  const handleReviewCancellationRequest = async (action) => {
    if (!requestToReview) return;

    const response = adminResponse.trim();
    if (action === "reject" && response.length < 5) {
      toast.warning("Indica el motivo del rechazo con al menos 5 caracteres");
      return;
    }

    try {
      setSubmitting(true);

      if (action === "approve") {
        await approveCancellationRequest(
          requestToReview.id,
          response ? { adminResponse: response } : {},
        );
        toast.success(`Devolución de ${formatSaleFolio(requestToReview.saleId)} aprobada y stock actualizado`);
      } else {
        await rejectCancellationRequest(requestToReview.id, { adminResponse: response });
        toast.success(`Solicitud de ${formatSaleFolio(requestToReview.saleId)} rechazada`);
      }

      setRequestToReview(null);
      setAdminResponse("");
      if (salesFilter === "pending") setSalesFilter("current");
      await loadData();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo revisar la solicitud de devolución"));
    } finally {
      setSubmitting(false);
    }
  };

  const applySalesFilter = (filter) => {
    setSalesFilter(filter);
    setSearch("");
  };

  return (
    <section className={`${pageClass} gap-3 py-4`}>
      <LoadingOverlay active={loading} />

      <div className={pageHeaderClass}>
        <div>
          <h1>Ventas</h1>
          <p>{canCreate && activeView === "sales" ? "Punto de venta presencial con carrito." : "Historial de ventas presenciales registradas."}</p>
        </div>
        {canReviewCancellation && pendingCancellationSales.length > 0 && (
          <div className="ml-auto flex min-h-11 items-center gap-3 rounded-[5px] border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:flex-wrap">
            <span className="text-sm font-bold">
              Tienes {pendingCancellationSales.length} solicitudes de devolución pendientes
            </span>
            <button
              className="min-h-8 border-amber-700 bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
              type="button"
              onClick={() => {
                setActiveView("history");
                applySalesFilter(salesFilter === "pending" ? "current" : "pending");
              }}
            >
              {salesFilter === "pending" ? "Ver ventas vigentes" : "Ver solicitudes"}
            </button>
          </div>
        )}
        {canCreate && (
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:[&>button]:flex-1">
            <button
              className={`min-h-11 rounded-sm border-2 px-4 py-2 text-sm font-extrabold ${activeView === "sales" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
              type="button"
              onClick={() => setActiveView("sales")}
              aria-pressed={activeView === "sales"}
            >
              Ventas
            </button>
            <button
              className={`min-h-11 rounded-sm border-2 px-4 py-2 text-sm font-extrabold ${activeView === "history" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
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
        open={canCancel && Boolean(requestToReverse)}
        title="Deshacer devolución"
        description="El stock de los productos de esta solicitud será descontado nuevamente."
        onClose={closeUndoReturnModal}
        size="medium"
      >
        <div className="grid gap-4">
          {requestToReverse && saleForReversal && (
            <div className="rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5">
              <span className="text-xs font-semibold text-slate-500">Solicitud aprobada</span>
              <div className="mt-1 flex items-center justify-between gap-3">
                <strong className="font-mono text-ink-950">{formatSaleFolio(saleForReversal.id)}</strong>
                <strong className={numericCellClass}>{formatClp(requestToReverse.requestedTotal)}</strong>
              </div>
              <div className="mt-3 grid gap-1.5 border-t border-slate-200 pt-3 text-sm">
                {(requestToReverse.details || []).map((detail) => (
                  <div className="flex justify-between gap-3" key={`${requestToReverse.id}-${detail.productId}`}>
                    <span>{detail.productName}</span>
                    <strong className="font-mono">{detail.requestedQuantity}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeUndoReturnModal} disabled={submitting}>
              No, volver
            </button>
            <button type="button" onClick={handleUndoReturn} disabled={submitting}>
              <RotateCcw size={17} />
              Sí, deshacer devolución
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(saleForReturn) && (
          (returnMode === "request" && canRequestCancellation) ||
          (returnMode === "direct" && canCancel)
        )}
        title={returnMode === "direct" ? "Registrar devolución" : "Solicitar devolución"}
        description={returnMode === "direct"
          ? "Selecciona los productos y cantidades que volverán al stock inmediatamente."
          : "Selecciona los productos y cantidades. La venta no cambiará hasta que la solicitud sea aprobada."}
        onClose={closeReturnModal}
        size="xlarge"
      >
        <form className="relative grid min-h-45 gap-4" onSubmit={handleReturnAction}>
          <LoadingOverlay active={loadingReturnDetail} contained />
          {saleForReturn && (
            <div className="grid grid-cols-3 gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5 max-[720px]:grid-cols-1">
              <div>
                <span className="text-xs font-semibold text-slate-500">Folio</span>
                <strong className="mt-1 block font-mono text-ink-950">{formatSaleFolio(saleForReturn.id)}</strong>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500">Total original</span>
                <strong className="mt-1 block font-mono text-ink-950">{formatClp(getSaleTotals(saleForReturn).originalTotal)}</strong>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500">Disponible para devolución</span>
                <strong className="mt-1 block font-mono text-ink-950">{formatClp(getSaleTotals(saleForReturn).netTotal)}</strong>
              </div>
            </div>
          )}

          {!loadingReturnDetail && returnableDetails.length > 0 && (
            <div className="rounded-[5px] border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink-950">
                  <input
                    className="size-4"
                    type="checkbox"
                    checked={allAvailableSelected}
                    onChange={(event) => toggleSelectAllReturns(event.target.checked)}
                  />
                  Seleccionar todos
                </label>
              </div>
              <div className={tableScrollClass}>
                <table className="min-w-205">
                  <thead>
                    <tr>
                      <th aria-label="Seleccionar producto" />
                      <th>Producto</th>
                      <th>Vendida</th>
                      <th>Ya devuelta</th>
                      <th>Disponible</th>
                      <th>Cantidad solicitada</th>
                      <th>Subtotal devolución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnableDetails.map((detail) => {
                      const selected = returnQuantities[String(detail.productId)] !== undefined;
                      const quantityValue = selected
                        ? returnQuantities[String(detail.productId)]
                        : "";
                      const requestedQuantity = Number(quantityValue);
                      const quantityError = selected
                        ? getReturnQuantityError(quantityValue, detail.availableQuantity)
                        : "";

                      return (
                        <tr key={`${detail.saleId}-${detail.productId}`}>
                          <td>
                            <input
                              className="size-4"
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => toggleReturnProduct(detail, event.target.checked)}
                              aria-label={`Seleccionar ${detail.productName || `producto ${detail.productId}`}`}
                            />
                          </td>
                          <td>
                            <div className="grid gap-0.5">
                              <strong className="text-ink-950">{detail.productName || `Producto #${detail.productId}`}</strong>
                              <span className="font-mono text-[11px] text-slate-500">ID {detail.productId}</span>
                            </div>
                          </td>
                          <td className={numericCellClass}>{detail.soldQuantity}</td>
                          <td className={numericCellClass}>{detail.returnedQuantity}</td>
                          <td className={numericCellClass}>{detail.availableQuantity}</td>
                          <td>
                            <div className="grid min-w-36 gap-1">
                              <input
                                className={`min-h-8 w-24 ${quantityError ? "border-critical-600 focus:border-critical-600" : ""}`}
                                type="number"
                                min="1"
                                max={detail.availableQuantity}
                                step="1"
                                inputMode="numeric"
                                value={quantityValue}
                                onChange={(event) => updateReturnQuantity(detail, event.target.value)}
                                onKeyDown={preventNonIntegerQuantityKey}
                                onPaste={preventNonIntegerQuantityPaste}
                                disabled={!selected}
                                required={selected}
                                aria-invalid={Boolean(quantityError)}
                                aria-describedby={quantityError ? `return-quantity-error-${detail.productId}` : undefined}
                                aria-label={`Cantidad a devolver de ${detail.productName || detail.productId}`}
                              />
                              {quantityError && (
                                <span
                                  className="text-[11px] font-semibold leading-tight text-critical-600"
                                  id={`return-quantity-error-${detail.productId}`}
                                >
                                  {quantityError}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={numericCellClass}>
                            {selected && !quantityError
                              ? formatClp(Number(detail.unitPrice || 0) * requestedQuantity)
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <label className="grid gap-2 text-sm font-semibold text-ink-700">
            {returnMode === "direct" ? "Motivo de la devolución" : "Motivo de la solicitud"}
            <textarea
              className="min-h-28 w-full rounded-[5px] border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal text-ink-950 outline-none transition focus:border-rust-500 focus:ring-2 focus:ring-[rgba(217,119,6,0.18)]"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              maxLength="500"
              rows="4"
              placeholder={returnMode === "direct"
                ? "Indica el motivo de la devolución"
                : "Explica por qué el cliente solicita la devolución"}
              required
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-rust-500 bg-rust-50 px-3.5 py-3">
            <span className="text-sm font-bold text-rust-700">
              {allAvailableSelected ? "Total devolución completa" : "Total de la devolución"}
            </span>
            <strong className="font-mono text-xl text-ink-950">{formatClp(returnRequestTotal)}</strong>
          </div>
          <div className={formActionsClass}>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={closeReturnModal}
              disabled={submitting}
            >
              No, volver
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                loadingReturnDetail ||
                cancellationReason.trim().length < 5 ||
                selectedReturnDetails.length === 0 ||
                Boolean(invalidReturnDetail)
              }
            >
              <Send size={17} />
              {returnMode === "direct" ? "Confirmar devolución" : "Solicitar devolución"}
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={canReviewCancellation && Boolean(requestToReview)}
        title="Revisar solicitud de devolución"
        description="Al aprobar, solo las cantidades solicitadas volverán al stock."
        onClose={closeReviewModal}
        size="xlarge"
      >
        <div className="relative grid min-h-45 gap-4">
          {requestToReview && (
            <>
              <div className="grid grid-cols-4 gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5 text-sm max-[900px]:grid-cols-2 max-[720px]:grid-cols-1">
                <div>
                  <span className="text-xs font-semibold text-slate-500">Folio</span>
                  <strong className="mt-1 block font-mono text-ink-950">
                    {formatSaleFolio(requestToReview.saleId)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Fecha de la venta</span>
                  <strong className="mt-1 block text-ink-950">
                    {formatDate(requestToReview.saleDate, SALE_DATE_TIME_OPTIONS, "Sin fecha")}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total original</span>
                  <strong className="mt-1 block font-mono text-lg text-ink-950">
                    {formatClp(requestToReview.saleTotal)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total a devolver</span>
                  <strong className="mt-1 block font-mono text-lg text-rust-600">
                    {formatClp(requestToReview.requestedTotal)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Cajero de la venta</span>
                  <strong className="mt-1 block text-ink-950">
                    {requestToReview.originalCashierNames} {requestToReview.originalCashierSurnames}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Solicitante</span>
                  <strong className="mt-1 block text-ink-950">
                    {requestToReview.requesterNames} {requestToReview.requesterSurnames}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Fecha de la solicitud</span>
                  <strong className="mt-1 block text-ink-950">
                    {formatDate(requestToReview.requestedAt, SALE_DATE_TIME_OPTIONS, "Sin fecha")}
                  </strong>
                </div>
              </div>
              <div className="rounded-[5px] border border-amber-200 bg-amber-50 p-3.5">
                <span className="text-xs font-semibold text-amber-800">Motivo de la solicitud</span>
                <p className="m-0 mt-1 text-sm text-amber-950">{requestToReview.reason}</p>
              </div>
            </>
          )}

          <div className="rounded-[5px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3.5 py-3">
                <h3 className="m-0 text-sm font-bold text-ink-950">Productos solicitados</h3>
            </div>
            <div className={tableScrollClass}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Producto</th>
                    <th>Vendida</th>
                    <th>Ya devuelta</th>
                    <th>Solicitada</th>
                    <th>Precio unitario</th>
                    <th>Subtotal devolución</th>
                  </tr>
                </thead>
                <tbody>
                  {(requestToReview?.details || []).map((detail) => (
                    <tr key={`${requestToReview.id}-${detail.productId}`}>
                      <td className="font-mono text-xs font-semibold text-ink-950">#{detail.productId}</td>
                      <td>{detail.productName || `Producto #${detail.productId}`}</td>
                      <td className={numericCellClass}>{detail.soldQuantity}</td>
                      <td className={numericCellClass}>{detail.returnedQuantity}</td>
                      <td className={numericCellClass}>{detail.requestedQuantity}</td>
                      <td className={numericCellClass}>{formatClp(detail.unitPrice)}</td>
                      <td className={numericCellClass}>{formatClp(detail.requestedSubtotal)}</td>
                    </tr>
                  ))}
                  {(requestToReview?.details || []).length === 0 && (
                    <tr>
                      <td className={emptyTableCellClass} colSpan="7">No hay productos asociados a esta solicitud.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-ink-700">
            Respuesta de revisión
            <textarea
              className="min-h-28 w-full rounded-[5px] border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal text-ink-950 outline-none transition focus:border-rust-500 focus:ring-2 focus:ring-[rgba(217,119,6,0.18)]"
              value={adminResponse}
              onChange={(event) => setAdminResponse(event.target.value)}
              maxLength="500"
              rows="4"
              placeholder="Opcional al aprobar; obligatoria al rechazar"
            />
          </label>
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeReviewModal} disabled={submitting}>
              No, volver
            </button>
            <button
              className={dangerButtonClass}
              type="button"
              onClick={() => handleReviewCancellationRequest("reject")}
              disabled={submitting || adminResponse.trim().length < 5}
            >
              <XCircle size={17} />
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => handleReviewCancellationRequest("approve")}
              disabled={submitting}
            >
              <CheckCircle2 size={17} />
              Aprobar
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
        <div className="relative grid min-h-45 gap-4">
          <LoadingOverlay active={loadingSaleDetail} contained />

          {saleDetail && (
            <>
              <div className="grid grid-cols-3 gap-3 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3.5 max-[900px]:grid-cols-2 max-[720px]:grid-cols-1">
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
                  <span className="text-xs font-semibold text-slate-500">Estado</span>
                  <strong className={`mt-1 block ${getSaleStatusTextClass(saleDetail.status)}`}>
                    {getSaleStatusLabel(saleDetail.status)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total original</span>
                  <strong className="mt-1 block font-mono text-lg text-ink-950">{formatClp(getSaleTotals(saleDetail).originalTotal)}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Monto devuelto</span>
                  <strong className="mt-1 block font-mono text-lg text-rust-600">{formatClp(getSaleTotals(saleDetail).returnedTotal)}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total neto</span>
                  <strong className="mt-1 block font-mono text-lg text-ink-950">{formatClp(getSaleTotals(saleDetail).netTotal)}</strong>
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
                        <th>Vendida</th>
                        <th>Devuelta</th>
                        <th>Disponible</th>
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
                          <td className={numericCellClass}>{detail.returnedQuantity || 0}</td>
                          <td className={numericCellClass}>{Math.max(0, Number(detail.quantity || 0) - Number(detail.returnedQuantity || 0))}</td>
                          <td className={numericCellClass}>{formatClp(detail.unitPrice)}</td>
                          <td className={numericCellClass}>{formatClp(detail.subtotal)}</td>
                        </tr>
                      ))}
                      {getSaleDetails(saleDetail).length === 0 && (
                        <tr>
                          <td className={emptyTableCellClass} colSpan="7">No hay productos asociados a esta venta.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {detailReturnRequests.length > 0 && (
                <div className="rounded-[5px] border border-slate-200 bg-white">
                  <button
                    className="min-h-0! w-full justify-between rounded-none border-0! bg-white! px-3.5! py-3! text-ink-950 hover:bg-slate-50!"
                    type="button"
                    onClick={() => setReturnHistoryOpen((current) => !current)}
                    aria-expanded={returnHistoryOpen}
                    aria-controls="sale-return-history"
                  >
                    <span className="text-sm font-bold">Historial de devoluciones ({detailReturnRequests.length})</span>
                    {returnHistoryOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>

                  {returnHistoryOpen && (
                    <div className="grid gap-3 border-t border-slate-200 p-3.5" id="sale-return-history">
                      <div className="grid gap-2.5">
                        {detailReturnRequests.map((request) => {
                          const requestOpen = expandedReturnRequestId === request.id;

                          return (
                            <article
                              className="overflow-hidden rounded-[5px] border border-slate-200 bg-[#fafbfc]"
                              key={request.id}
                            >
                              <button
                                className="min-h-0! w-full justify-start rounded-none border-0! bg-transparent! p-3! text-left text-ink-950 hover:bg-slate-100!"
                                type="button"
                                onClick={() => setExpandedReturnRequestId((current) => current === request.id ? null : request.id)}
                                aria-expanded={requestOpen}
                              >
                                <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span className={badgeClass(getCancellationRequestTone(request.status))}>
                                      {getCancellationRequestStatusLabel(request.status)}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-ink-700">Solicitud #{request.id}</span>
                                  </div>
                                  <div className="grid min-w-36 flex-1 gap-0.5 text-left">
                                    <span className="text-[11px] font-semibold text-slate-500">Solicitante</span>
                                    <strong className="truncate text-xs text-ink-950">
                                      {request.requesterNames} {request.requesterSurnames}
                                    </strong>
                                  </div>
                                  <div className="ml-auto grid shrink-0 gap-0.5 text-right max-[720px]:ml-0">
                                    <strong className="font-mono text-sm text-ink-950">{formatClp(request.requestedTotal)}</strong>
                                    <span className="font-mono text-[11px] text-slate-500">
                                      {formatDate(request.requestedAt, SALE_DATE_TIME_OPTIONS, "Sin fecha")}
                                    </span>
                                  </div>
                                  {requestOpen ? <ChevronDown className="shrink-0" size={18} /> : <ChevronRight className="shrink-0" size={18} />}
                                </div>
                              </button>

                              {requestOpen && (
                                <div className="grid gap-3 border-t border-slate-200 bg-white p-3.5">
                                  <div className="grid grid-cols-2 gap-4 max-[720px]:grid-cols-1">
                                    <ReturnHistoryText
                                      label="Motivo"
                                      text={request.reason}
                                    />
                                    {request.adminResponse && (
                                      <ReturnHistoryText
                                        label="Respuesta del revisor"
                                        text={request.adminResponse}
                                      />
                                    )}
                                  </div>

                                  <div className="grid gap-1.5 border-t border-slate-200 pt-2 text-xs">
                                    {(request.details || []).map((detail) => (
                                      <div
                                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 max-[720px]:grid-cols-[minmax(0,1fr)_auto]"
                                        key={`${request.id}-${detail.productId}`}
                                      >
                                        <span className="truncate text-ink-700">{detail.productName || `Producto #${detail.productId}`}</span>
                                        <span className="font-mono text-slate-500">{detail.requestedQuantity} unidades</span>
                                        <strong className="font-mono text-ink-950 max-[720px]:col-span-2 max-[720px]:justify-self-end">
                                          {formatClp(detail.requestedSubtotal)}
                                        </strong>
                                      </div>
                                    ))}
                                  </div>

                                  {(request.reviewerNames || request.reverserNames) && (
                                    <div className="grid gap-1 text-xs text-slate-500">
                                      {request.reviewerNames && (
                                        <span>
                                          Revisada por {request.reviewerNames} {request.reviewerSurnames}
                                          {request.reviewedAt
                                            ? ` el ${formatDate(request.reviewedAt, SALE_DATE_TIME_OPTIONS, "Sin fecha")}`
                                            : ""}
                                        </span>
                                      )}
                                      {request.reverserNames && (
                                        <span>
                                          Revertida por {request.reverserNames} {request.reverserSurnames}
                                          {request.reversedAt
                                            ? ` el ${formatDate(request.reversedAt, SALE_DATE_TIME_OPTIONS, "Sin fecha")}`
                                            : ""}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {canCancel && request.status === "APPROVED" && (
                                    <div className="flex justify-end border-t border-slate-200 pt-2">
                                      <button
                                        className={`${secondaryButtonClass} ${tableActionButtonClass} mr-0`}
                                        type="button"
                                        onClick={() => openUndoReturnModal(request, saleDetail)}
                                        disabled={submitting}
                                      >
                                        <RotateCcw size={16} />
                                        Deshacer devolución
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </article>
                          );
                        })}

                      </div>
                    </div>
                  )}
                </div>
              )}
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
              <label className="relative block min-w-65 flex-1 max-[720px]:min-w-0">
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
                className="min-h-9 w-full max-w-55 max-[720px]:max-w-none"
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
                  <article className="grid min-h-34.5 content-between gap-2 rounded-[5px] border border-slate-200 bg-[#fafbfc] p-3" key={product.id}>
                    <div className="grid gap-0.75">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="line-clamp-2 text-[13px] leading-tight text-ink-950">{product.name}</strong>
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

            <div className="grid max-h-90 gap-2 overflow-auto pr-1">
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
                <h2>
                  {salesFilter === "partial"
                    ? "Ventas devueltas parcialmente"
                    : salesFilter === "cancelled"
                    ? "Ventas canceladas"
                    : salesFilter === "pending" && canReviewCancellation
                      ? "Solicitudes pendientes"
                      : "Ventas vigentes"}
                </h2>
                <p>{formatTableRecordCount({
                  visibleCount: salesPagination.paginatedItems.length,
                  totalCount: salesByStatusFilter.length,
                  filteredCount: filteredSales.length,
                  hasFilters: hasSalesFilters,
                })}</p>
              </div>
              <div className="ml-auto flex flex-wrap justify-end gap-2 max-[720px]:w-full max-[720px]:justify-start">
                <button
                  className={`mr-0 min-h-9 px-3 text-xs ${salesFilter === "cancelled" ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100" : salesFilter === "partial" ? "border-ink-950 bg-rust-500 text-white hover:bg-rust-600" : "border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"}`}
                  type="button"
                  onClick={() => applySalesFilter(salesFilter === "partial" ? "current" : "partial")}
                  disabled={salesFilter === "cancelled"}
                  aria-pressed={salesFilter === "partial"}
                >
                  {salesFilter === "partial" ? "Mostrar ventas activas" : "Devueltas parcialmente"}
                </button>
                <button
                  className={`mr-0 min-h-9 px-3 text-xs ${salesFilter === "partial" ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100" : salesFilter === "cancelled" ? "border-ink-950 bg-rust-500 text-white hover:bg-rust-600" : "border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"}`}
                  type="button"
                  onClick={() => applySalesFilter(salesFilter === "cancelled" ? "current" : "cancelled")}
                  disabled={salesFilter === "partial"}
                  aria-pressed={salesFilter === "cancelled"}
                >
                  {salesFilter === "cancelled" ? "Mostrar ventas activas" : "Canceladas"}
                </button>
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
                    <th>Total original</th>
                    <th>Devuelto</th>
                    <th>Total neto</th>
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
                      <td className={numericCellClass}>{formatClp(getSaleTotals(sale).originalTotal)}</td>
                      <td className={numericCellClass}>{formatClp(getSaleTotals(sale).returnedTotal)}</td>
                      <td className={numericCellClass}>{formatClp(getSaleTotals(sale).netTotal)}</td>
                      <td>
                        <span className={badgeClass(getSaleStatusTone(sale.status))}>
                          {getSaleStatusLabel(sale.status)}
                        </span>
                      </td>
                      <td className="text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            className={`${secondaryButtonClass} ${tableActionButtonClass} mr-0!`}
                            type="button"
                            onClick={() => openDetailModal(sale)}
                            disabled={loadingSaleDetail}
                          >
                            <Eye size={17} />
                            Detalle
                          </button>
                          {canRequestCancellation &&
                            isReturnableSale(sale) &&
                            sale.cancellationRequest?.status !== "PENDING" && (
                              <button
                                className={`${secondaryButtonClass} ${tableActionButtonClass} border-rust-500 text-rust-600`}
                                type="button"
                                onClick={() => openCancellationRequestModal(sale)}
                                disabled={submitting}
                              >
                                <Send size={16} />
                                Solicitar devolución
                              </button>
                            )}
                          {canRequestCancellation &&
                            isReturnableSale(sale) &&
                            sale.cancellationRequest?.status === "PENDING" && (
                              <button
                                className={`${secondaryButtonClass} ${tableActionButtonClass} mr-0 border-amber-400 bg-amber-50 text-amber-800 disabled:cursor-not-allowed disabled:opacity-100`}
                                type="button"
                                disabled
                              >
                                <Clock3 size={16} />
                                Solicitud pendiente
                              </button>
                            )}
                          {canReviewCancellation &&
                            isReturnableSale(sale) &&
                            sale.cancellationRequest?.status === "PENDING" && (
                              <button
                                className={`${secondaryButtonClass} ${tableActionButtonClass} border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100`}
                                type="button"
                                onClick={() => openReviewModal(sale)}
                                disabled={submitting}
                              >
                                <Send size={16} />
                                Revisar solicitud
                              </button>
                            )}
                          {canCancel &&
                            isReturnableSale(sale) &&
                            sale.cancellationRequest?.status !== "PENDING" && (
                            <button
                              className={`${secondaryButtonClass} ${tableActionButtonClass} border-rust-500 text-rust-600`}
                              type="button"
                              onClick={() => openDirectReturnModal(sale)}
                              disabled={submitting}
                            >
                              <RotateCcw size={17} />
                              Registrar devolución
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td className={emptyTableCellClass} colSpan="9">
                        {sales.length === 0
                          ? "No hay ventas registradas."
                          : salesFilter === "pending" && canReviewCancellation
                            ? "No hay solicitudes de devolución pendientes."
                            : salesFilter === "partial"
                              ? "No hay ventas devueltas parcialmente con los filtros ingresados."
                              : salesFilter === "cancelled"
                              ? "No hay ventas canceladas con los filtros ingresados."
                              : "No se encontraron ventas con los filtros ingresados."}
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
