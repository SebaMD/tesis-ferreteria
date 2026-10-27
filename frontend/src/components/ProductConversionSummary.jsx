import { bundleRowLabels, bundleRowName } from "../helpers/productBundleForm.js";
import { formatClp } from "../helpers/formatters.js";
import { formatQuantityWithUnit } from "../helpers/units.js";

const sectionClass = "grid min-w-0 gap-2 rounded border border-slate-200 p-3 [overflow-wrap:anywhere]";

export default function ProductConversionSummary({ draft }) {
  const original = draft.original;
  const originalRow = draft.rows.find(row => row.isOriginal);
  const newRows = draft.rows.filter(row => !row.id);
  const combination = row => draft.attributes.map((attribute, index) => `${attribute.name}: ${bundleRowLabels(draft, row)[index]}`).join(" · ");
  return <div className="grid min-w-0 gap-3 text-sm">
    <section className={sectionClass} aria-label="Producto original conservado">
      <h3 className="m-0 text-base font-bold">Producto original</h3>
      <p className="m-0"><strong>#{original.id}</strong> · {original.name}</p>
      <p className="m-0">{combination(originalRow)}</p>
      <p className="m-0">Stock conservado: <strong>{formatQuantityWithUnit(original.currentStock, original.unitMeasure)}</strong></p>
      <p className="m-0">Precio actual: {formatClp(original.price)}{Number(original.price) !== Number(originalRow.price) && <> · Nuevo precio: <strong>{formatClp(originalRow.price)}</strong></>}</p>
      <p className="m-0">Código actual: {original.barcode || "Sin código"}{(original.barcode || "") !== (originalRow.barcode || "") && <> · Nuevo código: <strong>{originalRow.barcode || "Sin código"}</strong></>}</p>
    </section>
    <section className={sectionClass} aria-label="Variantes nuevas">
      <h3 className="m-0 text-base font-bold">Variantes nuevas ({newRows.length})</h3>
      {newRows.map(row => <article key={row.key} className="grid min-w-0 gap-1 rounded border border-slate-200 bg-slate-50 p-3">
        <h4 className="m-0 text-sm font-bold">{bundleRowName(draft, row)}</h4>
        <p className="m-0">{combination(row)}</p>
        <div className="grid min-w-0 gap-1">
          <span>Precio: {formatClp(row.price)}</span>
          <span>Stock mínimo: {formatQuantityWithUnit(row.minimumStock, row.unitMeasure ?? draft.unitMeasure)}</span>
          <span>Stock inicial: {formatQuantityWithUnit(row.initialStock, row.unitMeasure ?? draft.unitMeasure)}</span>
          {row.barcode && <span>Código: {row.barcode}</span>}
        </div>
      </article>)}
    </section>
    <section className={sectionClass} aria-label="Motivo de conversión">
      <h3 className="m-0 text-base font-bold">Motivo</h3>
      <p className="m-0 whitespace-pre-wrap">{draft.conversion.reason}</p>
    </section>
    <section className={sectionClass} aria-label="Resumen de conversión">
      <h3 className="m-0 text-base font-bold">Resumen</h3>
      <p className="m-0">Producto #{original.id} conservado. Variantes nuevas: {newRows.length}. Guardado en una única operación.</p>
      <p className="m-0">El original no generará otra entrada inicial. Las variantes nuevas con stock inicial positivo registrarán sus entradas correspondientes.</p>
    </section>
  </div>;
}
