import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { SESSION_SECRET } from "../config/configEnv.js";

export type AuthUser = {
  id: number;
  correo: string;
  rut: string;
  roleId: number;
  role: string;
  status: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  if (!SESSION_SECRET) {
    return res.status(500).json({ message: "JWT_SECRET no esta configurado" });
  }

  try {
    req.user = jwt.verify(token, SESSION_SECRET) as AuthUser;
    return next();
  } catch {
    return res.status(403).json({ message: "Token invalido o expirado" });
  }
}
