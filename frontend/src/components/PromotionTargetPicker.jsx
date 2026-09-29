import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import AppModal from "./AppModal.jsx";

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function SelectionChip({ children, onOpen, onRemove, openLabel, removeLabel }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-rust-600 bg-rust-50 px-2.5 text-xs font-bold text-rust-600">
      {onOpen ? (
        <button
          className="min-h-0 border-0 bg-transparent p-0 text-left text-rust-600 underline-offset-2 hover:bg-transparent hover:underline"
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          title="Revisar productos incluidos"
        >{children}</button>
      ) : <span>{children}</span>}
      <button className="size-6 min-h-6 border-0 bg-transparent p-0 text-rust-600 hover:bg-rust-50" type="button" onClick={onRemove} aria-label={removeLabel}><X size={13} /></button>
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
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [reviewCategoryId, setReviewCategoryId] = useState(null);
  const [reviewQuery, setReviewQuery] = useState("");
  const selectedProducts = new Set(productIds.map(Number));
  const selectedCategories = new Set(categoryIds.map(Number));
  const filteredProducts = useMemo(() => {
    const term = normalized(productQuery.trim());
    return term ? products.filter((product) => normalized(`${product.name} ${product.categoryName}`).includes(term)) : products;
  }, [productQuery, products]);
  const filteredCategories = useMemo(() => {
    const term = normalized(categoryQuery.trim());
    return term ? categories.filter((category) => normalized(category.name).includes(term)) : categories;
  }, [categories, categoryQuery]);
  const reviewCategory = categories.find((category) => Number(category.id) === Number(reviewCategoryId)) || null;
  const reviewedProducts = useMemo(() => {
    if (!reviewCategoryId) return [];
    const term = normalized(reviewQuery.trim());
    return products.filter((product) => (
      Number(product.categoryId) === Number(reviewCategoryId)
      && (!term || normalized(product.name).includes(term))
    ));
  }, [products, reviewCategoryId, reviewQuery]);

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
    if (product.status === false) return;
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
            return (
              <SelectionChip
                key={`category-${id}`}
                onOpen={() => { setReviewCategoryId(Number(id)); setReviewQuery(""); }}
                onRemove={() => toggleCategory(Number(id))}
                openLabel={`Revisar productos incluidos por ${category?.name || id}`}
                removeLabel={`Quitar categoría ${category?.name || id}`}
              >Categoría: {category?.name || id}</SelectionChip>
            );
          })}
          {productIds.map((id) => {
            const product = products.find((item) => Number(item.id) === Number(id));
            return <SelectionChip key={`product-${id}`} onRemove={() => product && toggleProduct(product)} removeLabel={`Quitar producto ${product?.name || id}`}>Producto: {product?.name || id}</SelectionChip>;
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
        <section className="grid min-w-0 content-start gap-2">
          <label className="relative grid gap-1 text-xs font-bold text-slate-600">Buscar categorías
            <Search className="pointer-events-none absolute bottom-3 left-3 text-slate-400" size={15} />
            <input className="pl-8" type="search" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Buscar categoría..." />
          </label>
          <div className="max-h-56 overflow-y-auto rounded-[5px] border border-slate-200 bg-white p-2">
            {filteredCategories.map((category) => (
              <label className="grid min-h-10 cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded px-2 text-sm hover:bg-slate-100" key={category.id}>
                <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={selectedCategories.has(category.id)} onChange={() => toggleCategory(category.id)} />
                <span className="min-w-0 leading-5">{category.name}</span>
              </label>
            ))}
            {filteredCategories.length === 0 && <p className="m-0 px-2 py-4 text-center text-xs text-slate-500">Sin coincidencias</p>}
          </div>
        </section>
        <section className="grid min-w-0 content-start gap-2">
          <label className="relative grid gap-1 text-xs font-bold text-slate-600">Buscar productos
            <Search className="pointer-events-none absolute bottom-3 left-3 text-slate-400" size={15} />
            <input className="pl-8" type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto..." />
          </label>
          <div className="max-h-56 overflow-y-auto rounded-[5px] border border-slate-200 bg-white p-2">
            {filteredProducts.map((product) => {
              const coveredByCategory = selectedCategories.has(Number(product.categoryId));
              const inactive = product.status === false;
              const disabled = coveredByCategory || inactive;
              return (
                <label className={`grid min-h-10 grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded px-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-100"}`} key={product.id} title={coveredByCategory ? "Ya está incluido mediante su categoría" : inactive ? "El producto está inactivo" : undefined}>
                  <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" disabled={disabled} checked={selectedProducts.has(product.id)} onChange={() => toggleProduct(product)} />
                  <span className="min-w-0"><strong className="block truncate text-ink-950">{product.name}</strong><small className="text-slate-500">{product.categoryName}{inactive ? " · Inactivo" : ""}</small></span>
                </label>
              );
            })}
            {filteredProducts.length === 0 && <p className="m-0 px-2 py-4 text-center text-xs text-slate-500">Sin coincidencias</p>}
          </div>
        </section>
      </div>

      <AppModal
        open={Boolean(reviewCategory)}
        onClose={() => { setReviewCategoryId(null); setReviewQuery(""); }}
        title={`Productos incluidos por ${reviewCategory?.name || "la categoría"}`}
        description="La categoría incluye dinámicamente todos sus productos. Para elegir solo algunos, quita la categoría y selecciónalos individualmente."
        size="medium"
      >
        <div className="grid gap-3">
          <label className="relative grid gap-1 text-xs font-bold text-slate-600">Buscar dentro de la categoría
            <Search className="pointer-events-none absolute bottom-3 left-3 text-slate-400" size={15} />
            <input className="pl-8" type="search" value={reviewQuery} onChange={(event) => setReviewQuery(event.target.value)} placeholder="Buscar producto..." />
          </label>
          <div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
            {reviewedProducts.map((product) => (
              <article className="flex min-h-11 items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2" key={product.id}>
                <strong className="min-w-0 text-sm text-ink-950">{product.name}</strong>
                <span className={`shrink-0 text-xs font-bold ${product.status === false ? "text-slate-500" : "text-positive-600"}`}>{product.status === false ? "Inactivo" : "Activo"}</span>
              </article>
            ))}
            {reviewedProducts.length === 0 && <p className="m-0 px-3 py-6 text-center text-sm text-slate-500">No hay productos que coincidan.</p>}
          </div>
        </div>
      </AppModal>
    </section>
  );
}
