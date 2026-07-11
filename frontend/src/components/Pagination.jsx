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

export default function Pagination({ page, pageSize, totalItems, totalPages, onPageChange }) {
  if (totalItems <= pageSize) return null;

  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <nav className="flex min-h-[49px] flex-wrap items-center justify-center gap-1.5 border-t border-slate-200 px-4 py-2" aria-label="Paginación">
      <button
        className="min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        Anterior
      </button>

      {visiblePages.map((pageItem) => {
        if (typeof pageItem === "string") {
          return (
            <span className="inline-flex min-h-8 min-w-6 items-center justify-center text-xs text-slate-500" key={pageItem} aria-hidden="true">
              ...
            </span>
          );
        }

        return (
          <button
            className={`min-h-8 min-w-8 px-2.75 text-xs ${
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
      })}

      <button
        className="min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        Siguiente
      </button>
    </nav>
  );
}
