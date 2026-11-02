import { ArrowRight } from "lucide-react";
import AppModal from "./AppModal.jsx";
import { formatQuantityWithUnit } from "../helpers/units.js";

export default function CreatedProductsStockDialog({ result, onClose, onEntry, onAnother }) {
  return <AppModal open={Boolean(result)} title="Productos guardados · Existencias y entradas" onClose={onClose} size="large" footer={<>
    <button className="product-positive-action" type="button" onClick={onClose}>Finalizar</button>
    {result?.category && <button type="button" className="creation-continue-action" onClick={onAnother}>Agregar otro producto a esta categoría</button>}
  </>}>
    <div className="grid min-w-0 gap-3">
      {result?.familyId && <strong>Familia #{result.familyId}</strong>}
      <p className="m-0 text-sm">El guardado ya terminó. Las cantidades iniciales positivas ya generaron su entrada; no vuelvas a ingresarlas. Registrar otra entrada añade unidades nuevas.</p>
      {result?.items.map(item => <section key={item.product.id} className="grid min-w-0 gap-2 rounded border border-slate-300 p-3">
        <strong className="break-words">Producto #{item.product.id} · {item.product.name}</strong>
        <span className="text-sm">Stock actual: {formatQuantityWithUnit(item.product.currentStock, item.product.unitMeasure)}{item.product.status === false ? " · Desactivado" : ""}</span>
        <span className="text-xs text-slate-600">{item.existing ? "Se conservaron las existencias del SKU original." : item.initialStock > 0 ? `Entrada inicial registrada: ${formatQuantityWithUnit(item.initialStock, item.product.unitMeasure)}.` : item.initialStock === 0 ? "Stock inicial cero: no se generó un movimiento." : "No se informa una entrada inicial en esta vista. Consulta el historial si recuperaste un guardado anterior."}</span>
        <button className="product-positive-action creation-continue-action" type="button" disabled={item.product.status === false} title={item.product.status === false ? "Activa el producto desde Inventario antes de registrar una entrada." : undefined} onClick={() => onEntry(item.product)}>
          <span>{item.initialStock > 0 || item.existing ? "Registrar otra entrada" : "Registrar entrada"} · SKU #{item.product.id}</span><ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>)}
    </div>
  </AppModal>;
}
