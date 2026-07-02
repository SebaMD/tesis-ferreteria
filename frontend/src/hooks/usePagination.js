import { useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 8;

export default function usePagination(items, options = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, resetKey = "" } = options;
  const [page, setPage] = useState(1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    pageSize,
    paginatedItems,
    setPage,
    showPagination: totalItems > pageSize,
    totalItems,
    totalPages,
  };
}
