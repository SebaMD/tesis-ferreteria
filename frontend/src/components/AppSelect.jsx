import { Check, ChevronDown, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPTION_HEIGHT = 40;
const MAX_VISIBLE_HEIGHT = OPTION_HEIGHT * 5.5;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export default function AppSelect({
  value,
  onChange,
  options = [],
  placeholder = "Seleccionar",
  ariaLabel,
  disabled = false,
  searchable,
  className = "",
  id,
  name,
}) {
  const generatedId = useId();
  const selectId = id || `app-select-${generatedId.replace(/:/g, "")}`;
  const listboxId = `${selectId}-listbox`;
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const hasSearch = searchable ?? options.length > 6;

  const normalizedOptions = useMemo(() => options.map((option) => (
    typeof option === "object"
      ? option
      : { value: option, label: String(option) }
  )), [options]);
  const filteredOptions = useMemo(() => {
    const term = normalize(query);
    return term
      ? normalizedOptions.filter((option) => normalize(option.label).includes(term))
      : normalizedOptions;
  }, [normalizedOptions, query]);
  const selected = normalizedOptions.find((option) => String(option.value) === String(value));

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const expectedHeight = MAX_VISIBLE_HEIGHT + (hasSearch ? 53 : 0) + 2;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openAbove = below < Math.min(expectedHeight, 180) && above > below;
    const available = Math.max(150, Math.min(expectedHeight, openAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 190), window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    setPosition({
      left,
      width,
      maxHeight: available,
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [hasSearch]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    if (hasSearch) window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, hasSearch]);

  const boundedActiveIndex = Math.min(activeIndex, Math.max(0, filteredOptions.length - 1));

  const openPopup = () => {
    setQuery("");
    const selectedIndex = normalizedOptions.findIndex((option) => String(option.value) === String(value));
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange?.(option.value);
    close();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Tab" && open) {
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openPopup();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let next = boundedActiveIndex;
      for (let attempts = 0; attempts < filteredOptions.length; attempts += 1) {
        next = (next + direction + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[next]?.disabled) break;
      }
      setActiveIndex(next);
      window.requestAnimationFrame(() => document.getElementById(`${selectId}-option-${next}`)?.scrollIntoView({ block: "nearest" }));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(filteredOptions[boundedActiveIndex]);
    }
  };

  const popup = open && position ? (
    <div
      className="app-select-popup fixed z-1000 flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-[0_16px_40px_rgba(10,14,21,0.2)]"
      ref={popupRef}
      style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
      onKeyDown={handleKeyDown}
    >
      {hasSearch && (
        <div className="relative shrink-0 border-b border-slate-200 p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-500" size={16} />
          <input
            className="min-h-9 pr-9 pl-8 text-sm"
            ref={searchRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            placeholder="Buscar..."
            aria-label={`Buscar en ${ariaLabel || placeholder}`}
          />
          {query && (
            <button className="absolute top-1/2 right-3 size-8 min-h-0 -translate-y-1/2 border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100" type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Limpiar búsqueda">
              <X size={15} />
            </button>
          )}
        </div>
      )}
      <div className="app-select-options min-h-0 overflow-y-auto overscroll-contain py-1" id={listboxId} role="listbox" aria-label={ariaLabel || placeholder} style={{ maxHeight: MAX_VISIBLE_HEIGHT }}>
        {filteredOptions.length === 0 && <p className="m-0 px-3 py-4 text-center text-sm text-slate-500">Sin coincidencias</p>}
        {filteredOptions.map((option, index) => {
          const isSelected = String(option.value) === String(value);
          const isActive = index === boundedActiveIndex;
          return (
            <div
              className={`app-select-option flex min-h-10 cursor-pointer items-center justify-between gap-3 px-3 text-sm text-ink-900 ${isActive ? "bg-rust-50 text-rust-700" : "hover:bg-slate-100"} ${option.disabled ? "cursor-not-allowed opacity-45" : ""}`}
              id={`${selectId}-option-${index}`}
              key={`${String(option.value)}-${index}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled || undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {isSelected && <Check className="shrink-0 text-rust-600" size={16} />}
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className={`app-select relative min-w-0 ${className}`}>
      <input type="hidden" name={name} value={value ?? ""} />
      <button
        className="app-select-trigger flex min-h-10.25 w-full min-w-0 items-center justify-between gap-2 border-slate-300 bg-white px-2.75 text-left font-normal text-ink-950 hover:bg-white"
        id={selectId}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && filteredOptions.length ? `${selectId}-option-${boundedActiveIndex}` : undefined}
        disabled={disabled}
        onClick={() => { if (open) close(false); else openPopup(); }}
        onKeyDown={handleKeyDown}
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-slate-500"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} size={17} />
      </button>
      {typeof document !== "undefined" && createPortal(popup, document.body)}
    </div>
  );
}
