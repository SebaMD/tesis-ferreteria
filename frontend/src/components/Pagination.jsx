import { useLayoutEffect, useRef, useState } from "react";

function getVisiblePages(page, totalPages) {
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 3) {
    return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  }

  if (page >= totalPages - 2) {
    return [1, "ellipsis-start", ...Array.from({ length: 5 }, (_, index) => totalPages - 4 + index)];
  }

  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", totalPages];
}

function getCompactVisiblePages(page, totalPages, layout = {}) {
  const { availableWidth = Infinity, digitWidth = 8, ellipsisWidth = 12, gap = 4 } = layout;
  const expand = (values) => {
    const candidates = [...new Set(values)].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    const items = [];
    for (const value of candidates) {
      const previous = items.at(-1);
      if (typeof previous === "number" && value - previous === 2) items.push(previous + 1);
      else if (typeof previous === "number" && value - previous > 2) items.push(`ellipsis-${previous}`);
      items.push(value);
    }
    return items;
  };
  const fits = items => items.reduce((width, item) => width + (typeof item === "number" ? Math.max(32, String(item).length * digitWidth + 14) : ellipsisWidth), Math.max(0, items.length - 1) * gap) <= availableWidth;
  const options = [
    ...(totalPages <= 6 ? [Array.from({ length: totalPages }, (_, index) => index + 1)] : []),
    expand([1, page - 1, page, page + 1, totalPages]),
    expand([1, page - 1, page, totalPages]),
    expand([1, page, page + 1, totalPages]),
    expand([1, page, totalPages]),
  ];
  return options.find(fits) || options.at(-1);
}

function PageItems({ page, pageItems, onPageChange, compact = false, disabled = false }) {
  return pageItems.map((pageItem) => {
    if (typeof pageItem === "string") {
      return (
        <span
          className={`inline-flex items-center justify-center text-slate-500 ${compact ? "min-h-11 min-w-2 text-xs" : "min-h-8 min-w-6 text-xs"}`}
          key={pageItem}
          aria-hidden="true"
        >
          ...
        </span>
      );
    }

    return (
      <button
        className={`${compact ? "min-h-11 min-w-8 shrink-0 px-1.5 text-xs" : "min-h-8 min-w-8 px-2.75 text-xs"} ${
          pageItem === page
            ? "border-rust-500 bg-rust-500 text-white hover:bg-rust-600"
            : "border-slate-300 bg-white text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
        }`}
        type="button"
        key={pageItem}
        onClick={() => onPageChange(pageItem)}
        disabled={disabled}
        aria-current={pageItem === page ? "page" : undefined}
        aria-label={`Ir a la página ${pageItem}`}
      >
        {pageItem}
      </button>
    );
  });
}

export default function Pagination({ page, pageSize, totalItems, totalPages, onPageChange, disabled = false, alwaysVisible = false, ariaLabel = "Paginación" }) {
  const navRef = useRef(null);
  const previousRef = useRef(null);
  const nextRef = useRef(null);
  const [compactLayout, setCompactLayout] = useState({});
  const hidden = !alwaysVisible && (totalPages <= 1 || (totalItems !== undefined && totalItems <= pageSize));

  useLayoutEffect(() => {
    if (hidden) return undefined;
    const nav = navRef.current;
    const previous = previousRef.current;
    const next = nextRef.current;
    let active = true;
    const measure = () => {
      if (!active) return;
      const style = getComputedStyle(nav);
      const font = getComputedStyle(previous);
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      const gap = parseFloat(style.columnGap) || 0;
      const layout = {
        availableWidth: nav.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - previous.offsetWidth - next.offsetWidth - 2 * gap,
        digitWidth: Math.max(..."0123456789".split("").map(digit => context.measureText(digit).width)),
        ellipsisWidth: Math.max(8, context.measureText("...").width),
        gap,
      };
      setCompactLayout(current => Object.keys(layout).every(key => current[key] === layout[key]) ? current : layout);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [nav, previous, next]) observer.observe(element);
    window.addEventListener("resize", measure);
    document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [hidden]);

  if (hidden) return null;

  const visiblePages = getVisiblePages(page, totalPages);
  const compactVisiblePages = getCompactVisiblePages(page, totalPages, compactLayout);

  return (
    <nav ref={navRef} className="flex min-h-12.25 flex-nowrap items-center justify-center gap-1.5 overflow-x-auto border-t border-slate-200 px-4 py-2 max-[480px]:gap-1 max-[480px]:overflow-x-visible max-[480px]:px-2" aria-label={ariaLabel}>
      <button
        ref={previousRef}
        className="shrink-0 min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600 max-[480px]:min-h-11 max-[480px]:px-2 max-[480px]:text-xs"
        type="button"
        aria-label="Anterior"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page === 1}
      >
        <span className="max-[480px]:hidden">Anterior</span><span className="hidden max-[480px]:inline">Ant.</span>
      </button>

      <span className="contents max-[480px]:hidden">
        <PageItems page={page} pageItems={visiblePages} onPageChange={onPageChange} disabled={disabled} />
      </span>
      <span className="hidden max-[480px]:contents">
        <PageItems page={page} pageItems={compactVisiblePages} onPageChange={onPageChange} compact disabled={disabled} />
      </span>
      <button
        ref={nextRef}
        className="shrink-0 min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600 max-[480px]:min-h-11 max-[480px]:px-2 max-[480px]:text-xs"
        type="button"
        aria-label="Siguiente"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page === totalPages}
      >
        <span className="max-[480px]:hidden">Siguiente</span><span className="hidden max-[480px]:inline">Sig.</span>
      </button>
    </nav>
  );
}
