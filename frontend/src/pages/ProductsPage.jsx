import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createCategoryRequest, getCategoriesRequest } from "../api/categories.api.js";
import { getApiError } from "../api/api.js";
import { createProductRequest, getProductsRequest, updateProductRequest } from "../api/products.api.js";
import { useAuth } from "../context/AuthContext.jsx";

function normalizeProductName(name) {
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
  const [categoryName, setCategoryName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = user?.role === "ADMIN";

  const loadData = async () => {
    const productData = await getProductsRequest();
    setProducts(productData);

    if (canManage) {
      const categoryData = await getCategoriesRequest();
      setCategories(categoryData);
    }
  };

  useEffect(() => {
    loadData().catch((err) => setError(getApiError(err, "No se pudieron cargar productos")));
  }, []);

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const category = await createCategoryRequest({ name: categoryName, description: "", status: true });
      setCategoryName("");
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
      setEditingProductId(null);
      setMessage(editingProductId ? "Producto actualizado exitosamente" : "Producto creado exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo crear el producto"));
    }
  };

  const startEditing = (product) => {
    setEditingProductId(product.id);
    setForm({
      categoryId: String(product.categoryId),
      name: product.name,
      description: product.description || "",
      price: product.price,
      unitMeasure: product.unitMeasure,
      minimumStock: product.minimumStock,
      status: product.status,
    });
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingProductId(null);
    setForm(emptyForm);
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Productos</h1>
          <p>
            {canManage
              ? "Listado y gestión de productos. El stock se modifica desde inventario."
              : "Consulta de productos, precios y stock disponible."}
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {canManage && (
        <div className="form-grid">
          <form className="panel" onSubmit={handleCreateCategory}>
            <h2>Crear categoria</h2>
            <label>
              Nombre
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required />
            </label>
            <button type="submit">Guardar categoria</button>
          </form>

          <form className="panel" onSubmit={handleCreateProduct}>
            <h2>{editingProductId ? "Editar producto" : "Crear producto"}</h2>
            <label>
              Categoria
              <select
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                required
              >
                <option value="">Seleccionar</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              Descripcion
              <input
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="inline-fields">
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
                Unidad
                <input
                  value={form.unitMeasure}
                  onChange={(event) => setForm((current) => ({ ...current, unitMeasure: event.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Stock minimo
              <input
                type="number"
                min="0"
                value={form.minimumStock}
                onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))}
              />
            </label>
            <div className="form-actions">
              {editingProductId && (
                <button className="secondary-button" type="button" onClick={cancelEditing}>
                  <X size={17} />
                  Cancelar edición
                </button>
              )}
              <button type="submit">{editingProductId ? "Actualizar producto" : "Guardar producto"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Categoria</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Minimo</th>
              <th>Estado stock</th>
              {canManage && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.id}</td>
                <td>{product.name}</td>
                <td>{product.categoryName}</td>
                <td>${product.price}</td>
                <td>{product.currentStock}</td>
                <td>{product.minimumStock}</td>
                <td>
                  {product.currentStock <= product.minimumStock ? (
                    <span className="status-badge warning">Reponer</span>
                  ) : (
                    <span className="status-badge success">Disponible</span>
                  )}
                </td>
                {canManage && (
                  <td>
                    <button className="secondary-button" type="button" onClick={() => startEditing(product)}>
                      <Pencil size={17} />
                      Editar
                    </button>
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
