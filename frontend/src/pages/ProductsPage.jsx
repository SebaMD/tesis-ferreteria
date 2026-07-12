import { FileSpreadsheet, FolderPlus, Info, PackagePlus, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { downloadExcel } from "../helpers/excelExport.js";
import { compareByNewest, formatClp, formatDate, formatTableRecordCount } from "../helpers/formatters.js";
import { getMovementTone, isLowStockProduct } from "../helpers/inventory.js";
import { MOVEMENT_LABELS } from "../helpers/labels.js";
import { ADJUSTMENT_REASONS, CATEGORY_SUGGESTIONS, OTHER_UNIT, UNIT_OPTIONS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { createCategoryRequest, getCategoriesRequest } from "../services/categories.service.js";
import { createInventoryMovementRequest, getInventoryMovementsRequest } from "../services/inventory.service.js";
import { createProductRequest, getProductsRequest, updateProductRequest } from "../services/products.service.js";
import {
  alertClasses,
  badgeClass,
  codeCellClass,
  dateCellClass,
  emptyTableCellClass,
  formActionsClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableActionButtonClass,
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
const suggestionListClass = "mt-2 grid max-h-36 overflow-auto rounded-[5px] border border-slate-200 bg-white p-1 shadow-[0_8px_18px_rgba(16,21,31,0.08)]";
const suggestionButtonClass = "flex min-h-8 w-full items-center justify-between rounded-[4px] border-0 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-ink-700 hover:bg-rust-50 hover:text-rust-700";
const suggestionEmptyClass = "rounded-[5px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500";

function normalizeProductName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeCategoryName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function getSingleOrExactSuggestion(options, searchValue, getComparableValues) {
  const normalizedSearchValue = normalizeSearchValue(searchValue);

  if (normalizedSearchValue) {
    const exactMatch = options.find((option) =>
      getComparableValues(option).some((value) => normalizeSearchValue(value) === normalizedSearchValue),
    );

    if (exactMatch) return exactMatch;
  }

  return options.length === 1 ? options[0] : null;
}

const emptyForm = {
  categoryId: "",
  name: "",
  description: "",
  price: "",
  unitMeasure: "unidad",
  minimumStock: 0,
  status: true,
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

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [movementForm, setMovementForm] = useState(initialMovementForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [unitSelection, setUnitSelection] = useState("unidad");
  const [unitSearch, setUnitSearch] = useState("");
  const [showUnitSuggestions, setShowUnitSuggestions] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [submittingMovement, setSubmittingMovement] = useState(false);
  const [productCategory, setProductCategory] = useState("");
  const [movementCategorySearch, setMovementCategorySearch] = useState("");
  const [showMovementCategorySuggestions, setShowMovementCategorySuggestions] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showMovementProductSuggestions, setShowMovementProductSuggestions] = useState(false);
  const [activeView, setActiveView] = useState("inventory");

  const canManage = user?.role === "ADMIN";
  const canViewHistory = ["ADMIN", "MANAGER"].includes(user?.role);
  const canCreateMovement = user?.role === "ADMIN";
  const canExportInventory = user?.role === "ADMIN";
  const canViewAdministrativeStock = !["CASHIER", "WAREHOUSE"].includes(user?.role);
  const lowStockStatusLabel = canViewAdministrativeStock ? "Reponer" : "Bajo";
  const inventoryTableColumnCount = 7 + (canViewAdministrativeStock ? 1 : 0) + (canManage ? 1 : 0);
  const categoryOptions = useMemo(
    () =>
      [...new Map(products.map((product) => [product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
      }])).values()].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [products],
  );
  const activeProducts = useMemo(
    () => products.filter((product) => product.status !== false),
    [products],
  );
  const movementProductCategories = useMemo(
    () =>
      [...new Map(activeProducts.map((product) => [product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
      }])).values()].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [activeProducts],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredProducts = useMemo(
    () => products.filter((product) => {
      const matchesCategory = !categoryFilter || String(product.categoryId) === categoryFilter;
      const matchesLowStock = !lowStockOnly || isLowStockProduct(product);
      if (!matchesCategory) return false;
      if (!matchesLowStock) return false;
      if (!normalizedSearch) return true;

      return (
        String(product.id).includes(normalizedSearch) ||
        product.name.toLocaleLowerCase("es").includes(normalizedSearch) ||
        product.categoryName.toLocaleLowerCase("es").includes(normalizedSearch)
      );
    }).sort(compareByNewest),
    [categoryFilter, lowStockOnly, normalizedSearch, products],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );
  const existingCategoryNames = useMemo(
    () => new Set(categories.map((category) => normalizeCategoryName(category.name))),
    [categories],
  );
  const filteredFormCategories = useMemo(() => {
    const normalizedCategorySearch = categorySearch.trim().toLocaleLowerCase("es");

    return [...categories]
      .filter((category) =>
        !normalizedCategorySearch ||
        category.name.toLocaleLowerCase("es").includes(normalizedCategorySearch) ||
        String(category.id).includes(normalizedCategorySearch),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "es"));
  }, [categories, categorySearch]);
  const availableCategorySuggestions = useMemo(
    () => CATEGORY_SUGGESTIONS.filter((category) => !existingCategoryNames.has(normalizeCategoryName(category))),
    [existingCategoryNames],
  );
  const normalizedUnitSearch = unitSearch.trim().toLocaleLowerCase("es");
  const filteredUnitOptions = useMemo(
    () =>
      UNIT_OPTIONS.filter((unit) =>
        !normalizedUnitSearch ||
        unit.toLocaleLowerCase("es").includes(normalizedUnitSearch),
      ),
    [normalizedUnitSearch],
  );
  const productsPagination = usePagination(filteredProducts, {
    resetKey: `${categoryFilter}|${lowStockOnly}|${normalizedSearch}|${products.length}`,
  });
  const hasListFilters = Boolean(categoryFilter || normalizedSearch || lowStockOnly);
  const sortedMovements = useMemo(() => [...movements].sort(compareByNewest), [movements]);
  const filteredMovements = useMemo(
    () => sortedMovements.filter((movement) => {
      const product = productById.get(String(movement.productId));
      const matchesCategory = !categoryFilter || String(product?.categoryId || "") === categoryFilter;

      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;

      return (
        String(movement.id).includes(normalizedSearch) ||
        String(movement.productId || "").includes(normalizedSearch) ||
        String(movement.productName || "").toLocaleLowerCase("es").includes(normalizedSearch) ||
        String(product?.categoryName || "").toLocaleLowerCase("es").includes(normalizedSearch)
      );
    }),
    [categoryFilter, normalizedSearch, productById, sortedMovements],
  );
  const movementsPagination = usePagination(filteredMovements, {
    resetKey: `${categoryFilter}|${normalizedSearch}|${movements.length}`,
  });
  const hasMovementFilters = Boolean(categoryFilter || normalizedSearch);
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("es");
  const hasProductFilter = Boolean(productCategory || normalizedProductSearch);
  const filteredMovementProducts = hasProductFilter ? activeProducts.filter((product) => {
    const matchesCategory = !productCategory || String(product.categoryId) === productCategory;
    const matchesSearch =
      !normalizedProductSearch ||
      product.name.toLocaleLowerCase("es").includes(normalizedProductSearch) ||
      String(product.id).includes(normalizedProductSearch);
    return matchesCategory && matchesSearch;
  }) : [];
  const normalizedMovementCategorySearch = movementCategorySearch.trim().toLocaleLowerCase("es");
  const filteredMovementCategories = useMemo(
    () =>
      movementProductCategories.filter((category) =>
        !normalizedMovementCategorySearch ||
        category.name.toLocaleLowerCase("es").includes(normalizedMovementCategorySearch) ||
        String(category.id).includes(normalizedMovementCategorySearch),
      ),
    [movementProductCategories, normalizedMovementCategorySearch],
  );
  const loadData = async () => {
    const [productData, movementData] = await Promise.all([
      getProductsRequest(),
      canViewHistory ? getInventoryMovementsRequest() : Promise.resolve([]),
    ]);
    setProducts(productData);
    setMovements(movementData);

    if (canManage) {
      const categoryData = await getCategoriesRequest();
      setCategories(categoryData);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch((err) => setError(getApiError(err, "No se pudo cargar inventario")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canViewHistory]);

  useEffect(() => {
    if (!canViewHistory && activeView === "history") {
      setActiveView("inventory");
    }
  }, [activeView, canViewHistory]);

  useEffect(() => {
    if (!canViewAdministrativeStock && lowStockOnly) {
      setLowStockOnly(false);
    }
  }, [canViewAdministrativeStock, lowStockOnly]);

  const selectedMovementProduct = products.find((product) => product.id === Number(movementForm.productId));
  const estimatedStock = selectedMovementProduct
    ? movementForm.movementType === "ENTRY"
      ? Number(selectedMovementProduct.currentStock) + Number(movementForm.quantity || 0)
      : Number(movementForm.quantity || 0)
    : null;
  const estimatedLowStock =
    selectedMovementProduct &&
    estimatedStock !== null &&
    estimatedStock <= Number(selectedMovementProduct.minimumStock);

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedCategoryName = normalizeCategoryName(categoryName);

    if (existingCategoryNames.has(normalizedCategoryName)) {
      setError("Ya existe una categoría con ese nombre");
      return;
    }

    try {
      const category = await createCategoryRequest({ name: categoryName, description: "", status: true });
      setCategoryName("");
      setActiveForm(null);
      setMessage(`Categoria creada: ${category.name}`);
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo crear la categoria"));
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const duplicate = products.some(
      (product) =>
        product.id !== editingProductId &&
        product.categoryId === Number(form.categoryId) &&
        normalizeProductName(product.name) === normalizeProductName(form.name),
    );

    if (duplicate) {
      setError("Ya existe un producto con ese nombre en la categoria seleccionada");
      return;
    }

    try {
      const productData = {
        ...form,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
        minimumStock: Number(form.minimumStock),
      };

      if (editingProductId) {
        await updateProductRequest(editingProductId, productData);
      } else {
        await createProductRequest(productData);
      }

      setForm(emptyForm);
      setCategorySearch("");
      setShowCategorySuggestions(false);
      setUnitSelection("unidad");
      setUnitSearch("");
      setShowUnitSuggestions(false);
      setEditingProductId(null);
      setActiveForm(null);
      setMessage(editingProductId ? "Producto actualizado exitosamente" : "Producto creado exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo crear el producto"));
    }
  };

  const handleCreateMovement = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setWarning("");

    if (movementForm.movementType === "ADJUSTMENT" && !movementForm.adjustmentReason) {
      setError("Selecciona el motivo del ajuste administrativo");
      return;
    }

    if (
      movementForm.movementType === "ADJUSTMENT" &&
      movementForm.adjustmentReason === "Otro" &&
      !movementForm.reason.trim()
    ) {
      setError("Describe el motivo del ajuste administrativo");
      return;
    }

    try {
      setSubmittingMovement(true);
      const reason = movementForm.movementType === "ADJUSTMENT"
        ? `${movementForm.adjustmentReason}${movementForm.reason.trim() ? `: ${movementForm.reason.trim()}` : ""}`
        : movementForm.reason.trim();
      const movement = await createInventoryMovementRequest({
        productId: Number(movementForm.productId),
        movementType: movementForm.movementType,
        quantity: Number(movementForm.quantity),
        reason,
      });

      setMovementForm(initialMovementForm());
      setProductCategory("");
      setMovementCategorySearch("");
      setShowMovementCategorySuggestions(false);
      setProductSearch("");
      setShowMovementProductSuggestions(false);
      setActiveForm(null);
      setMessage(movementForm.movementType === "ENTRY" ? "Entrada registrada exitosamente" : "Ajuste registrado exitosamente");

      if (movement.stock?.lowStock) {
        setWarning(
          `${movement.stock.productName} quedó con stock bajo: ${movement.stock.currentStock} unidades. Mínimo: ${movement.stock.minimumStock}.`,
        );
      }

      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo registrar el movimiento"));
    } finally {
      setSubmittingMovement(false);
    }
  };

  const startEditing = (product) => {
    setEditingProductId(product.id);
    setActiveForm("product");
    setForm({
      categoryId: String(product.categoryId),
      name: product.name,
      description: product.description || "",
      price: product.price,
      unitMeasure: product.unitMeasure,
      minimumStock: product.minimumStock,
      status: product.status,
    });
    setUnitSelection(UNIT_OPTIONS.includes(product.unitMeasure) ? product.unitMeasure : OTHER_UNIT);
    setCategorySearch("");
    setShowCategorySuggestions(false);
    setUnitSearch(UNIT_OPTIONS.includes(product.unitMeasure) ? product.unitMeasure : "");
    setShowUnitSuggestions(false);
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setShowCategorySuggestions(false);
    setUnitSelection("unidad");
    setUnitSearch("");
    setShowUnitSuggestions(false);
    setActiveForm(null);
  };

  const openCategoryForm = () => {
    setActiveForm("category");
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setShowCategorySuggestions(false);
    setUnitSelection("unidad");
    setUnitSearch("");
    setShowUnitSuggestions(false);
    setError("");
    setMessage("");
  };

  const openProductForm = () => {
    setActiveForm("product");
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setShowCategorySuggestions(false);
    setUnitSelection("unidad");
    setUnitSearch("");
    setShowUnitSuggestions(false);
    setError("");
    setMessage("");
  };

  const openMovementForm = (movementType) => {
    setActiveForm(movementType);
    setMovementForm(initialMovementForm(movementType));
    setProductCategory("");
    setMovementCategorySearch("");
    setShowMovementCategorySuggestions(false);
    setProductSearch("");
    setShowMovementProductSuggestions(false);
    setError("");
    setMessage("");
    setWarning("");
  };

  const closeCategoryForm = () => {
    setActiveForm(null);
    setCategoryName("");
  };

  const closeMovementForm = () => {
    setActiveForm(null);
    setMovementForm(initialMovementForm());
    setProductCategory("");
    setMovementCategorySearch("");
    setShowMovementCategorySuggestions(false);
    setProductSearch("");
    setShowMovementProductSuggestions(false);
  };

  const handleUnitSelection = (value) => {
    setUnitSelection(value);
    setUnitSearch(value === OTHER_UNIT ? "" : value);
    setShowUnitSuggestions(false);
    setForm((current) => ({
      ...current,
      unitMeasure: value === OTHER_UNIT ? "" : value,
    }));
  };

  const selectProductCategory = (category) => {
    setForm((current) => ({ ...current, categoryId: String(category.id) }));
    setCategorySearch(category.name);
    setShowCategorySuggestions(false);
  };

  const selectUnitSuggestion = (unit) => {
    handleUnitSelection(unit);
  };

  const selectMovementCategory = (category) => {
    setProductCategory(String(category.id));
    setMovementCategorySearch(category.name);
    setShowMovementCategorySuggestions(false);
    setMovementForm((current) => ({ ...current, productId: "" }));
  };

  const handleMovementCategorySelect = (categoryId) => {
    const selectedCategory = movementProductCategories.find((category) => String(category.id) === String(categoryId));
    setProductCategory(categoryId);
    setMovementCategorySearch(selectedCategory?.name || "");
    setShowMovementCategorySuggestions(false);
    setMovementForm((current) => ({ ...current, productId: "" }));
  };

  const selectMovementProduct = (product) => {
    setProductCategory(String(product.categoryId));
    setMovementCategorySearch(product.categoryName);
    setShowMovementCategorySuggestions(false);
    setProductSearch(product.name);
    setShowMovementProductSuggestions(false);
    setMovementForm((current) => ({ ...current, productId: String(product.id) }));
  };

  const handleProductCategorySearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const category = getSingleOrExactSuggestion(
      filteredFormCategories,
      categorySearch,
      (item) => [item.name, item.id, `#${item.id}`],
    );

    if (category) selectProductCategory(category);
  };

  const handleUnitSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const unit = getSingleOrExactSuggestion(filteredUnitOptions, unitSearch, (item) => [item]);

    if (unit) selectUnitSuggestion(unit);
  };

  const handleMovementCategorySearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const category = getSingleOrExactSuggestion(
      filteredMovementCategories,
      movementCategorySearch,
      (item) => [item.name, item.id, `#${item.id}`],
    );

    if (category) selectMovementCategory(category);
  };

  const handleMovementProductSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const product = getSingleOrExactSuggestion(
      filteredMovementProducts,
      productSearch,
      (item) => [item.name, item.id, `#${item.id}`],
    );

    if (product) selectMovementProduct(product);
  };

  const handleMovementProductSelect = (productId) => {
    if (!productId) {
      setMovementForm((current) => ({ ...current, productId: "" }));
      return;
    }

    const product = activeProducts.find((item) => String(item.id) === String(productId));
    if (product) selectMovementProduct(product);
  };

  const updateMovementProductFilter = (field, value) => {
    if (field === "category") handleMovementCategorySelect(value);
    else {
      setProductSearch(value);
      setShowMovementProductSuggestions(Boolean(value.trim()));
    }
    setMovementForm((current) => ({ ...current, productId: "" }));
  };

  const handleExportProducts = () => {
    downloadExcel({
      filename: lowStockOnly ? "productos-a-reponer.xlsx" : "inventario-productos.xlsx",
      sheetName: "Productos",
      columns: [
        { key: "id", header: "ID" },
        { key: "producto", header: "Producto" },
        { key: "categoria", header: "Categoría" },
        { key: "precio", header: "Precio" },
        { key: "stockActual", header: "Stock actual" },
        { key: "unidad", header: "Unidad" },
        { key: "stockMinimo", header: "Stock mínimo" },
        { key: "estado", header: "Estado de stock" },
      ],
      rows: filteredProducts.map((product) => ({
        id: product.id,
        producto: product.name,
        categoria: product.categoryName,
        precio: Number(product.price || 0),
        stockActual: Number(product.currentStock || 0),
        unidad: product.unitMeasure,
        stockMinimo: Number(product.minimumStock || 0),
        estado: isLowStockProduct(product) ? "Reponer" : "Disponible",
      })),
    });
  };

  const handleExportMovements = () => {
    downloadExcel({
      filename: "historial-inventario.xlsx",
      sheetName: "Movimientos",
      columns: [
        { key: "fecha", header: "Fecha" },
        { key: "producto", header: "Producto" },
        { key: "tipo", header: "Tipo de movimiento" },
        { key: "cantidad", header: "Cantidad" },
        { key: "responsable", header: "Responsable" },
        { key: "motivo", header: "Motivo" },
      ],
      rows: filteredMovements.map((movement) => ({
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
          <p>Listado y gestión de productos</p>
        </div>
        {canViewHistory && (
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:[&>button]:flex-1">
            <button
              className={`min-h-11 rounded-[4px] border-2 px-4 py-2 text-sm font-extrabold ${activeView === "inventory" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
              type="button"
              onClick={() => setActiveView("inventory")}
              aria-pressed={activeView === "inventory"}
            >
              Inventario
            </button>
            <button
              className={`min-h-11 rounded-[4px] border-2 px-4 py-2 text-sm font-extrabold ${activeView === "history" ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
              type="button"
              onClick={() => setActiveView("history")}
              aria-pressed={activeView === "history"}
            >
              Historial de inventario
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
        <div className="flex min-w-[360px] flex-[0_1_540px] items-center gap-2.5 max-[980px]:min-w-0 max-[980px]:flex-1 max-[720px]:w-full max-[720px]:flex-none max-[720px]:flex-col max-[720px]:items-stretch">
          <label className="relative block w-full max-w-[340px] max-[720px]:max-w-none">
            <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
            <input
              className="pl-9.75"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={activeView === "history" ? "Buscar por ID de movimiento, producto o categoría" : "Buscar por ID, producto o categoría"}
              aria-label={activeView === "history" ? "Buscar movimientos" : "Buscar productos"}
            />
          </label>
          <select
            className="w-full max-w-[220px] flex-[0_1_220px] max-[720px]:max-w-none max-[720px]:flex-none"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filtrar productos por categoría"
          >
            <option value="">Todas las categorías</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
        {activeView === "inventory" && (canManage || canCreateMovement) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.25 max-[720px]:w-full max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:[&>button]:w-full">
            {canManage && (
              <>
            <button className={`${secondaryButtonClass} mr-0`} type="button" onClick={openCategoryForm}>
              <FolderPlus size={17} />
              Nueva categoría
            </button>
            <button type="button" onClick={openProductForm}>
              <Plus size={17} />
              Nuevo producto
            </button>
              </>
            )}
            {canCreateMovement && (
              <>
                <button type="button" onClick={() => openMovementForm("ENTRY")}>
                  <PackagePlus size={18} />
                  Registrar entrada
                </button>
                <button className={`${secondaryButtonClass} mr-0`} type="button" onClick={() => openMovementForm("ADJUSTMENT")}>
                  <SlidersHorizontal size={18} />
                  Ajuste administrativo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {message && <div className={alertClasses.success}>{message}</div>}
      {warning && <div className={alertClasses.warning}>{warning}</div>}
      {error && !activeForm && <div className={alertClasses.error}>{error}</div>}

      <AppModal
        open={canManage && activeForm === "category"}
        title="Nueva categoría"
        description="Organiza los productos dentro del catálogo."
        onClose={closeCategoryForm}
        size="small"
      >
          <form className="grid gap-3.75" onSubmit={handleCreateCategory}>
            {error && <div className={alertClasses.error}>{error}</div>}
            <label>
              Nombre
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required />
            </label>
            <div className="grid gap-2">
              <span className="text-[13px] font-[650] text-ink-700">Sugerencias comunes</span>
              {availableCategorySuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableCategorySuggestions.map((category) => (
                    <button
                      className={`${secondaryButtonClass} mr-0 min-h-8 px-2.75 text-xs`}
                      type="button"
                      key={category}
                      onClick={() => setCategoryName(category)}
                      title="Usar esta sugerencia"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={suggestionEmptyClass}>Ya se están usando todas las sugerencias</p>
              )}
            </div>
            <div className={formActionsClass}>
              <button className={secondaryButtonClass} type="button" onClick={closeCategoryForm}>Cancelar</button>
              <button type="submit">Guardar categoría</button>
            </div>
          </form>
      </AppModal>

      <AppModal
        open={canManage && activeForm === "product"}
        title={editingProductId ? "Editar producto" : "Nuevo producto"}
        description="Completa la información comercial y de inventario."
        onClose={cancelEditing}
        size="large"
      >
          <form className="grid gap-3.75" onSubmit={handleCreateProduct}>
            {error && <div className={alertClasses.error}>{error}</div>}
            <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
              <label className="relative">
                Buscar categoría
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    className="pl-9.75"
                    value={categorySearch}
                    onChange={(event) => {
                      setCategorySearch(event.target.value);
                      setShowCategorySuggestions(Boolean(event.target.value.trim()));
                    }}
                    onFocus={() => setShowCategorySuggestions(Boolean(categorySearch.trim()))}
                    onKeyDown={handleProductCategorySearchKeyDown}
                    placeholder="Nombre o ID de categoría"
                  />
                </div>
                {showCategorySuggestions && categorySearch.trim() && (
                  filteredFormCategories.length > 0 ? (
                    <div className={`${suggestionListClass} absolute top-full right-0 left-0 z-30`}>
                      {filteredFormCategories.slice(0, 6).map((category) => (
                        <button
                          className={suggestionButtonClass}
                          type="button"
                          key={category.id}
                          onClick={() => selectProductCategory(category)}
                        >
                          <span>{category.name}</span>
                          <span className="font-mono text-[11px] text-slate-500">#{category.id}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={`${suggestionEmptyClass} absolute top-full right-0 left-0 z-30 mt-2`}>No se encontraron categorías</p>
                  )
                )}
              </label>
              <label>
                Categoría
                <select
                  value={form.categoryId}
                  onChange={(event) => {
                    const selectedCategory = categories.find((category) => String(category.id) === event.target.value);
                    setForm((current) => ({ ...current, categoryId: event.target.value }));
                    if (selectedCategory) setCategorySearch(selectedCategory.name);
                    setShowCategorySuggestions(false);
                  }}
                  required
                >
                  <option value="">Seleccionar</option>
                  {filteredFormCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  {filteredFormCategories.length === 0 && (
                    <option disabled>No se encontraron categorías</option>
                  )}
                </select>
              </label>
            </div>
            <label>
              Nombre
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              Descripción
              <input
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
              <label className="relative">
                Buscar unidad de medida
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    className="pl-9.75"
                    value={unitSearch}
                    onChange={(event) => {
                      setUnitSearch(event.target.value);
                      setShowUnitSuggestions(Boolean(event.target.value.trim()));
                    }}
                    onFocus={() => setShowUnitSuggestions(Boolean(unitSearch.trim()))}
                    onKeyDown={handleUnitSearchKeyDown}
                    placeholder="Ej: caja, kg, metro"
                  />
                </div>
                {showUnitSuggestions && unitSearch.trim() && (
                  filteredUnitOptions.length > 0 ? (
                    <div className={`${suggestionListClass} absolute top-full right-0 left-0 z-30`}>
                      {filteredUnitOptions.slice(0, 6).map((unit) => (
                        <button
                          className={suggestionButtonClass}
                          type="button"
                          key={unit}
                          onClick={() => selectUnitSuggestion(unit)}
                        >
                          <span>{unit}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={`${suggestionEmptyClass} absolute top-full right-0 left-0 z-30 mt-2`}>No se encontraron unidades</p>
                  )
                )}
              </label>
              <label>
                Unidad de medida
                <select value={unitSelection} onChange={(event) => handleUnitSelection(event.target.value)} required>
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                  <option value={OTHER_UNIT}>Otra unidad</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
              <label>
                Precio
                <input
                  type="number"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  required
                />
              </label>
              <label>
                Stock minimo
                <input
                  type="number"
                  min="0"
                  value={form.minimumStock}
                  onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))}
                />
              </label>
            </div>
            {unitSelection === OTHER_UNIT && (
              <label>
                Unidad personalizada
                <input
                  value={form.unitMeasure}
                  onChange={(event) => setForm((current) => ({ ...current, unitMeasure: event.target.value }))}
                  placeholder="Ejemplo: balde"
                  maxLength="50"
                  required
                />
              </label>
            )}
            <div className={formActionsClass}>
              <button className={secondaryButtonClass} type="button" onClick={cancelEditing}>Cancelar</button>
              <button type="submit">{editingProductId ? "Actualizar producto" : "Guardar producto"}</button>
            </div>
          </form>
      </AppModal>

      <AppModal
        open={canCreateMovement && (activeForm === "ENTRY" || activeForm === "ADJUSTMENT")}
        title={activeForm === "ENTRY" ? "Registrar entrada" : "Registrar ajuste administrativo"}
        description={activeForm === "ENTRY"
          ? "Aumenta el stock disponible del producto seleccionado."
          : "Establece el stock exacto después de una revisión administrativa."}
        onClose={closeMovementForm}
        size="large"
      >
        <form className="grid gap-3.75" onSubmit={handleCreateMovement}>
          {error && <div className={alertClasses.error}>{error}</div>}
          {movementForm.movementType === "ADJUSTMENT" && (
            <div className="flex items-start gap-2.75 rounded-[5px] border border-l-4 border-slate-200 border-l-rust-500 bg-[#f8fafc] px-3.5 py-3 text-ink-700">
              <Info className="shrink-0 text-rust-600" size={19} />
              <div className="grid gap-0.75">
                <strong className="text-[13px] text-ink-950">Este ajuste establece el stock exacto del producto.</strong>
                <span className="text-xs leading-[1.45] text-slate-600">Úsalo para correcciones administrativas, nunca para registrar una venta manual.</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 items-start gap-3 max-[720px]:grid-cols-1">
            <label className="relative">
              Buscar categoría
              <div className="relative">
                <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                <input
                  className="pl-9.75"
                  value={movementCategorySearch}
                  onChange={(event) => {
                    setMovementCategorySearch(event.target.value);
                    setShowMovementCategorySuggestions(Boolean(event.target.value.trim()));
                  }}
                  onFocus={() => setShowMovementCategorySuggestions(Boolean(movementCategorySearch.trim()))}
                  onKeyDown={handleMovementCategorySearchKeyDown}
                  placeholder="Nombre o ID de categoría"
                />
              </div>
              {showMovementCategorySuggestions && movementCategorySearch.trim() && (
                filteredMovementCategories.length > 0 ? (
                  <div className={`${suggestionListClass} absolute top-full right-0 left-0 z-30`}>
                    {filteredMovementCategories.slice(0, 6).map((category) => (
                      <button
                        className={suggestionButtonClass}
                        type="button"
                        key={category.id}
                        onClick={() => selectMovementCategory(category)}
                      >
                        <span>{category.name}</span>
                        <span className="font-mono text-[11px] text-slate-500">#{category.id}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={`${suggestionEmptyClass} absolute top-full right-0 left-0 z-30 mt-2`}>No se encontraron categorías</p>
                )
              )}
            </label>
            <label>
              Categoría
              <select
                value={productCategory}
                onChange={(event) => updateMovementProductFilter("category", event.target.value)}
              >
                <option value="">Todas las categorías</option>
                {filteredMovementCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
                {filteredMovementCategories.length === 0 && (
                  <option disabled>No se encontraron categorías</option>
                )}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 items-start gap-3 max-[720px]:grid-cols-1">
            <label className="relative">
              Buscar producto
              <div className="relative">
                <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                <input
                  className="pl-9.75"
                  value={productSearch}
                  onChange={(event) => updateMovementProductFilter("search", event.target.value)}
                  onFocus={() => setShowMovementProductSuggestions(Boolean(productSearch.trim()))}
                  onKeyDown={handleMovementProductSearchKeyDown}
                  placeholder="Nombre o ID de producto"
                />
              </div>
              {showMovementProductSuggestions && productSearch.trim() && (
                filteredMovementProducts.length > 0 ? (
                  <div className={`${suggestionListClass} absolute top-full right-0 left-0 z-30`}>
                    {filteredMovementProducts.slice(0, 6).map((product) => (
                      <button
                        className={suggestionButtonClass}
                        type="button"
                        key={product.id}
                        onClick={() => selectMovementProduct(product)}
                      >
                        <span>{product.name}</span>
                        <span className="font-mono text-[11px] text-slate-500">#{product.id}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={`${suggestionEmptyClass} absolute top-full right-0 left-0 z-30 mt-2`}>No se encontraron productos activos</p>
                )
              )}
            </label>
            <label>
              Producto
              <select
                value={movementForm.productId}
                onChange={(event) => handleMovementProductSelect(event.target.value)}
                required
              >
                <option value="">
                  {hasProductFilter ? "Seleccionar producto" : "Elige categoría o busca por nombre"}
                </option>
                {hasProductFilter && filteredMovementProducts.length === 0 && (
                  <option disabled>Sin productos activos para este filtro</option>
                )}
                {filteredMovementProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    #{product.id} · {product.name} · {product.categoryName} · stock {product.currentStock} · mínimo {product.minimumStock}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {movementForm.movementType === "ENTRY" ? "Cantidad a ingresar" : "Nuevo stock exacto"}
            <input
              type="number"
              min={movementForm.movementType === "ADJUSTMENT" ? "0" : "1"}
              value={movementForm.quantity}
              onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))}
              required
            />
          </label>
          {movementForm.movementType === "ADJUSTMENT" ? (
            <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
              <label>
                Motivo del ajuste
                <select
                  value={movementForm.adjustmentReason}
                  onChange={(event) => setMovementForm((current) => ({ ...current, adjustmentReason: event.target.value }))}
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
                  value={movementForm.reason}
                  onChange={(event) => setMovementForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Describe la diferencia detectada"
                  required={movementForm.adjustmentReason === "Otro"}
                />
              </label>
            </div>
          ) : (
            <label>
              Motivo
              <input
                value={movementForm.reason}
                onChange={(event) => setMovementForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
          )}
          {selectedMovementProduct && (
            <div className={`grid gap-1 border-l-4 px-3.25 py-2.75 ${estimatedLowStock ? "border-l-rust-500 bg-rust-50 text-[#92400e]" : "border-l-positive-600 bg-positive-50"}`}>
              <span className="text-xs">Stock final estimado</span>
              <strong>
                {estimatedStock} unidades · mínimo {selectedMovementProduct.minimumStock}
              </strong>
              {estimatedLowStock && <span className="text-xs">Este movimiento dejará el producto con stock bajo.</span>}
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeMovementForm}>Cancelar</button>
            <button type="submit" disabled={submittingMovement}>
              {movementForm.movementType === "ENTRY" ? "Confirmar entrada" : "Confirmar ajuste administrativo"}
            </button>
          </div>
        </form>
      </AppModal>

      {activeView === "inventory" && (
      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Inventario de productos</h2>
            <p>{formatTableRecordCount({
              visibleCount: productsPagination.paginatedItems.length,
              totalCount: products.length,
              filteredCount: filteredProducts.length,
              hasFilters: hasListFilters,
            })}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {canViewAdministrativeStock && (
              <button
                className={`mr-0 min-h-9 px-3 text-xs ${lowStockOnly ? "bg-rust-500 text-white hover:bg-rust-600" : "border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"}`}
                type="button"
                onClick={() => setLowStockOnly((current) => !current)}
                aria-pressed={lowStockOnly}
              >
                {lowStockOnly ? "Mostrar todos los productos" : "Mostrar productos a reponer"}
              </button>
            )}
            {canExportInventory && (
              <button
                className="mr-0 border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"
                type="button"
                onClick={handleExportProducts}
                disabled={filteredProducts.length === 0}
              >
                <FileSpreadsheet size={17} />
                Exportar Excel
              </button>
            )}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Categoria</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Unidad</th>
              {canViewAdministrativeStock && <th>Minimo</th>}
              <th>Estado stock</th>
              {canManage && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {productsPagination.paginatedItems.map((product) => (
              <tr key={product.id}>
                <td className={codeCellClass}>#{product.id}</td>
                <td>{product.name}</td>
                <td>{product.categoryName}</td>
                <td className={numericCellClass}>{formatClp(product.price)}</td>
                <td className={numericCellClass}>{product.currentStock}</td>
                <td>{product.unitMeasure}</td>
                {canViewAdministrativeStock && <td className={numericCellClass}>{product.minimumStock}</td>}
                <td>
                  {isLowStockProduct(product) ? (
                    <span className={badgeClass("warning")}>{lowStockStatusLabel}</span>
                  ) : (
                    <span className={badgeClass("success")}>Disponible</span>
                  )}
                </td>
                {canManage && (
                  <td>
                    <button className={`${secondaryButtonClass} ${tableActionButtonClass}`} type="button" onClick={() => startEditing(product)}>
                      <Pencil size={17} />
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td className={emptyTableCellClass} colSpan={inventoryTableColumnCount}>
                  No se encontraron productos con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={productsPagination.page}
          pageSize={productsPagination.pageSize}
          totalItems={productsPagination.totalItems}
          totalPages={productsPagination.totalPages}
          onPageChange={productsPagination.setPage}
        />
      </div>
      )}

      {canViewHistory && activeView === "history" && (
        <div className={tablePanelClass}>
          <div className={tableHeadingClass}>
            <div>
              <h2>Historial de inventario</h2>
              <p>{formatTableRecordCount({
                visibleCount: movementsPagination.paginatedItems.length,
                totalCount: sortedMovements.length,
                filteredCount: filteredMovements.length,
                hasFilters: hasMovementFilters,
              })}</p>
            </div>
            {canExportInventory && (
              <button
                className="ml-auto mr-0 border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950"
                type="button"
                onClick={handleExportMovements}
                disabled={filteredMovements.length === 0}
              >
                <FileSpreadsheet size={17} />
                Exportar Excel
              </button>
            )}
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
                    <span className={badgeClass(getMovementTone(movement))}>
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
              {filteredMovements.length === 0 && (
                <tr>
                  <td className={emptyTableCellClass} colSpan="6">
                    {sortedMovements.length === 0
                      ? "No hay movimientos registrados."
                      : "No se encontraron movimientos con los filtros seleccionados."}
                  </td>
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
      )}
    </section>
  );
}
