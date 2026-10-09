import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { SESSION_SECRET } from "../config/configEnv.js";
import { findAuthUserById } from "../modules/auth/auth.repository.js";

export type AuthUser = {
  id: number;
  correo: string;
  rut: string;
  roleId: number;
  role: string;
  status: string;
  authVersion: number;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

function readJwt(req: AuthenticatedRequest, res: Response) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token no proporcionado" });
    return null;
  }

  const token = authHeader.split(" ")[1];

  if (!SESSION_SECRET) {
    res.status(500).json({ message: "JWT_SECRET no esta configurado" });
    return null;
  }

  try {
    return jwt.verify(token, SESSION_SECRET) as AuthUser;
  } catch {
    res.status(401).json({ message: "Token invalido o expirado" });
    return null;
  }
}

async function authenticateCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  requireVerifiedInternalEmail: boolean,
) {
  const tokenUser = readJwt(req, res);
  if (!tokenUser) return;

  try {
    const current = await findAuthUserById(tokenUser.id);
    if (!current || current.status !== "ACTIVE") {
      res.status(401).json({ message: "La cuenta no esta activa" });
      return;
    }
    const tokenAuthVersion = Number(tokenUser.authVersion ?? 1);
    if (!Number.isInteger(tokenAuthVersion) || tokenAuthVersion !== current.authVersion) {
      res.status(401).json({ message: "La sesion ya no es valida" });
      return;
    }

    req.user = {
      id: current.id,
      correo: current.correo,
      rut: current.rut,
      roleId: current.roleId,
      role: current.roleName,
      status: current.status,
      authVersion: current.authVersion,
    };

    if (
      requireVerifiedInternalEmail
      && ["MANAGER", "CASHIER", "WAREHOUSE"].includes(current.roleName)
      && !current.emailVerifiedAt
    ) {
      res.status(403).json({
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Debes verificar tu correo antes de usar el sistema interno",
      });
      return;
    }
  } catch {
    res.status(500).json({ message: "No se pudo validar el acceso de la cuenta" });
    return;
  }

  return next();
}

export function authenticateJwtAllowUnverified(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return authenticateCurrentUser(req, res, next, false);
}

export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return authenticateCurrentUser(req, res, next, true);
}
