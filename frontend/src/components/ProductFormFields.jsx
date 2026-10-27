import { useId, useState } from "react";
import { Search } from "lucide-react";
import { UNIT_OPTIONS } from "../helpers/options.js";

const normalize = value => String(value ?? "").trim().toLocaleLowerCase("es");

function ProductLookupField({ label, value, options, onChange, onSelect, placeholder, disabled, maxLength, emptyText, validationMessage = "", inputProps = {} }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = options.filter(option => option.search.some(text => normalize(text).includes(normalize(value))));
  const visible = matches.slice(0, 6);
  const choose = option => { onSelect(option); setOpen(false); setActive(-1); };
  return <div className="product-lookup-field relative grid min-w-0 content-start gap-1">
    <label htmlFor={id}>{label}</label>
    <span className="relative block">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17}/>
      <input {...inputProps} id={id} ref={element => { element?.setCustomValidity(validationMessage); }} className="pl-9.75" role="combobox" aria-autocomplete="list" aria-expanded={open && Boolean(value.trim())}
        aria-controls={`${id}-options`} aria-activedescendant={open && visible[active] ? `${id}-${active}` : undefined}
        value={value} disabled={disabled} required maxLength={maxLength} placeholder={placeholder} autoComplete="off"
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(index => visible.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length : -1);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const exact = matches.find(option => option.search.some(text => normalize(text) === normalize(value)));
            const choice = visible[active] || exact || (matches.length === 1 ? matches[0] : null);
            if (choice) choose(choice);
            else { onSelect({ value: null, label: value.trim().replace(/\s+/g, " ") }); setOpen(false); }
          }
        }}/>
    </span>
    {open && value.trim() && <div id={`${id}-options`} role="listbox" className="absolute top-full right-0 left-0 z-30 mt-2 grid max-h-36 overflow-auto rounded border border-slate-200 bg-white p-1 shadow-lg">
      {visible.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option" tabIndex={-1}
        aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}
        className={`m-0! flex min-h-9 w-full items-center justify-between rounded border-0 px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-rust-50 hover:text-rust-700 ${index === active ? "bg-slate-100" : "bg-white"}`}>
        <span>{option.label}</span>{option.hint && <span className="font-mono text-slate-500">{option.hint}</span>}
      </button>)}
      {!visible.length && <span className="p-2 text-xs text-slate-500">{emptyText}</span>}
    </div>}
  </div>;
}

export function ProductCategoryField({ categories, value, onChange, disabled = false, inputProps }) {
  const [search, setSearch] = useState("");
  const selected = categories.find(category => category.id === Number(value));
  const options = [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map(category => ({ value: String(category.id), label: category.name, hint: `#${category.id}`, search: [category.name, category.id, `#${category.id}`] }));
  return <ProductLookupField label="Buscar categoría" value={selected?.name || search} options={options} disabled={disabled} inputProps={inputProps}
    validationMessage={search && !selected ? "Selecciona una categoría desde el buscador." : ""}
    placeholder="Nombre o ID de categoría" emptyText="No se encontraron categorías" maxLength={100}
    onChange={text => { setSearch(text); onChange(""); }}
    onSelect={option => { if (option.value) { onChange(option.value); setSearch(option.label); } }}/>
}

export function ProductUnitField({ value, onChange, disabled = false, label = "Buscar unidad de medida", inputProps }) {
  return <ProductLookupField label={label} value={value} onChange={onChange} disabled={disabled} maxLength={50} inputProps={inputProps}
    options={UNIT_OPTIONS.map(unit => ({ value: unit, label: unit, search: [unit] }))}
    placeholder="Ej: caja, kg, metro" emptyText="Sin coincidencias. Puedes ingresar otra unidad."
    onSelect={option => { if (option.label) onChange(option.label); }}/>
}
