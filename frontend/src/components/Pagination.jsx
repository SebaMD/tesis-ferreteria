function getVisiblePages(page, totalPages) {
  const maxVisible = 5;
  const start = Math.max(1, Math.min(page - 2, totalPages - maxVisible + 1));
  const end = Math.min(totalPages, start + maxVisible - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function Pagination({ page, pageSize, totalItems, totalPages, onPageChange }) {
  if (totalItems <= pageSize) return null;

  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-200 px-4 py-2.5" aria-label="Paginación">
      <button
        className="min-h-8 border-slate-300 bg-white px-2.75 text-xs text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        Anterior
      </button>

      {visiblePages.map((pageNumber) => (
        <button
          className={`min-h-8 min-w-8 px-2.75 text-xs ${
            pageNumber === page
              ? "border-rust-500 bg-rust-500 text-white hover:bg-rust-600"
              : "border-slate-300 bg-white text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-600"
          }`}
          type="button"
          key={pageNumber}
          onClick={() => onPageChange(pageNumber)}
          aria-current={pageNumber === page ? "page" : undefined}
        >
          {pageNumber}
        </button>
      ))}

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
