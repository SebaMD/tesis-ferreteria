export const auditEmptyFilters = { operation: "", productId: "", familyId: "", from: "", to: "", limit: "25" };
export function auditQueryFromSearch(search) {
  const params = new URLSearchParams(search);
  return { ...Object.fromEntries(Object.entries(auditEmptyFilters).map(([key, value]) => [key, params.get(key) ?? value])), cursor: params.get("cursor") || null };
}
export function auditQueryToSearch(query) {
  const params = new URLSearchParams();
  for (const key of [...Object.keys(auditEmptyFilters), "cursor"]) if (query[key]) params.set(key, query[key]);
  return `?${params}`;
}
