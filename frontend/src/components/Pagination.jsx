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

function getCompactVisiblePages(page, totalPages) {
  if (totalPages <= 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 2) {
    return [1, 2, "ellipsis-end", totalPages];
  }

  if (page >= totalPages - 1) {
    return [1, "ellipsis-start", totalPages - 1, totalPages];
  }

  return [1, "ellipsis-start", page, "ellipsis-end", totalPages];
}

function PageItems({ page, pageItems, onPageChange, compact = false }) {
  return pageItems.map((pageItem) => {
    if (typeof pageItem === "string") {
      return (
        <span
          className={`inline-flex items-center justify-center text-slate-500 ${compact ? "min-h-7 min-w-3 text-[10px]" : "min-h-8 min-w-6 text-xs"}`}
          key={pageItem}
          aria-hidden="true"
        >
          ...
        </span>
      );
    }

    return (
      <button
        className={`${compact ? "min-h-7 min-w-7 px-1.5 text-[11px]" : "min-h-8 min-w-8 px-2.75 text-xs"} ${
          pageItem === page
            ? "border-rust-500 bg-rust-500 text-white hover:bg-rust-600"
            : "border-slate-300 bg-white text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
        }`}
        type="button"
        key={pageItem}
        onClick={() => onPageChange(pageItem)}
        aria-current={pageItem === page ? "page" : undefined}
        aria-label={`Ir a la página ${pageItem}`}
      >
        {pageItem}
      </button>
    );
  });
}

export default function Pagination({ page, pageSize, totalItems, totalPages, onPageChange }) {
  if (totalItems <= pageSize) return null;

  const visiblePages = getVisiblePages(page, totalPages);
  const compactVisiblePages = getCompactVisiblePages(page, totalPages);

  return (
    <nav className="flex min-h-12.25 flex-nowrap items-center justify-center gap-1.5 overflow-x-auto border-t border-slate-200 px-4 py-2 max-[480px]:gap-0.5 max-[480px]:px-2" aria-label="Paginación">
      <button
        className="shrink-0 min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600 max-[480px]:min-h-7 max-[480px]:px-2 max-[480px]:text-[11px]"
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        Anterior
      </button>

      <span className="contents max-[480px]:hidden">
        <PageItems page={page} pageItems={visiblePages} onPageChange={onPageChange} />
      </span>
      <span className="hidden max-[480px]:contents">
        <PageItems page={page} pageItems={compactVisiblePages} onPageChange={onPageChange} compact />
      </span>

      <button
        className="shrink-0 min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600 max-[480px]:min-h-7 max-[480px]:px-2 max-[480px]:text-[11px]"
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        Siguiente
      </button>
    </nav>
  );
}
