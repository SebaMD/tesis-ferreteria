import { isValidEmail, normalizeEmail } from "../../utils/email.js";

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function objectBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function hasOnlyFields(input: Record<string, unknown>, fields: string[]) {
  return Object.keys(input).every((field) => fields.includes(field));
}

export function validateEmptyBody(body: unknown): ValidationResult<Record<string, never>> {
  const input = objectBody(body ?? {});
  if (!input || Object.keys(input).length > 0) {
    return { success: false, error: "Esta solicitud no acepta parametros" };
  }
  return { success: true, value: {} };
}

export function validateEmailRequestBody(body: unknown): ValidationResult<{ email: string }> {
  const input = objectBody(body);
  if (!input || !hasOnlyFields(input, ["email"]) || typeof input.email !== "string") {
    return { success: false, error: "Debe ingresar un correo electronico valido" };
  }
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { success: false, error: "Debe ingresar un correo electronico valido" };
  }
  return { success: true, value: { email } };
}

export function validatePinBody(body: unknown): ValidationResult<{ challengeId: number; pin: string }> {
  const input = objectBody(body);
  if (!input || !hasOnlyFields(input, ["challengeId", "pin"])) {
    return { success: false, error: "Debe ingresar el codigo de verificacion" };
  }
  const challengeId = Number(input.challengeId);
  if (!Number.isInteger(challengeId) || challengeId < 1) {
    return { success: false, error: "La verificacion solicitada no es valida" };
  }
  if (typeof input.pin !== "string" || !/^\d{6}$/.test(input.pin)) {
    return { success: false, error: "El codigo debe contener exactamente 6 digitos" };
  }
  return { success: true, value: { challengeId, pin: input.pin } };
}
