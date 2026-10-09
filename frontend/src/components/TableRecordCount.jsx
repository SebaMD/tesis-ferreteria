import { formatTableRecordCount } from "../helpers/formatters.js";

export default function TableRecordCount({
  visibleCount,
  totalCount,
  filteredCount = totalCount,
  hasFilters = false,
  mobileTotalCount = totalCount,
  mobilePage = 1,
  mobilePageSize = visibleCount,
}) {
  const mobileVisibleCount = Math.min(
    mobilePageSize,
    Math.max(0, mobileTotalCount - ((mobilePage - 1) * mobilePageSize)),
  );

  return (
    <>
      <span className="max-[720px]:hidden">
        {formatTableRecordCount({ visibleCount, totalCount, filteredCount, hasFilters })}
      </span>
      <span className="hidden max-[720px]:inline">
        Mostrando {mobileVisibleCount} de {mobileTotalCount} {mobileTotalCount === 1 ? "registro" : "registros"}
      </span>
    </>
  );
}
