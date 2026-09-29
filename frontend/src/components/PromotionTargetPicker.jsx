import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function SelectionChip({ children, onRemove, label }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-rust-200 bg-rust-50 px-2.5 text-xs font-bold text-rust-700">
      <span>{children}</span>
      <button className="size-6 min-h-6 border-0 bg-transparent p-0 text-rust-700 hover:bg-rust-100" type="button" onClick={onRemove} aria-label={label}><X size={13} /></button>
    </span>
  );
}

export default function PromotionTargetPicker({
  products,
  categories,
  productIds,
  categoryIds,
  onChange,
}) {
  const [query, setQuery] = useState("");
  const selectedProducts = new Set(productIds.map(Number));
  const selectedCategories = new Set(categoryIds.map(Number));
  const filteredProducts = useMemo(() => {
    const term = normalized(query.trim());
    return term ? products.filter((product) => normalized(`${product.name} ${product.categoryName}`).includes(term)) : products;
  }, [products, query]);

  const toggleCategory = (categoryId) => {
    const nextCategories = new Set(selectedCategories);
    if (nextCategories.has(categoryId)) nextCategories.delete(categoryId);
    else nextCategories.add(categoryId);
    const nextProducts = productIds.filter((id) => {
      const product = products.find((item) => Number(item.id) === Number(id));
      return !nextCategories.has(Number(product?.categoryId));
    });
    onChange({ productIds: nextProducts, categoryIds: [...nextCategories] });
  };

  const toggleProduct = (product) => {
    const nextProducts = new Set(selectedProducts);
    if (nextProducts.has(product.id)) nextProducts.delete(product.id);
    else nextProducts.add(product.id);
    onChange({ productIds: [...nextProducts], categoryIds });
  };

  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4" aria-labelledby="promotion-targets-title">
      <h3 id="promotion-targets-title" className="m-0 text-sm font-bold text-ink-950">Productos y categorías</h3>
      <p className="m-0 text-xs leading-5 text-slate-500">Selecciona al menos un objetivo. Un producto incluido mediante categoría no necesita seleccionarse de nuevo.</p>

      {(productIds.length > 0 || categoryIds.length > 0) && (
        <div className="flex flex-wrap gap-2" aria-label="Objetivos seleccionados">
          {categoryIds.map((id) => {
            const category = categories.find((item) => Number(item.id) === Number(id));
            return <SelectionChip key={`category-${id}`} onRemove={() => toggleCategory(Number(id))} label={`Quitar categoría ${category?.name || id}`}>Categoría: {category?.name || id}</SelectionChip>;
          })}
          {productIds.map((id) => {
            const product = products.find((item) => Number(item.id) === Number(id));
            return <SelectionChip key={`product-${id}`} onRemove={() => product && toggleProduct(product)} label={`Quitar producto ${product?.name || id}`}>Producto: {product?.name || id}</SelectionChip>;
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
        <section className="grid content-start gap-2">
          <strong className="text-xs text-slate-600">Categorías</strong>
          <div className="max-h-56 overflow-y-auto rounded-[5px] border border-slate-200 bg-white p-2">
            {categories.map((category) => (
              <label className="grid min-h-10 cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded px-2 text-sm hover:bg-slate-100" key={category.id}>
                <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={selectedCategories.has(category.id)} onChange={() => toggleCategory(category.id)} />
                <span className="min-w-0 leading-5">{category.name}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="grid min-w-0 content-start gap-2">
          <label className="relative grid gap-1 text-xs font-bold text-slate-600">Buscar productos
            <Search className="pointer-events-none absolute bottom-3 left-3 text-slate-400" size={15} />
            <input className="pl-8" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o categoría" />
          </label>
          <div className="max-h-56 overflow-y-auto rounded-[5px] border border-slate-200 bg-white p-2">
            {filteredProducts.map((product) => {
              const coveredByCategory = selectedCategories.has(Number(product.categoryId));
              return (
                <label className={`grid min-h-10 grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded px-2 text-sm ${coveredByCategory ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-100"}`} key={product.id} title={coveredByCategory ? "Ya está incluido mediante su categoría" : undefined}>
                  <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" disabled={coveredByCategory} checked={selectedProducts.has(product.id)} onChange={() => toggleProduct(product)} />
                  <span className="min-w-0"><strong className="block truncate text-ink-950">{product.name}</strong><small className="text-slate-500">{product.categoryName}</small></span>
                </label>
              );
            })}
            {filteredProducts.length === 0 && <p className="m-0 px-2 py-4 text-center text-xs text-slate-500">Sin coincidencias</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
