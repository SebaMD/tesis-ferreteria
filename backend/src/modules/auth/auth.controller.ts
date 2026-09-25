import type { Request, Response } from "express";
import {
  handleErrorClient,
  handleErrorServer,
  handleSuccess,
  logServerError,
} from "../../utils/helpers.js";
import { AuthError, loginService, registerClientService } from "./auth.service.js";
import {
  validateLoginBody,
  validatePasswordResetConfirmBody,
  validatePasswordResetRequestBody,
  validateRegisterBody,
} from "./auth.validation.js";
import {
  confirmPasswordResetService,
  PASSWORD_RESET_GENERIC_MESSAGE,
  PasswordResetError,
  requestPasswordResetService,
} from "./passwordReset.service.js";
import {
  EmailVerificationError,
  requestClientEmailVerificationService,
  requestInternalEmailVerificationService,
} from "../emailVerification/emailVerification.service.js";

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
    if (data.user.requiresEmailVerification) {
      try {
        const challenge = await requestInternalEmailVerificationService(data.user.id, { reuseActive: true });
        return handleSuccess(res, 200, "Inicio de sesion exitoso", {
          ...data,
          emailVerification: { sent: true, ...challenge },
        });
      } catch (verificationError) {
        return handleSuccess(res, 200, "Inicio de sesion exitoso", {
          ...data,
          emailVerification: {
            sent: false,
            message: verificationError instanceof EmailVerificationError
              ? verificationError.message
              : "No se pudo enviar el codigo de verificacion. Intenta reenviarlo desde la pantalla de verificacion.",
          },
        });
      }
    }
    return handleSuccess(res, 200, "Inicio de sesion exitoso", data);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo iniciar sesion", error);
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
    try {
      const emailVerification = await requestClientEmailVerificationService(data.user.id);
      return handleSuccess(res, 201, "Cuenta de cliente creada exitosamente", {
        ...data,
        emailVerification: { sent: true, ...emailVerification },
      });
    } catch (error) {
      const verificationMessage = error instanceof EmailVerificationError
        ? error.message
        : "No se pudo preparar la verificacion del correo";
      return handleSuccess(res, 201, "Cuenta creada, pero no se pudo enviar el codigo", {
        ...data,
        emailVerification: { sent: false, message: verificationMessage },
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo registrar la cuenta", getErrorMessage(error));
  }
}

export async function requestPasswordReset(req: Request, res: Response) {
  const validation = validatePasswordResetRequestBody(req.body);
  if (!validation.success) {
    return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  }

  try {
    await requestPasswordResetService(validation.value.email);
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 202, PASSWORD_RESET_GENERIC_MESSAGE);
  } catch (error) {
    logServerError("No se pudo procesar una solicitud de recuperación de contraseña", error);
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 202, PASSWORD_RESET_GENERIC_MESSAGE);
  }
}

export async function confirmPasswordReset(req: Request, res: Response) {
  const validation = validatePasswordResetConfirmBody(req.body);
  if (!validation.success) {
    return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  }

  try {
    await confirmPasswordResetService(validation.value.token, validation.value.password);
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 200, "Contrasena actualizada correctamente");
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo actualizar la contrasena", getErrorMessage(error));
  }
}
