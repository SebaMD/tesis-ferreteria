import { ATTRIBUTE_MEASUREMENTS } from "../helpers/attributeMeasurements.js";

export default function AttributeMeasurementFields({ attribute, label, disabled, hasValues, onChange }) {
  if (attribute.id) return <p className="m-0 wrap-break-word text-xs text-slate-500">{attribute.unitCode
    ? `Atributo cuantitativo · ${ATTRIBUTE_MEASUREMENTS[attribute.measurementKind]?.label || "Magnitud"} · ${attribute.unitCode}. Tipo, unidad y valores guardados protegidos; no es la unidad de venta del SKU.`
    : "Atributo de texto. Las etiquetas existentes se conservan; no se convierten automáticamente a magnitudes."}</p>;
  return <div className="grid min-w-0 gap-1">
    <fieldset disabled={disabled || hasValues} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-3">
      <label>Tipo de {label}<select value={attribute.measurementKind ? "quantity" : "text"} onChange={e => onChange(e.target.value === "text" ? { measurementKind: null, unitCode: null } : { measurementKind: "length", unitCode: "" })}>
        <option value="text">Texto sin unidad</option><option value="quantity">Cuantitativo con unidad</option>
      </select></label>
      {attribute.measurementKind && <><label>Magnitud de {label}<select value={attribute.measurementKind} onChange={e => onChange({ measurementKind: e.target.value, unitCode: "" })}>
        {Object.entries(ATTRIBUTE_MEASUREMENTS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select></label><label>Unidad de {label}<select required value={attribute.unitCode || ""} onChange={e => onChange({ measurementKind: attribute.measurementKind, unitCode: e.target.value })}>
        <option value="">Selecciona unidad</option>{ATTRIBUTE_MEASUREMENTS[attribute.measurementKind]?.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
      </select></label></>}
    </fieldset>
    {attribute.measurementKind&&<p className="m-0 text-xs text-slate-500">Ingresa números positivos sin unidad ni separador de miles. Coma o punto indican decimales (ej.: 1,5). La vista previa muestra la etiqueta que se guardará.</p>}
    <p className="m-0 text-xs text-slate-500">{hasValues ? "Para cambiar el tipo o la unidad del borrador, vacía primero sus opciones. No se convierten magnitudes automáticamente." : "Configura antes de ingresar opciones. La unidad descriptiva quedará fija al guardar y es independiente de la unidad de venta o inventario."}</p>
  </div>;
}
