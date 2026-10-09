import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { createSessionForUserId } from "../auth/auth.service.js";
import {
  EmailVerificationError,
  requestClientEmailChangeService,
  requestClientEmailVerificationService,
  requestGuestEmailVerificationService,
  requestInternalEmailVerificationService,
  verifyClientEmailChangeService,
  verifyClientEmailService,
  verifyGuestEmailService,
  verifyInternalEmailService,
} from "./emailVerification.service.js";
import {
  validateEmailRequestBody,
  validateEmptyBody,
  validatePinBody,
} from "./emailVerification.validation.js";

function clientId(req: AuthenticatedRequest) {
  if (!req.user) throw new EmailVerificationError("Token invalido o expirado", 401);
  return req.user.id;
}

function guestSession(req: Request) {
  const value = req.get("x-guest-session")?.trim();
  if (!value) throw new EmailVerificationError("La sesion de invitado no fue enviada", 400);
  return value;
}

function handleVerificationError(res: Response, error: unknown) {
  if (error instanceof EmailVerificationError) {
    if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
    return handleErrorClient(
      res,
      error.statusCode,
      error.message,
      error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : undefined,
    );
  }
  const details = error instanceof Error ? error.message : "Error desconocido";
  return handleErrorServer(res, 500, "No se pudo procesar la verificacion del correo", details);
}

export async function requestClientVerification(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validateEmptyBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(
      res,
      201,
      "Codigo de verificacion enviado",
      await requestClientEmailVerificationService(clientId(req)),
    );
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function verifyClientVerification(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validatePinBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    const id = clientId(req);
    await verifyClientEmailService(id, validation.value.challengeId, validation.value.pin);
    return handleSuccess(res, 200, "Correo verificado correctamente", await createSessionForUserId(id));
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function requestClientEmailChange(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validateEmailRequestBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(
      res,
      201,
      "Codigo de verificacion enviado al nuevo correo",
      await requestClientEmailChangeService(clientId(req), validation.value.email),
    );
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function verifyClientEmailChange(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validatePinBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    const id = clientId(req);
    await verifyClientEmailChangeService(id, validation.value.challengeId, validation.value.pin);
    return handleSuccess(res, 200, "Correo actualizado y verificado", await createSessionForUserId(id));
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function requestGuestVerification(req: Request, res: Response) {
  try {
    const validation = validateEmailRequestBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(
      res,
      201,
      "Codigo de verificacion enviado",
      await requestGuestEmailVerificationService(guestSession(req), validation.value.email),
    );
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function verifyGuestVerification(req: Request, res: Response) {
  try {
    const validation = validatePinBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(
      res,
      200,
      "Correo verificado correctamente",
      await verifyGuestEmailService(
        guestSession(req),
        validation.value.challengeId,
        validation.value.pin,
      ),
    );
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function requestInternalVerification(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validateEmptyBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(
      res,
      201,
      "Codigo de verificacion disponible",
      await requestInternalEmailVerificationService(clientId(req)),
    );
  } catch (error) {
    return handleVerificationError(res, error);
  }
}

export async function verifyInternalVerification(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validatePinBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    const id = clientId(req);
    await verifyInternalEmailService(id, validation.value.challengeId, validation.value.pin);
    return handleSuccess(res, 200, "Correo verificado correctamente", await createSessionForUserId(id));
  } catch (error) {
    return handleVerificationError(res, error);
  }
}
