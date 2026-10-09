import type { Response } from "express";

export const INTERNAL_ERROR_MESSAGE = "Ha ocurrido un error interno.";

function safeErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) return {};

  const code = "code" in error && (
    typeof error.code === "string" || typeof error.code === "number"
  )
    ? String(error.code)
    : undefined;

  return {
    errorType: error.name || "Error",
    ...(code && /^[a-z0-9_-]{1,32}$/i.test(code) ? { errorCode: code } : {}),
  };
}

export function logServerError(context: string, error?: unknown, statusCode = 500) {
  console.error(`[server-error] ${context}`, {
    statusCode,
    ...safeErrorMetadata(error),
  });
}

export function handleSuccess(res: Response, statusCode: number, message: string, data?: unknown) {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
  });
}

export function handleErrorClient(
  res: Response,
  statusCode: number,
  message: string,
  details?: unknown,
) {
  if (statusCode >= 500) {
    return handleErrorServer(res, statusCode, message, details);
  }

  return res.status(statusCode).json({
    status: "error",
    message,
    details,
  });
}

export function handleErrorServer(
  res: Response,
  statusCode: number,
  message: string,
  details?: unknown,
) {
  logServerError(message, details, statusCode);

  return res.status(statusCode).json({
    status: "error",
    message: INTERNAL_ERROR_MESSAGE,
  });
}
