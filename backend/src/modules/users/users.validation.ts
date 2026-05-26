import type { NewUser } from "../../db/schema/index.js";

const NAME_REGEX = /^[\p{L} ]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RUT_REGEX = /^\d{7,8}-[\dKk]$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;
const PHONE_REGEX = /^\+?[\d\s-]{8,20}$/;

type EditableUserFields = Partial<
  Pick<NewUser, "roleId" | "rut" | "names" | "surnames" | "correo" | "password" | "phone" | "status">
>;

export type EditUserBody = EditableUserFields;
export type CreateUserBody = Pick<NewUser, "roleId" | "rut" | "names" | "surnames" | "correo" | "password" | "phone" | "status">;

type ValidationResult =
  | {
      success: true;
      value: EditUserBody;
    }
  | {
      success: false;
      error: string;
    };

export function normalizeRut(value: string) {
  return value.trim().replace(/\./g, "").toUpperCase();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateEditUserBody(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe especificar al menos 1 parametro" };
  }

  const input = body as Record<string, unknown>;
  const allowedFields = ["roleId", "rut", "names", "surnames", "correo", "password", "phone", "status"];
  const value: EditUserBody = {};

  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) {
      return { success: false, error: `El campo ${field} no esta permitido` };
    }
  }

  if (input.roleId !== undefined) {
    const roleId = Number(input.roleId);
    if (!Number.isInteger(roleId) || roleId < 1) {
      return { success: false, error: "El rol debe ser un id valido" };
    }
    value.roleId = roleId;
  }

  if (input.rut !== undefined) {
    if (typeof input.rut !== "string") return { success: false, error: "El RUT debe ser texto" };
    const rut = normalizeRut(input.rut);
    if (!RUT_REGEX.test(rut)) {
      return { success: false, error: "El RUT debe ir sin puntos y con guion (ej: 12345678-9)" };
    }
    value.rut = rut;
  }

  if (input.names !== undefined) {
    if (typeof input.names !== "string") return { success: false, error: "Los nombres deben ser texto" };
    const names = normalizeName(input.names);
    if (names.length < 3 || names.length > 120 || !NAME_REGEX.test(names)) {
      return { success: false, error: "Los nombres deben tener entre 3 y 120 caracteres y solo letras/espacios" };
    }
    value.names = names;
  }

  if (input.surnames !== undefined) {
    if (typeof input.surnames !== "string") {
      return { success: false, error: "Los apellidos deben ser texto" };
    }
    const surnames = normalizeName(input.surnames);
    if (surnames.length < 3 || surnames.length > 120 || !NAME_REGEX.test(surnames)) {
      return { success: false, error: "Los apellidos deben tener entre 3 y 120 caracteres y solo letras/espacios" };
    }
    value.surnames = surnames;
  }

  if (input.correo !== undefined) {
    if (typeof input.correo !== "string") return { success: false, error: "El correo debe ser texto" };
    const correo = normalizeEmail(input.correo);
    if (correo.length > 255 || !EMAIL_REGEX.test(correo)) {
      return { success: false, error: "Debe ingresar un correo valido" };
    }
    value.correo = correo;
  }

  if (input.password !== undefined) {
    if (typeof input.password !== "string") {
      return { success: false, error: "La contrasena debe ser texto" };
    }
    if (!PASSWORD_REGEX.test(input.password)) {
      return {
        success: false,
        error: "La contrasena debe tener 8 a 128 caracteres, una mayuscula, un numero y un caracter especial",
      };
    }
    value.password = input.password;
  }

  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      value.phone = null;
    } else {
      if (typeof input.phone !== "string") return { success: false, error: "El telefono debe ser texto" };
      const phone = input.phone.trim();
      if (!PHONE_REGEX.test(phone)) {
        return { success: false, error: "El telefono debe tener un formato valido" };
      }
      value.phone = phone;
    }
  }

  if (input.status !== undefined) {
    if (input.status !== "ACTIVE" && input.status !== "INACTIVE") {
      return { success: false, error: "El estado debe ser: ACTIVE o INACTIVE" };
    }
    value.status = input.status;
  }

  if (Object.keys(value).length === 0) {
    return { success: false, error: "Debe especificar al menos 1 parametro valido" };
  }

  return { success: true, value };
}

export function validateCreateUserBody(body: unknown): ValidationResult & { value?: CreateUserBody } {
  const result = validateEditUserBody(body);

  if (!result.success) return result;

  const requiredFields: Array<keyof CreateUserBody> = [
    "roleId",
    "rut",
    "names",
    "surnames",
    "correo",
    "password",
  ];

  for (const field of requiredFields) {
    if (result.value[field] === undefined) {
      return { success: false, error: `El campo ${field} es obligatorio` };
    }
  }

  return {
    success: true,
    value: {
      roleId: result.value.roleId!,
      rut: result.value.rut!,
      names: result.value.names!,
      surnames: result.value.surnames!,
      correo: result.value.correo!,
      password: result.value.password!,
      phone: result.value.phone,
      status: result.value.status ?? "ACTIVE",
    },
  };
}
