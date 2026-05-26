import type { Response } from "express";

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
  return res.status(statusCode).json({
    status: "error",
    message,
    details,
  });
}
