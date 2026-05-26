import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SESSION_SECRET } from "../../config/configEnv.js";
import { findAuthUserByCorreo } from "./auth.repository.js";
import type { LoginBody } from "./auth.validation.js";

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
