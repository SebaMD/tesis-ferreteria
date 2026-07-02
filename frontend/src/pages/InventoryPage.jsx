import { AlertTriangle, FileSpreadsheet, Info, PackagePlus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { downloadExcel } from "../helpers/excelExport.js";
import { compareByNewest, formatDate } from "../helpers/formatters.js";
import { MOVEMENT_LABELS } from "../helpers/labels.js";
import { ADJUSTMENT_REASONS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { createInventoryMovementRequest, getInventoryMovementsRequest } from "../services/inventory.service.js";
import { getProductsRequest } from "../services/products.service.js";
import {
  alertClasses,
  badgeClass,
  dateCellClass,
  emptyTableCellClass,
  formActionsClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
} from "../helpers/uiClasses.js";

const INVENTORY_DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function initialMovementForm(movementType = "ENTRY") {
  return {
    productId: "",
    movementType,
    quantity: movementType === "ADJUSTMENT" ? 0 : 1,
    adjustmentReason: "",
    reason: movementType === "ENTRY" ? "Ingreso de stock" : "",
  };
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function InventoryPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState(initialMovementForm);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeForm, setActiveForm] = useState(null);
  const [productCategory, setProductCategory] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const canCreate = user?.role === "ADMIN";
  const canExport = user?.role === "ADMIN";
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
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("es");
  const hasProductFilter = Boolean(productCategory || normalizedProductSearch);
  const filteredProducts = hasProductFilter ? activeProducts.filter((product) => {
    const matchesCategory = !productCategory || String(product.categoryId) === productCategory;
    const matchesSearch =
      !normalizedProductSearch ||
      product.name.toLocaleLowerCase("es").includes(normalizedProductSearch) ||
      String(product.id).includes(normalizedProductSearch);
    return matchesCategory && matchesSearch;
  }) : [];
  const lowStockProducts = products.filter(
    (product) => product.status !== false && product.currentStock <= product.minimumStock,
  );
  const sortedMovements = useMemo(() => [...movements].sort(compareByNewest), [movements]);
  const movementsPagination = usePagination(sortedMovements, {
    resetKey: String(movements.length),
  });

  const loadData = async () => {
    const [productData, movementData] = await Promise.all([getProductsRequest(), getInventoryMovementsRequest()]);
    setProducts(productData);
    setMovements(movementData);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

    if (form.movementType === "ADJUSTMENT" && !form.adjustmentReason) {
      setError("Selecciona el motivo del ajuste administrativo");
      return;
    }

    if (form.movementType === "ADJUSTMENT" && form.adjustmentReason === "Otro" && !form.reason.trim()) {
      setError("Describe el motivo del ajuste administrativo");
      return;
    }

    try {
      setSubmitting(true);
      const reason = form.movementType === "ADJUSTMENT"
        ? `${form.adjustmentReason}${form.reason.trim() ? `: ${form.reason.trim()}` : ""}`
        : form.reason.trim();
      const movement = await createInventoryMovementRequest({
        productId: Number(form.productId),
        movementType: form.movementType,
        quantity: Number(form.quantity),
        reason,
      });
      setForm(initialMovementForm());
      setProductCategory("");
      setProductSearch("");
      setActiveForm(null);
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

  const openMovementForm = (movementType) => {
    setActiveForm(movementType);
    setForm(initialMovementForm(movementType));
    setProductCategory("");
    setProductSearch("");
    setError("");
    setMessage("");
    setWarning("");
  };

  const closeMovementForm = () => {
    setActiveForm(null);
    setForm(initialMovementForm());
    setProductCategory("");
    setProductSearch("");
  };

  const updateProductFilter = (field, value) => {
    if (field === "category") setProductCategory(value);
    else setProductSearch(value);
    setForm((current) => ({ ...current, productId: "" }));
  };

  const handleExportInventory = () => {
    downloadExcel({
      filename: `movimientos-inventario-${dateInputValue(new Date())}.xlsx`,
      sheetName: "Inventario",
      columns: [
        { key: "fecha", header: "Fecha" },
        { key: "producto", header: "Producto" },
        { key: "tipo", header: "Tipo de movimiento" },
        { key: "cantidad", header: "Cantidad" },
        { key: "responsable", header: "Responsable" },
        { key: "motivo", header: "Motivo" },
      ],
      rows: sortedMovements.map((movement) => ({
        fecha: formatDate(movement.date || movement.createdAt, INVENTORY_DATE_OPTIONS),
        producto: movement.productName,
        tipo: MOVEMENT_LABELS[movement.movementType] || movement.movementType,
        cantidad: Number(movement.quantity || 0),
        responsable: movement.userNames || movement.userSurnames
          ? `${movement.userNames || ""} ${movement.userSurnames || ""}`.trim()
          : "Sistema",
        motivo: movement.reason || "Sin motivo",
      })),
    });
  };

  return (
    <section className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Inventario</h1>
          <p>Consultar movimientos y registrar entradas o ajustes administrativos.</p>
        </div>
      </div>

      {(lowStockProducts.length > 0 || canCreate) && (
        <div className="flex items-start justify-between gap-4 max-[720px]:flex-col max-[720px]:items-stretch">
          {lowStockProducts.length > 0 && (
            <div className="flex w-fit max-w-[min(720px,100%)] flex-[0_1_auto] items-start gap-3.25 rounded-[5px] border border-l-4 border-[#fed7aa] border-l-rust-500 bg-rust-50 px-4 py-3.5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-[#ffedd5] text-rust-600"><AlertTriangle size={20} /></span>
              <div>
                <strong className="m-0 text-[13px] text-[#7c2d12]">{lowStockProducts.length} {lowStockProducts.length === 1 ? "producto necesita" : "productos necesitan"} reposición</strong>
                <p className="mt-1 mb-0 text-xs leading-6 text-[#9a3412]">
                  {lowStockProducts.slice(0, 5).map((product) => product.name).join(", ")}
                  {lowStockProducts.length > 5 && ` y ${lowStockProducts.length - 5} más`}.
                </p>
              </div>
            </div>
          )}

          {canCreate && (
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2.25 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:[&>button]:w-full">
              <button type="button" onClick={() => openMovementForm("ENTRY")}>
                <PackagePlus size={18} />
                Registrar entrada
              </button>
              <button className={`${secondaryButtonClass} mr-0`} type="button" onClick={() => openMovementForm("ADJUSTMENT")}>
                <SlidersHorizontal size={18} />
                Ajuste administrativo
              </button>
              {canExport && (
                <button className={`${secondaryButtonClass} mr-0`} type="button" onClick={handleExportInventory} disabled={sortedMovements.length === 0}>
                  <FileSpreadsheet size={17} />
                  Exportar Excel
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {message && <div className={alertClasses.success}>{message}</div>}
      {warning && <div className={alertClasses.warning}>{warning}</div>}
      {error && !activeForm && <div className={alertClasses.error}>{error}</div>}

      <AppModal
        open={canCreate && Boolean(activeForm)}
        title={activeForm === "ENTRY" ? "Registrar entrada" : "Registrar ajuste administrativo"}
        description={activeForm === "ENTRY"
          ? "Aumenta el stock disponible del producto seleccionado."
          : "Establece el stock exacto después de una revisión administrativa."}
        onClose={closeMovementForm}
        size="large"
      >
        <form className="grid gap-3.75" onSubmit={handleSubmit}>
          {error && <div className={alertClasses.error}>{error}</div>}
          {form.movementType === "ADJUSTMENT" && (
            <div className="flex items-start gap-2.75 rounded-[5px] border border-l-4 border-slate-200 border-l-rust-500 bg-[#f8fafc] px-3.5 py-3 text-ink-700">
              <Info className="shrink-0 text-rust-600" size={19} />
              <div className="grid gap-0.75">
                <strong className="text-[13px] text-ink-950">Este ajuste establece el stock exacto del producto.</strong>
                <span className="text-xs leading-[1.45] text-slate-600">Úsalo para correcciones administrativas, nunca para registrar una venta manual.</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Categoría
              <select
                value={productCategory}
                onChange={(event) => updateProductFilter("category", event.target.value)}
              >
                <option value="">Todas las categorías</option>
                {productCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Buscar producto
              <input
                value={productSearch}
                onChange={(event) => updateProductFilter("search", event.target.value)}
                placeholder="Nombre o ID"
              />
            </label>
          </div>
          <label>
            Producto
            <select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} required>
              <option value="">
                {hasProductFilter ? "Seleccionar producto" : "Elige categoría o busca por nombre"}
              </option>
              {hasProductFilter && filteredProducts.length === 0 && (
                <option disabled>Sin productos activos para este filtro</option>
              )}
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  #{product.id} · {product.name} · {product.categoryName} · stock {product.currentStock} · mínimo {product.minimumStock}
                </option>
              ))}
            </select>
          </label>
          <label>
            {form.movementType === "ENTRY" ? "Cantidad a ingresar" : "Nuevo stock exacto"}
            <input
              type="number"
              min={form.movementType === "ADJUSTMENT" ? "0" : "1"}
              value={form.quantity}
              onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
              required
            />
          </label>
          {form.movementType === "ADJUSTMENT" ? (
            <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
              <label>
                Motivo del ajuste
                <select
                  value={form.adjustmentReason}
                  onChange={(event) => setForm((current) => ({ ...current, adjustmentReason: event.target.value }))}
                  required
                >
                  <option value="">Seleccionar motivo</option>
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </label>
              <label>
                Observación detallada
                <input
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Describe la diferencia detectada"
                  required={form.adjustmentReason === "Otro"}
                />
              </label>
            </div>
          ) : (
            <label>
              Motivo
              <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
            </label>
          )}
          {selectedProduct && (
            <div className={`grid gap-1 border-l-4 px-3.25 py-2.75 ${estimatedLowStock ? "border-l-rust-500 bg-rust-50 text-[#92400e]" : "border-l-positive-600 bg-positive-50"}`}>
              <span className="text-xs">Stock final estimado</span>
              <strong>
                {estimatedStock} unidades · mínimo {selectedProduct.minimumStock}
              </strong>
              {estimatedLowStock && <span className="text-xs">Este movimiento dejará el producto con stock bajo.</span>}
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeMovementForm}>Cancelar</button>
            <button type="submit" disabled={submitting}>
              {form.movementType === "ENTRY" ? "Confirmar entrada" : "Confirmar ajuste administrativo"}
            </button>
          </div>
        </form>
      </AppModal>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Historial de movimientos</h2>
            <p>{movements.length} movimientos registrados</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Usuario</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movementsPagination.paginatedItems.map((movement) => (
              <tr key={movement.id}>
                <td className={dateCellClass}>{formatDate(movement.date || movement.createdAt, INVENTORY_DATE_OPTIONS)}</td>
                <td>{movement.productName}</td>
                <td>
                  <span className={badgeClass(movement.movementType === "EXIT" ? "critical" : movement.movementType === "ADJUSTMENT" ? "neutral" : "success")}>
                    {MOVEMENT_LABELS[movement.movementType] || movement.movementType}
                  </span>
                </td>
                <td className={numericCellClass}>{movement.quantity}</td>
                <td>
                  {movement.userNames || movement.userSurnames
                    ? `${movement.userNames || ""} ${movement.userSurnames || ""}`.trim()
                    : "Sistema"}
                </td>
                <td>{movement.reason || "Sin motivo"}</td>
              </tr>
            ))}
            {sortedMovements.length === 0 && (
              <tr>
                <td className={emptyTableCellClass} colSpan="6">No hay movimientos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={movementsPagination.page}
          pageSize={movementsPagination.pageSize}
          totalItems={movementsPagination.totalItems}
          totalPages={movementsPagination.totalPages}
          onPageChange={movementsPagination.setPage}
        />
      </div>
    </section>
  );
}
