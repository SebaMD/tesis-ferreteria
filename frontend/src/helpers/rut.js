export function normalizeRut(value = "") {
  const raw = String(value).trim().toUpperCase();
  const compact = raw.replace(/[.\s-]/g, "");
  const match = compact.match(/^(\d{7,8})([\dK])$/);
  return match ? `${match[1]}-${match[2]}` : raw.replace(/[.\s]/g, "");
}

export function formatRutInput(value = "") {
  const raw = String(value).toUpperCase().replace(/[.\s]/g, "");
  const compact = raw.replace(/-/g, "");
  const isCompleteWithoutSeparator = /^\d{8}[\dK]$/.test(compact);
  const isCompleteWithSeparator = /^\d{7,8}-[\dK]$/.test(raw);

  return isCompleteWithoutSeparator || isCompleteWithSeparator
    ? normalizeRut(compact)
    : raw;
}

export function isValidRut(value = "") {
  const match = normalizeRut(value).match(/^(\d{7,8})-([\dK])$/);
  if (!match || Number(match[1]) === 0) return false;

  let sum = 0;
  let multiplier = 2;
  for (let index = match[1].length - 1; index >= 0; index -= 1) {
    sum += Number(match[1][index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return match[2] === expected;
}
