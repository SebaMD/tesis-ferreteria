import { FolderPlus, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { compareByNewest, formatClp } from "../helpers/formatters.js";
import { CATEGORY_SUGGESTIONS, OTHER_UNIT, UNIT_OPTIONS } from "../helpers/options.js";
import useAuth from "../hooks/useAuth.js";
import usePagination from "../hooks/usePagination.js";
import { createCategoryRequest, getCategoriesRequest } from "../services/categories.service.js";
import { createProductRequest, getProductsRequest, updateProductRequest } from "../services/products.service.js";
import {
  alertClasses,
  badgeClass,
  codeCellClass,
  emptyTableCellClass,
  formActionsClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
} from "../helpers/uiClasses.js";

function normalizeProductName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeCategoryName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
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

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitSelection, setUnitSelection] = useState("unidad");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = user?.role === "ADMIN";
  const categoryOptions = useMemo(
    () =>
      [...new Map(products.map((product) => [product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
      }])).values()].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [products],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredProducts = useMemo(
    () => products.filter((product) => {
      const matchesCategory = !categoryFilter || String(product.categoryId) === categoryFilter;
      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;

      return (
        String(product.id).includes(normalizedSearch) ||
        product.name.toLocaleLowerCase("es").includes(normalizedSearch) ||
        product.categoryName.toLocaleLowerCase("es").includes(normalizedSearch)
      );
    }).sort(compareByNewest),
    [categoryFilter, normalizedSearch, products],
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
  const productsPagination = usePagination(filteredProducts, {
    resetKey: `${categoryFilter}|${normalizedSearch}`,
  });
  const existingCategoryNames = useMemo(
    () => new Set(categories.map((category) => normalizeCategoryName(category.name))),
    [categories],
  );

  const loadData = async () => {
    const productData = await getProductsRequest();
    setProducts(productData);

    if (canManage) {
      const categoryData = await getCategoriesRequest();
      setCategories(categoryData);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch((err) => setError(getApiError(err, "No se pudieron cargar productos")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setUnitSelection("unidad");
      setEditingProductId(null);
      setActiveForm(null);
      setMessage(editingProductId ? "Producto actualizado exitosamente" : "Producto creado exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo crear el producto"));
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
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setUnitSelection("unidad");
    setActiveForm(null);
  };

  const openCategoryForm = () => {
    setActiveForm("category");
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setUnitSelection("unidad");
    setError("");
    setMessage("");
  };

  const openProductForm = () => {
    setActiveForm("product");
    setEditingProductId(null);
    setForm(emptyForm);
    setCategorySearch("");
    setUnitSelection("unidad");
    setError("");
    setMessage("");
  };

  const closeCategoryForm = () => {
    setActiveForm(null);
    setCategoryName("");
  };

  const handleUnitSelection = (value) => {
    setUnitSelection(value);
    setForm((current) => ({
      ...current,
      unitMeasure: value === OTHER_UNIT ? "" : value,
    }));
  };

  return (
    <section className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Productos</h1>
          <p>
            {canManage
              ? "Listado y gestión de productos. El stock se modifica desde inventario."
              : "Consulta de productos, precios y stock disponible."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3.5 max-[720px]:flex-col max-[720px]:items-stretch">
        <div className="flex flex-[1_1_620px] items-center gap-2.5 max-[720px]:w-full max-[720px]:flex-none max-[720px]:flex-col max-[720px]:items-stretch">
          <label className="relative block w-full max-w-110 max-[720px]:max-w-none">
            <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
            <input
              className="pl-9.75"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por ID, producto o categoría"
              aria-label="Buscar productos"
            />
          </label>
          <select
            className="w-full max-w-65 flex-[0_1_260px] max-[720px]:max-w-none max-[720px]:flex-none"
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
        {canManage && (
          <div className="flex shrink-0 items-center justify-end gap-2.25 max-[720px]:w-full max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:[&>button]:w-full">
            <button className={`${secondaryButtonClass} mr-0`} type="button" onClick={openCategoryForm}>
              <FolderPlus size={17} />
              Nueva categoría
            </button>
            <button type="button" onClick={openProductForm}>
              <Plus size={17} />
              Nuevo producto
            </button>
          </div>
        )}
      </div>

      {message && <div className={alertClasses.success}>{message}</div>}
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
              <div className="flex flex-wrap gap-2">
                {CATEGORY_SUGGESTIONS.map((category) => {
                  const exists = existingCategoryNames.has(normalizeCategoryName(category));

                  return (
                    <button
                      className={`${secondaryButtonClass} mr-0 min-h-8 px-2.75 text-xs ${exists ? "opacity-50" : ""}`}
                      type="button"
                      key={category}
                      onClick={() => setCategoryName(category)}
                      disabled={exists}
                      title={exists ? "Esta categoría ya existe" : "Usar esta sugerencia"}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
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
              <label>
                Categoría
                <select
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
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
              <label>
                Buscar categoría
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    className="pl-9.75"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder="Nombre o ID de categoría"
                  />
                </div>
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
                Unidad de medida
                <select value={unitSelection} onChange={(event) => handleUnitSelection(event.target.value)} required>
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                  <option value={OTHER_UNIT}>Otra unidad</option>
                </select>
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
            <label>
              Stock minimo
              <input
                type="number"
                min="0"
                value={form.minimumStock}
                onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))}
              />
            </label>
            <div className={formActionsClass}>
              <button className={secondaryButtonClass} type="button" onClick={cancelEditing}>Cancelar</button>
              <button type="submit">{editingProductId ? "Actualizar producto" : "Guardar producto"}</button>
            </div>
          </form>
      </AppModal>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Catálogo de productos</h2>
            <p>{filteredProducts.length} de {products.length} productos</p>
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
              <th>Minimo</th>
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
                <td className={numericCellClass}>{product.minimumStock}</td>
                <td>
                  {product.currentStock <= product.minimumStock ? (
                    <span className={badgeClass("warning")}>Reponer</span>
                  ) : (
                    <span className={badgeClass("success")}>Disponible</span>
                  )}
                </td>
                {canManage && (
                  <td>
                    <button className={secondaryButtonClass} type="button" onClick={() => startEditing(product)}>
                      <Pencil size={17} />
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td className={emptyTableCellClass} colSpan={canManage ? 9 : 8}>
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
    </section>
  );
}
