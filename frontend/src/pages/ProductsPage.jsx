import { useEffect, useState } from "react";
import { createCategoryRequest, getCategoriesRequest } from "../api/categories.api.js";
import { getApiError } from "../api/api.js";
import { createProductRequest, getProductsRequest } from "../api/products.api.js";
import { useAuth } from "../context/AuthContext.jsx";

const emptyForm = {
  categoryId: "",
  name: "",
  description: "",
  price: "",
  unitMeasure: "unidad",
  currentStock: 0,
  minimumStock: 0,
  status: true,
};

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [categoryName, setCategoryName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = user?.role === "ADMIN";

  const loadData = async () => {
    const [productData, categoryData] = await Promise.all([getProductsRequest(), getCategoriesRequest()]);
    setProducts(productData);
    setCategories(categoryData);
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

    try {
      await createProductRequest({
        ...form,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
        currentStock: Number(form.currentStock),
        minimumStock: Number(form.minimumStock),
      });
      setForm(emptyForm);
      setMessage("Producto creado exitosamente");
      await loadData();
    } catch (err) {
      setError(getApiError(err, "No se pudo crear el producto"));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Productos</h1>
          <p>Listado, stock y creacion basica de productos.</p>
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
            <h2>Crear producto</h2>
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
            <div className="inline-fields">
              <label>
                Stock actual
                <input
                  type="number"
                  value={form.currentStock}
                  onChange={(event) => setForm((current) => ({ ...current, currentStock: event.target.value }))}
                />
              </label>
              <label>
                Stock minimo
                <input
                  type="number"
                  value={form.minimumStock}
                  onChange={(event) => setForm((current) => ({ ...current, minimumStock: event.target.value }))}
                />
              </label>
            </div>
            <button type="submit">Guardar producto</button>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
