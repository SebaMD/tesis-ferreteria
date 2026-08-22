import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SESSION_SECRET } from "../../config/configEnv.js";
import {
  createAuthUser,
  findAuthUserByCorreo,
  findRoleByName,
  findUserByRutOrCorreo,
} from "./auth.repository.js";
import type { LoginBody, RegisterBody } from "./auth.validation.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function loginService(data: LoginBody) {
  const user = await findAuthUserByCorreo(data.correo);

  if (!user) {
    throw new Error("Credenciales incorrectas");
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password);

  if (!isPasswordValid) {
    throw new Error("Credenciales incorrectas");
  }

  if (user.status === "INACTIVE") {
    throw new Error("Tu cuenta esta inactiva. Contacta a administracion");
  }

  if (!SESSION_SECRET) {
    throw new Error("JWT_SECRET no esta configurado");
  }

  const token = jwt.sign(
    {
      id: user.id,
      correo: user.correo,
      rut: user.rut,
      roleId: user.roleId,
      role: user.roleName,
      status: user.status,
    },
    SESSION_SECRET,
    { expiresIn: "24h" },
  );

  return {
    token,
    user: {
      id: user.id,
      roleId: user.roleId,
      role: user.roleName,
      rut: user.rut,
      names: user.names,
      surnames: user.surnames,
      correo: user.correo,
      phone: user.phone,
      status: user.status,
    },
  };
}

export async function registerClientService(data: RegisterBody) {
  const existingUser = await findUserByRutOrCorreo(data.rut, data.correo);

  if (existingUser?.rut === data.rut) {
    throw new AuthError("El RUT ya esta registrado", 409);
  }

  if (existingUser?.correo === data.correo) {
    throw new AuthError("El correo electronico ya esta registrado", 409);
  }

  const clientRole = await findRoleByName("CLIENT");
  if (!clientRole) {
    throw new AuthError("El rol CLIENT no esta configurado", 500);
  }

  try {
    await createAuthUser({
      roleId: clientRole.id,
      rut: data.rut,
      names: data.names,
      surnames: data.surnames,
      correo: data.correo,
      password: await bcrypt.hash(data.password, 10),
      phone: data.phone ?? null,
      status: "ACTIVE",
      workShift: null,
      shiftStartTime: null,
      shiftEndTime: null,
      shiftNote: null,
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? error.code
      : typeof error === "object" && error !== null && "cause" in error
        && typeof error.cause === "object" && error.cause !== null && "code" in error.cause
        ? error.cause.code
        : null;

    if (code === "23505") {
      throw new AuthError("El RUT o correo electronico ya esta registrado", 409);
    }
    throw error;
  }

  return loginService({ correo: data.correo, password: data.password });
}
