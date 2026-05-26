import type { Request, Response } from "express";
import {
  handleErrorClient,
  handleErrorServer,
  handleSuccess,
} from "../../utils/helpers.js";
import { loginService } from "./auth.service.js";
import { validateLoginBody } from "./auth.validation.js";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function login(req: Request, res: Response) {
  try {
    const validation = validateLoginBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const data = await loginService(validation.value);
    return handleSuccess(res, 200, "Inicio de sesion exitoso", data);
  } catch (error) {
    return handleErrorClient(res, 401, getErrorMessage(error));
  }
}

export async function logout(_req: Request, res: Response) {
  try {
    res.clearCookie("jwt", { httpOnly: true });
    return handleSuccess(res, 200, "Sesion cerrada exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error interno del servidor", getErrorMessage(error));
  }
}
