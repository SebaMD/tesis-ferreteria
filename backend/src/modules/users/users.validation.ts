import type { NewUser } from "../../db/schema/index.js";

const NAME_REGEX = /^[\p{L} ]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RUT_REGEX = /^\d{7,8}-[\dKk]$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;
const PHONE_REGEX = /^(?:\+?56)?9\d{8}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORK_SHIFTS = ["MORNING", "AFTERNOON", "OTHER"] as const;

type EditableUserFields = Partial<
  Pick<NewUser, "roleId" | "rut" | "names" | "surnames" | "correo" | "password" | "phone" | "status">
>;
type WorkShift = (typeof WORK_SHIFTS)[number];

export type EditUserBody = EditableUserFields;
export type CreateUserBody = Pick<NewUser, "roleId" | "rut" | "names" | "surnames" | "correo" | "password" | "phone" | "status">;
export type CashierScheduleBody = {
  workShift: WorkShift;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftNote: string | null;
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

export function normalizeRut(value: string) {
  return value.trim().replace(/\./g, "").toUpperCase();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePhone(value: string) {
  const phone = value.trim();
  if (!phone) return null;

  const compactPhone = phone.replace(/[\s().-]/g, "");
  if (!PHONE_REGEX.test(compactPhone)) return null;
  if (compactPhone.startsWith("+56")) return compactPhone;
  if (compactPhone.startsWith("56")) return `+${compactPhone}`;
  return `+56${compactPhone}`;
}

export function validateEditUserBody(body: unknown): ValidationResult<EditUserBody> {
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
      return { success: false, error: "Debe seleccionar un rol valido" };
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
    if (!names) {
      return { success: false, error: "El nombre es obligatorio" };
    }
    if (names.length < 3 || names.length > 120 || !NAME_REGEX.test(names)) {
      return { success: false, error: "El nombre debe tener entre 3 y 120 caracteres y solo letras o espacios" };
    }
    value.names = names;
  }

  if (input.surnames !== undefined) {
    if (typeof input.surnames !== "string") {
      return { success: false, error: "Los apellidos deben ser texto" };
    }
    const surnames = normalizeName(input.surnames);
    if (!surnames) {
      return { success: false, error: "El apellido es obligatorio" };
    }
    if (surnames.length < 3 || surnames.length > 120 || !NAME_REGEX.test(surnames)) {
      return { success: false, error: "El apellido debe tener entre 3 y 120 caracteres y solo letras o espacios" };
    }
    value.surnames = surnames;
  }

  if (input.correo !== undefined) {
    if (typeof input.correo !== "string") return { success: false, error: "El correo debe ser texto" };
    const correo = normalizeEmail(input.correo);
    if (!correo) {
      return { success: false, error: "El correo electrónico es obligatorio" };
    }
    if (correo.length > 255 || !EMAIL_REGEX.test(correo)) {
      return { success: false, error: "El correo electrónico no tiene un formato valido" };
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
        error: "La contraseña debe tener 8 a 128 caracteres, una mayúscula, un número y un carácter especial",
      };
    }
    value.password = input.password;
  }

  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      value.phone = null;
    } else {
      if (typeof input.phone !== "string") return { success: false, error: "El telefono debe ser texto" };
      const phone = normalizePhone(input.phone);
      if (!phone) {
        return { success: false, error: "El teléfono debe ser un móvil chileno válido. Ejemplo: +56912345678" };
      }
      value.phone = phone;
    }
  }

  if (input.status !== undefined) {
    if (input.status !== "ACTIVE" && input.status !== "INACTIVE") {
      return { success: false, error: "Debe seleccionar un estado válido" };
    }
    value.status = input.status;
  }

  if (Object.keys(value).length === 0) {
    return { success: false, error: "Debe especificar al menos 1 parametro valido" };
  }

  return { success: true, value };
}

export function validateCreateUserBody(body: unknown): ValidationResult<CreateUserBody> {
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
      const fieldMessages: Partial<Record<keyof CreateUserBody, string>> = {
        roleId: "Debe seleccionar un rol",
        rut: "El RUT es obligatorio",
        names: "El nombre es obligatorio",
        surnames: "El apellido es obligatorio",
        correo: "El correo electrónico es obligatorio",
        password: "La contraseña es obligatoria",
      };

      return { success: false, error: fieldMessages[field] || `El campo ${field} es obligatorio` };
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

export function validateCashierScheduleBody(body: unknown): ValidationResult<CashierScheduleBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe especificar los datos del horario" };
  }

  const input = body as Record<string, unknown>;
  const allowedFields = ["workShift", "shiftStartTime", "shiftEndTime", "shiftNote"];

  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) {
      return { success: false, error: `El campo ${field} no esta permitido` };
    }
  }

  if (typeof input.workShift !== "string" || !WORK_SHIFTS.includes(input.workShift as WorkShift)) {
    return { success: false, error: "El turno debe ser: MORNING, AFTERNOON u OTHER" };
  }

  if (typeof input.shiftStartTime !== "string" || !TIME_REGEX.test(input.shiftStartTime)) {
    return { success: false, error: "La hora de inicio debe tener formato HH:MM" };
  }

  if (typeof input.shiftEndTime !== "string" || !TIME_REGEX.test(input.shiftEndTime)) {
    return { success: false, error: "La hora de termino debe tener formato HH:MM" };
  }

  if (input.shiftStartTime >= input.shiftEndTime) {
    return { success: false, error: "La hora de inicio debe ser menor a la hora de termino" };
  }

  let shiftNote: string | null = null;
  if (input.shiftNote !== undefined && input.shiftNote !== null && input.shiftNote !== "") {
    if (typeof input.shiftNote !== "string") {
      return { success: false, error: "La observacion debe ser texto" };
    }

    shiftNote = input.shiftNote.trim();
    if (shiftNote.length > 255) {
      return { success: false, error: "La observacion no puede exceder 255 caracteres" };
    }
  }

  return {
    success: true,
    value: {
      workShift: input.workShift as WorkShift,
      shiftStartTime: input.shiftStartTime,
      shiftEndTime: input.shiftEndTime,
      shiftNote,
    },
  };
}
