import { isValidEmail, normalizeEmail } from "../../utils/email.js";
import { isValidRut, normalizeRut } from "../../utils/rut.js";

const NAME_REGEX = /^[\p{L} ]+$/u;
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;
export const PASSWORD_REQUIREMENTS_MESSAGE = "La contrasena debe tener 8 a 128 caracteres, una mayuscula, un numero y un caracter especial";
const PHONE_REGEX = /^(?:\+?56)?9\d{8}$/;

export type LoginBody = {
  identifier: string;
  password: string;
};

export type RegisterBody = {
  rut: string;
  names: string;
  surnames: string;
  correo: string;
  password: string;
  phone?: string | null;
};

type ValidationResult<T> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      error: string;
    };

export { normalizeEmail };

export function isValidPassword(password: string) {
  return PASSWORD_REGEX.test(password);
}

export function normalizeName(name = "") {
  return String(name).trim().replace(/\s+/g, " ");
}

export { isValidRut, normalizeRut };

export function validateLoginBody(body: unknown): ValidationResult<LoginBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar correo y contrasena" };
  }

  const input = body as Record<string, unknown>;

  const fields = Object.keys(input);
  if (fields.some((field) => !["identifier", "correo", "password"].includes(field))) {
    return { success: false, error: "La solicitud contiene campos no permitidos" };
  }

  const rawIdentifier = input.identifier ?? input.correo;
  if (typeof rawIdentifier !== "string") {
    return { success: false, error: "El correo o RUT debe ser texto" };
  }

  if (typeof input.password !== "string") {
    return { success: false, error: "La contrasena debe ser texto" };
  }

  const identifier = rawIdentifier.includes("@")
    ? normalizeEmail(rawIdentifier)
    : normalizeRut(rawIdentifier);

  if (rawIdentifier.includes("@") ? !isValidEmail(identifier) : !isValidRut(identifier)) {
    return { success: false, error: "Debe ingresar un correo o RUT valido" };
  }

  if (input.password.length < 1) {
    return { success: false, error: "La contrasena no puede estar vacia" };
  }

  return {
    success: true,
    value: {
      identifier,
      password: input.password,
    },
  };
}

export function validateRegisterBody(body: unknown): ValidationResult<RegisterBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe enviar los datos de registro" };
  }

  const input = body as Record<string, unknown>;
  const allowedFields = ["rut", "names", "surnames", "correo", "password", "phone"];

  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) {
      return { success: false, error: `El campo ${field} no esta permitido en el registro publico` };
    }
  }

  if (typeof input.rut !== "string") return { success: false, error: "El RUT debe ser texto" };
  if (typeof input.names !== "string") return { success: false, error: "Los nombres deben ser texto" };
  if (typeof input.surnames !== "string") {
    return { success: false, error: "Los apellidos deben ser texto" };
  }
  if (typeof input.correo !== "string") return { success: false, error: "El correo debe ser texto" };
  if (typeof input.password !== "string") {
    return { success: false, error: "La contrasena debe ser texto" };
  }

  const rut = normalizeRut(input.rut);
  const names = normalizeName(input.names);
  const surnames = normalizeName(input.surnames);
  const correo = normalizeEmail(input.correo);

  if (!isValidRut(rut)) {
    return { success: false, error: "El RUT no es valido" };
  }

  if (names.length < 3 || names.length > 120 || !NAME_REGEX.test(names)) {
    return { success: false, error: "Los nombres deben tener entre 3 y 120 caracteres y solo letras/espacios" };
  }

  if (surnames.length < 3 || surnames.length > 120 || !NAME_REGEX.test(surnames)) {
    return { success: false, error: "Los apellidos deben tener entre 3 y 120 caracteres y solo letras/espacios" };
  }

  if (!isValidEmail(correo)) {
    return { success: false, error: "Debe ingresar un correo valido" };
  }

  if (!isValidPassword(input.password)) {
    return {
      success: false,
      error: PASSWORD_REQUIREMENTS_MESSAGE,
    };
  }

  let phone: string | null | undefined;

  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      phone = null;
    } else {
      if (typeof input.phone !== "string") return { success: false, error: "El telefono debe ser texto" };
      const compactPhone = input.phone.trim().replace(/[\s().-]/g, "");
      if (!PHONE_REGEX.test(compactPhone)) {
        return { success: false, error: "El telefono debe ser un movil chileno valido" };
      }
      phone = compactPhone.startsWith("+56")
        ? compactPhone
        : compactPhone.startsWith("56")
          ? `+${compactPhone}`
          : `+56${compactPhone}`;
    }
  }

  return {
    success: true,
    value: {
      rut,
      names,
      surnames,
      correo,
      password: input.password,
      phone,
    },
  };
}

export function validatePasswordResetRequestBody(body: unknown): ValidationResult<{ email: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar un correo electronico" };
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((field) => field !== "email")) {
    return { success: false, error: "La solicitud contiene campos no permitidos" };
  }
  if (typeof input.email !== "string") {
    return { success: false, error: "Debe ingresar un correo electronico" };
  }
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { success: false, error: "Debe ingresar un correo valido" };
  return { success: true, value: { email } };
}

export function validatePasswordResetConfirmBody(
  body: unknown,
): ValidationResult<{ token: string; password: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar el enlace y la nueva contrasena" };
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((field) => !["token", "password"].includes(field))) {
    return { success: false, error: "La solicitud contiene campos no permitidos" };
  }
  if (typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
    return { success: false, error: "El enlace no es valido o ya expiro" };
  }
  if (typeof input.password !== "string" || !isValidPassword(input.password)) {
    return { success: false, error: PASSWORD_REQUIREMENTS_MESSAGE };
  }
  return { success: true, value: { token: input.token, password: input.password } };
}
