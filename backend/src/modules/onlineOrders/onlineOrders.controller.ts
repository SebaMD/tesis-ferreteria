import type { Request, Response } from "express";
import { FRONTEND_URL } from "../../config/configEnv.js";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { WebpayConfigurationError } from "../payments/webpay.service.js";
import {
  archiveClientOrderService,
  cancelWebpayPaymentService,
  confirmWebpayPaymentService,
  continueOnlineOrderPaymentService,
  continueGuestOnlineOrderPaymentService,
  createCheckoutService,
  createGuestCheckoutService,
  findOrderIdByPaymentReturnService,
  getClientOrderByIdService,
  getClientDeliveryAddressService,
  getClientOrdersService,
  getGuestOrderByAccessTokenService,
  getGuestDeviceOrdersService,
  getGuestPendingOrderService,
  issueGuestOrderTrackingAccessService,
  OnlineOrderError,
  retryOnlineOrderPaymentService,
  retryGuestOnlineOrderPaymentService,
} from "./onlineOrders.service.js";
import {
  validateCreateCheckoutBody,
  validateCreateGuestCheckoutBody,
} from "./onlineOrders.validation.js";
import { ensureGuestDeviceCookie } from "./guestDeviceCookie.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function requireClient(req: AuthenticatedRequest) {
  if (!req.user) throw new OnlineOrderError("Token invalido o expirado", 401);
  return req.user.id;
}

export async function createCheckoutController(req: AuthenticatedRequest, res: Response) {
  try {
    const validation = validateCreateCheckoutBody(req.body);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const payment = await createCheckoutService(requireClient(req), validation.value);
    return handleSuccess(res, 201, "Pedido reservado y pago Webpay iniciado", payment);
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    if (error instanceof WebpayConfigurationError) {
      return handleErrorServer(res, 503, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo iniciar el checkout", message(error));
  }
}

function requiredHeader(req: Request, name: string) {
  const value = req.get(name);
  if (!value?.trim()) throw new OnlineOrderError("La sesion o acceso de invitado no fue enviado", 400);
  return value.trim();
}

export async function createGuestCheckoutController(req: Request, res: Response) {
  try {
    const validation = validateCreateGuestCheckoutBody(req.body);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }
    const payment = await createGuestCheckoutService(
      requiredHeader(req, "x-guest-session"),
      ensureGuestDeviceCookie(req, res),
      validation.value,
    );
    return handleSuccess(res, 201, "Pedido invitado reservado y pago Webpay iniciado", payment);
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    if (error instanceof WebpayConfigurationError) {
      return handleErrorServer(res, 503, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo iniciar el checkout invitado", message(error));
  }
}

export async function getGuestPendingOrderController(req: Request, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Pago pendiente de invitado consultado",
      await getGuestPendingOrderService(requiredHeader(req, "x-guest-session")),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo consultar el pago pendiente", message(error));
  }
}

export async function continueGuestPaymentController(req: Request, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Sesion Webpay invitada recuperada",
      await continueGuestOnlineOrderPaymentService(requiredHeader(req, "x-guest-session")),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo continuar el pago invitado", message(error));
  }
}

export async function getGuestOrderController(req: Request, res: Response) {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    return handleSuccess(
      res,
      200,
      "Pedido invitado obtenido exitosamente",
      await getGuestOrderByAccessTokenService(
        requiredHeader(req, "x-guest-order-token"),
        ensureGuestDeviceCookie(req, res),
      ),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo obtener el pedido invitado", message(error));
  }
}

export async function getGuestDeviceOrdersController(req: Request, res: Response) {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    return handleSuccess(
      res,
      200,
      "Compras del dispositivo obtenidas exitosamente",
      await getGuestDeviceOrdersService(ensureGuestDeviceCookie(req, res)),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudieron obtener las compras del dispositivo", message(error));
  }
}

export async function retryGuestPaymentController(req: Request, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Nuevo intento Webpay invitado iniciado",
      await retryGuestOnlineOrderPaymentService(requiredHeader(req, "x-guest-order-token")),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    if (error instanceof WebpayConfigurationError) {
      return handleErrorServer(res, 503, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo reintentar el pago invitado", message(error));
  }
}

export async function retryPaymentController(req: AuthenticatedRequest, res: Response) {
  try {
    const orderId = parseId(req.params.id);
    if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");

    const payment = await retryOnlineOrderPaymentService(requireClient(req), orderId);
    return handleSuccess(res, 200, "Nuevo intento Webpay iniciado", payment);
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    if (error instanceof WebpayConfigurationError) {
      return handleErrorServer(res, 503, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo reintentar el pago", message(error));
  }
}

export async function continuePaymentController(req: AuthenticatedRequest, res: Response) {
  try {
    const orderId = parseId(req.params.id);
    if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");

    const payment = await continueOnlineOrderPaymentService(requireClient(req), orderId);
    return handleSuccess(res, 200, "Sesion Webpay recuperada", payment);
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo continuar el pago", message(error));
  }
}

export async function archiveOrderController(req: AuthenticatedRequest, res: Response) {
  try {
    const orderId = parseId(req.params.id);
    if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");

    return handleSuccess(
      res,
      200,
      "Pedido ocultado del historial",
      await archiveClientOrderService(requireClient(req), orderId),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo ocultar el pedido", message(error));
  }
}

export async function getMyOrdersController(req: AuthenticatedRequest, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Pedidos obtenidos exitosamente",
      await getClientOrdersService(requireClient(req)),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudieron obtener los pedidos", message(error));
  }
}

export async function getDeliveryAddressController(req: AuthenticatedRequest, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Direccion de despacho obtenida exitosamente",
      await getClientDeliveryAddressService(requireClient(req)),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo obtener la direccion de despacho", message(error));
  }
}

export async function getMyOrderByIdController(req: AuthenticatedRequest, res: Response) {
  try {
    const orderId = parseId(req.params.id);
    if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");
    return handleSuccess(
      res,
      200,
      "Pedido obtenido exitosamente",
      await getClientOrderByIdService(requireClient(req), orderId),
    );
  } catch (error) {
    if (error instanceof OnlineOrderError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "No se pudo obtener el pedido", message(error));
  }
}

function returnValue(req: Request, field: string) {
  const bodyValue = req.body && typeof req.body === "object"
    ? (req.body as Record<string, unknown>)[field]
    : undefined;
  const value = bodyValue ?? req.query[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function paymentResultUrl(orderId?: number, status = "PROCESSING") {
  if (orderId) {
    const guestAccess = await issueGuestOrderTrackingAccessService(orderId, status);
    if (guestAccess) return guestAccess.url;
  }
  const url = new URL("/payment-result", FRONTEND_URL);
  if (orderId) url.searchParams.set("orderId", String(orderId));
  url.searchParams.set("status", status);
  return url.toString();
}

export async function webpayReturnController(req: Request, res: Response) {
  const tokenWs = returnValue(req, "token_ws");
  const tbkToken = returnValue(req, "TBK_TOKEN");
  const buyOrder = returnValue(req, "TBK_ORDEN_COMPRA");
  const sessionId = returnValue(req, "TBK_ID_SESION");

  try {
    if (tbkToken || (!tokenWs && buyOrder && sessionId)) {
      const result = await cancelWebpayPaymentService({
        token: tbkToken,
        buyOrder,
        sessionId,
        outcome: !tbkToken ? "expired" : tokenWs ? "failed" : "cancelled",
      });
      return res.redirect(303, await paymentResultUrl(result.orderId, result.orderStatus));
    }

    if (!tokenWs) return res.redirect(303, await paymentResultUrl(undefined, "INVALID_RETURN"));

    const result = await confirmWebpayPaymentService(tokenWs);
    return res.redirect(303, await paymentResultUrl(result.orderId, result.orderStatus));
  } catch (error) {
    console.error("Error al procesar retorno Webpay:", message(error));
    let orderId: number | null = null;
    try {
      orderId = await findOrderIdByPaymentReturnService({
        token: tbkToken || tokenWs,
        buyOrder,
        sessionId,
      });
    } catch {
      // El resultado queda consultable desde Mis pedidos aunque falle esta recuperación.
    }
    return res.redirect(303, await paymentResultUrl(orderId || undefined, "PROCESSING"));
  }
}
