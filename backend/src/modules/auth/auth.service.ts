import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SESSION_SECRET } from "../../config/configEnv.js";
import { compactRut } from "../../utils/rut.js";
import {
  createAuthUser,
  findAuthUserByIdentifier,
  findAuthUserById,
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

type AuthUser = NonNullable<Awaited<ReturnType<typeof findAuthUserByIdentifier>>>;

function createAuthenticatedSession(user: AuthUser) {
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
      emailVerifiedAt: user.emailVerifiedAt,
      emailVerified: Boolean(user.emailVerifiedAt),
      requiresEmailVerification: ["MANAGER", "CASHIER", "WAREHOUSE"].includes(user.roleName)
        && !user.emailVerifiedAt,
      phone: user.phone,
      status: user.status,
    },
  };
}

export async function createSessionForUserId(userId: number) {
  const user = await findAuthUserById(userId);
  if (!user || user.status !== "ACTIVE") {
    throw new AuthError("La cuenta no esta activa", 403);
  }
  return createAuthenticatedSession(user);
}

export async function loginService(data: LoginBody) {
  const user = await findAuthUserByIdentifier(data.identifier);

  if (!user) {
    throw new AuthError("Credenciales incorrectas", 401);
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password);

  if (!isPasswordValid) {
    throw new AuthError("Credenciales incorrectas", 401);
  }

  if (user.status === "INACTIVE") {
    throw new AuthError("Tu cuenta esta inactiva. Contacta a administracion", 401);
  }

  return createAuthenticatedSession(user);
}

export async function registerClientService(data: RegisterBody) {
  const existingUser = await findUserByRutOrCorreo(data.rut, data.correo);

  if (existingUser && compactRut(existingUser.rut) === compactRut(data.rut)) {
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
      emailVerifiedAt: null,
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

  return loginService({ identifier: data.correo, password: data.password });
}
