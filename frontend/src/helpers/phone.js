const CHILEAN_MOBILE_REGEX = /^(?:\+?56)?9\d{8}$/;

export function normalizeChileanMobilePhone(value = "") {
  const compact = String(value).trim().replace(/[\s().-]/g, "");
  if (!compact) return null;
  if (!CHILEAN_MOBILE_REGEX.test(compact)) return null;
  if (compact.startsWith("+56")) return compact;
  if (compact.startsWith("56")) return `+${compact}`;
  return `+56${compact}`;
}

export function isValidChileanMobilePhone(value = "") {
  return Boolean(normalizeChileanMobilePhone(value));
}
