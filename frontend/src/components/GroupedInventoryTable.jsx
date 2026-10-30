import { useState } from "react";
import { ChevronDown, Pencil, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import ResponsiveTableView, { MobileDetailField, MobileDetailGrid, MobileRowActions } from "./ResponsiveTableView.jsx";
import AppSelect from "./AppSelect.jsx";
import { inventoryVariantLabel, selectedInventoryProduct, inventoryGroupIdentity } from "../helpers/inventoryGroups.js";
import { getStockStatus, isLowStockProduct, isOutOfStockProduct } from "../helpers/inventory.js";
import { formatClp } from "../helpers/formatters.js";
import { badgeClass, secondaryButtonClass, dangerButtonClass, tableScrollClass, tableActionButtonClass } from "../helpers/uiClasses.js";

function StockBadge({ product, role, alert = false }) {
  const stock = getStockStatus(product, role);
  return <span className={badgeClass(product.status === false ? "neutral" : stock.tone)}>{alert && product.status !== false && (isLowStockProduct(product) || isOutOfStockProduct(product)) && <AlertTriangle size={14} className={`mr-1 ${isOutOfStockProduct(product) ? "text-critical-600" : "text-rust-600"}`}/>}{product.status === false ? "Desactivado" : stock.label}</span>;
}
function VariantPicker({ group, product, role, onSelect }) {
  const label = <span className="grid min-h-11 min-w-0 content-center gap-0.5"><span className="flex min-w-0 items-center gap-2">{group.kind === "family" && <ChevronDown size={16} className="shrink-0" />}<strong className="min-w-0 truncate" title={product.name}>{product.name}</strong>{group.kind === "family" && <>{group.outCount>0 && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-critical-600" aria-label={`${group.outCount} variantes sin stock`} title="Sin stock"><AlertTriangle size={14}/>{group.outCount}</span>}{group.lowCount>0 && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-rust-600" aria-label={`${group.lowCount} variantes a reponer`} title="A reponer"><AlertTriangle size={14}/>{group.lowCount}</span>}</>}</span>{product.brand && <small className="truncate text-slate-500">{product.brand}</small>}</span>;
  if (group.kind !== "family") return label;
  return <AppSelect className="inventory-variant-select w-full" value={product.id} onChange={id => onSelect(Number(id))} hideChevron transientOptionHighlight
    ariaLabel={`Elegir variante de ${group.name}. Actual: #${product.id} ${product.name}`}
    options={group.products.map(p => ({ value:p.id, label:`Producto #${p.id} · ${p.name}`, product:p }))}
    renderValue={() => label}
    renderOption={option => <span className="grid gap-1 py-2"><span className="break-words text-xs font-semibold">{option.label}</span><span className="break-words text-xs text-slate-500">{inventoryVariantLabel(option.product)}</span><StockBadge product={option.product} role={role} alert /></span>} />;
}

export default function GroupedInventoryTable({ groups, allProducts = [], role, canManage, canViewMinimum, onEdit, onStatus, onFamilyStatus, search = "" }) {
  const [selectedIds, setSelectedIds] = useState({});
  const selected = group => selectedInventoryProduct(group, selectedIds[group.key], search);
  const choose = (group, id) => setSelectedIds(current => ({ ...current, [group.key]: id }));
  const picker = group => <VariantPicker group={group} product={selected(group)} role={role} onSelect={id => choose(group, id)} />;
  const familyCounts = group => {
    const members = allProducts.length ? allProducts.filter(p => p.familyId === group.representative.familyId) : group.products;
    return { active: members.filter(p => p.status !== false).length, inactive: members.filter(p => p.status === false).length };
  };
  const actions = (product, group) => <>
    <button type="button" title={`Editar ${product.name}`} className={`${secondaryButtonClass} ${tableActionButtonClass} inventory-edit-action`} onClick={() => onEdit(product)}><Pencil size={16} aria-hidden="true"/>Editar</button>
    {group.kind === "family" ? familyCounts(group).active > 0
      ? <button type="button" className={`${dangerButtonClass} ${tableActionButtonClass} inventory-status-action mr-0!`} onClick={() => onFamilyStatus(group.representative.familyId)}><XCircle size={16} />Desactivar familia</button>
      : <span className="max-w-40 text-xs text-slate-500">Activación individual en Editar</span>
      : <button type="button" className={`${product.status === false ? secondaryButtonClass : dangerButtonClass} ${tableActionButtonClass} inventory-status-action mr-0!`} onClick={() => onStatus(product)}>{product.status === false ? <CheckCircle size={16} /> : <XCircle size={16} />}{product.status === false ? "Activar" : "Desactivar"}</button>}
  </>;
  const details = (product, group) => <><MobileDetailGrid>
    <MobileDetailField label="Producto seleccionado">Producto #{product.id}</MobileDetailField><MobileDetailField label="Código de barra">{product.barcode || "Sin código"}</MobileDetailField>
    <MobileDetailField label="Categoría">{product.categoryName}</MobileDetailField><MobileDetailField label="Marca">{product.brand || "Sin marca"}</MobileDetailField>
    <MobileDetailField label="Unidad">{product.unitMeasure}</MobileDetailField>{canViewMinimum && <MobileDetailField label="Stock mínimo">{product.minimumStock}</MobileDetailField>}
    {group.kind === "family" && <MobileDetailField label="Disponibilidad familiar">{familyCounts(group).active} activas · {familyCounts(group).inactive} inactivas</MobileDetailField>}
  </MobileDetailGrid>{canManage && <MobileRowActions>{actions(product, group)}</MobileRowActions>}</>;
  return <ResponsiveTableView rows={groups} getRowKey={g => g.key} getRowLabel={g => selected(g).name} emptyMessage="No se encontraron productos con los filtros seleccionados."
    renderSummary={group => { const product = selected(group); return <div className="grid min-w-0 gap-2">
      {picker(group)}<span className="break-words text-xs text-slate-500">{inventoryGroupIdentity(group)}</span>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong className="font-mono">{formatClp(product.price)}</strong><span>Stock: {product.currentStock}</span><StockBadge product={product} role={role} /></div>
    </div>; }}
    renderDetails={group => details(selected(group), group)}
    desktop={<div className={tableScrollClass}><table><thead><tr><th>ID</th><th>Producto</th><th>Código de barra</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Unidad</th>{canViewMinimum && <th>Mínimo</th>}<th>Estado stock</th>{canManage && <th>Acciones</th>}</tr></thead><tbody>
      {groups.map(group => { const product = selected(group); return <tr key={group.key}>
        <td className="font-mono whitespace-nowrap">{inventoryGroupIdentity(group)}</td><td className="w-72 min-w-48 max-w-80">{picker(group)}</td>
        <td className="font-mono">{product.barcode || "Sin código"}</td><td>{product.categoryName}</td><td className="text-right font-mono">{formatClp(product.price)}</td><td className="text-right font-mono">{product.currentStock}</td><td>{product.unitMeasure}</td>
        {canViewMinimum && <td className="text-right font-mono">{product.minimumStock}</td>}<td><StockBadge product={product} role={role} /></td>{canManage && <td><div className="flex flex-nowrap gap-1.5">{actions(product, group)}</div></td>}
      </tr>; })}
      {groups.length === 0 && <tr><td colSpan={8 + Number(canViewMinimum) + Number(canManage)} className="py-8! text-center">No se encontraron productos con los filtros seleccionados.</td></tr>}
    </tbody></table></div>} />;
}
