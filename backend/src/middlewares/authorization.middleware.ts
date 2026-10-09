import type { NextFunction, Response } from "express";
import { handleErrorClient, handleErrorServer } from "../utils/helpers.js";
import type { AuthenticatedRequest } from "./authentication.middleware.js";

const roleNames: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  CASHIER: "Cajero",
  WAREHOUSE: "Bodeguero",
  CLIENT: "Cliente",
};

export function verifyRoles(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role;

      if (!userRole) {
        return handleErrorClient(res, 401, "Token invalido o expirado");
      }

      if (!roles.includes(userRole)) {
        const validRoleNames = roles.map((role) => roleNames[role] ?? role).join(", ");
        return handleErrorClient(res, 403, `Acceso denegado: se necesitan privilegios de ${validRoleNames}`);
      }

      return next();
    } catch (error) {
      return handleErrorServer(res, 500, "Error interno del servidor", error);
    }
  };
}
