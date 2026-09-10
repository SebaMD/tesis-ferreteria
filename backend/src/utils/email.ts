const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const normalized = normalizeEmail(value);
  return normalized.length <= 254 && EMAIL_REGEX.test(normalized);
}
