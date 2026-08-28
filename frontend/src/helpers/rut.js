export function normalizeRut(value = "") {
  return String(value).trim().replace(/\./g, "").toUpperCase();
}

export function isValidRut(value = "") {
  const match = normalizeRut(value).match(/^(\d{7,8})-([\dK])$/);
  if (!match) return false;

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
