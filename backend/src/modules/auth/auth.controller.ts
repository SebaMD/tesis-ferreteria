import type { Request, Response } from "express";
import {
  handleErrorClient,
  handleErrorServer,
  handleSuccess,
} from "../../utils/helpers.js";
import { AuthError, loginService, registerClientService } from "./auth.service.js";
import { validateLoginBody, validateRegisterBody } from "./auth.validation.js";

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

export async function registerClient(req: Request, res: Response) {
  try {
    const validation = validateRegisterBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const data = await registerClientService(validation.value);
    return handleSuccess(res, 201, "Cuenta de cliente creada exitosamente", data);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo registrar la cuenta", getErrorMessage(error));
  }
}
