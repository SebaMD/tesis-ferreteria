const CANONICAL_RUT_REGEX = /^(\d{7,8})-([\dK])$/;

export function normalizeRut(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const compact = raw.replace(/[.\s-]/g, "");
  const match = compact.match(/^(\d{7,8})([\dK])$/);
  return match ? `${match[1]}-${match[2]}` : raw.replace(/[.\s]/g, "");
}

export function rutVerifierDigit(body: string) {
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  return remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
}

export function isValidRut(value: unknown) {
  const match = normalizeRut(value).match(CANONICAL_RUT_REGEX);
  if (!match || Number(match[1]) === 0) return false;
  return match[2] === rutVerifierDigit(match[1]);
}

export function compactRut(value: unknown) {
  return normalizeRut(value).replace("-", "");
}
