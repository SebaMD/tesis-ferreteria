import { randomUUID } from "crypto";
import { db, type DbTransaction } from "../../db/index.js";
import {
  ONLINE_ORDER_RESERVATION_MINUTES,
  WEBPAY_TIMEOUT_MS,
} from "../../config/configEnv.js";
import { applyInventoryMovement } from "../inventory/inventory.service.js";
import { notifyWarehousesBestEffort } from "../notifications/notifications.service.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
  lockProductsForAvailability,
} from "../inventory/stockAvailability.repository.js";
import {
  commitWebpayTransaction,
  createWebpayTransaction,
  getWebpayTransactionStatus,
  WebpayConfigurationError,
  type WebpayTransactionResult,
} from "../payments/webpay.service.js";
import {
  archiveOrderForClient,
  createOnlineOrder,
  createOnlineOrderItems,
  createOnlinePayment,
  cancelOtherOpenPayments,
  claimPaymentReconciliationLease,
  deferSupersededProcessingPayment,
  expirePendingOrdersForClient,
  findActiveClientForUpdate,
  findClientDeliveryAddress,
  findLatestPaymentForOrder,
  findOtherAuthorizedPayment,
  findPaymentsNeedingReconciliation,
  findOrderByCheckoutKey,
  findOrderByIdAndClient,
  findOrderForClientUpdate,
  findOrderForUpdate,
  findOrderItems,
  findOrdersByClient,
  findPaymentByReturnIdentifiers,
  findPaymentByToken,
  findPaymentForUpdateById,
  findPaymentLaunchByOrder,
  findPendingOrderForClient,
  markPaymentProcessing,
  markPaymentLaunchFailed,
  resetOrderReservation,
  saveWebpayLaunch,
  updateOrderStatus,
  updatePaymentResult,
  upsertClientDeliveryAddress,
} from "./onlineOrders.repository.js";
import type { CreateCheckoutBody } from "./onlineOrders.validation.js";

export class OnlineOrderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "OnlineOrderError";
  }
}

type PreparedPayment = {
  orderId: number;
  paymentId: number;
  buyOrder: string;
  sessionId: string;
  amount: number;
};

const WEBPAY_LAUNCH_REUSE_MILLISECONDS = 4 * 60_000;
const WEBPAY_LAUNCH_INITIALIZATION_MILLISECONDS = WEBPAY_TIMEOUT_MS + 15_000;
const RECONCILIATION_EXTENSION_MILLISECONDS = 5 * 60_000;
const PAYMENT_REVIEW_AFTER_MILLISECONDS = 60 * 60_000;
const RECONCILIATION_STALE_MARGIN_MILLISECONDS = 15_000;
const SUPERSEDED_PROCESSING_EXPIRATION_MILLISECONDS = 10 * 60_000;
const PAYMENT_SETTLED_ORDER_STATUSES = [
  "PAID",
  "PAYMENT_REVIEW",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

function hasSettledPayment(status: string) {
  return PAYMENT_SETTLED_ORDER_STATUSES.includes(status);
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  if ("code" in error) return error.code;
  const cause = "cause" in error ? error.cause : null;
  return cause && typeof cause === "object" && "code" in cause ? cause.code : null;
}

function reservationExpiration() {
  return new Date(Date.now() + ONLINE_ORDER_RESERVATION_MINUTES * 60_000);
}

function moneyInCents(value: string | number | null | undefined) {
  return Math.round(Number(value || 0) * 100);
}

function createBuyOrder(orderId: number) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `FYF${orderId}-${Date.now().toString(36)}-${suffix}`.slice(0, 26);
}

function createSessionId(clientId: number, orderId: number) {
  return `client-${clientId}-order-${orderId}-${randomUUID()}`.slice(0, 61);
}

function assertActiveClient(client: Awaited<ReturnType<typeof findActiveClientForUpdate>>) {
  if (!client || client.role !== "CLIENT" || client.status !== "ACTIVE") {
    throw new OnlineOrderError("La cuenta CLIENT no esta activa", 403);
  }
}

async function preparePaymentAttempt(
  tx: DbTransaction,
  data: { orderId: number; clientId: number; total: string },
) {
  const payment = await createOnlinePayment(tx, {
    orderId: data.orderId,
    buyOrder: createBuyOrder(data.orderId),
    sessionId: createSessionId(data.clientId, data.orderId),
    amount: data.total,
  });

  return {
    orderId: data.orderId,
    paymentId: payment.id,
    buyOrder: payment.buyOrder,
    sessionId: payment.sessionId,
    amount: Number(payment.amount),
  } satisfies PreparedPayment;
}

async function startWebpayPayment(prepared: PreparedPayment) {
  try {
    const webpay = await createWebpayTransaction({
      buyOrder: prepared.buyOrder,
      sessionId: prepared.sessionId,
      amount: prepared.amount,
    });

    const saved = await saveWebpayLaunch(prepared.paymentId, {
      token: webpay.token,
      redirectUrl: webpay.url,
    });

    if (!saved) {
      throw new OnlineOrderError("No se pudo guardar la sesion de Webpay", 409);
    }

    return {
      orderId: prepared.orderId,
      paymentId: prepared.paymentId,
      token: webpay.token,
      url: webpay.url,
      total: prepared.amount,
    };
  } catch (error) {
    await markPaymentLaunchFailed(prepared.paymentId, prepared.orderId);
    if (error instanceof WebpayConfigurationError) throw error;
    if (error instanceof OnlineOrderError) throw error;
    throw new OnlineOrderError(
      "No se pudo iniciar Webpay. La reserva fue liberada; intenta nuevamente.",
      502,
    );
  }
}

export async function createCheckoutService(clientId: number, data: CreateCheckoutBody) {
  await reconcileDueOnlinePaymentsService(clientId);

  let prepared: PreparedPayment | null = null;
  let existingLaunch: {
    orderId: number;
    paymentId: number;
    token: string;
    url: string;
    total: number;
  } | null = null;
  let expiredLaunch = false;

  try {
    await db.transaction(async (tx) => {
      const client = await findActiveClientForUpdate(tx, clientId);
      assertActiveClient(client);
      await expirePendingOrdersForClient(tx, clientId);

      const existingOrder = await findOrderByCheckoutKey(tx, clientId, data.checkoutKey);
      if (existingOrder) {
        const payment = await findPaymentLaunchByOrder(tx, existingOrder.id);
        if (
          existingOrder.status === "PENDING_PAYMENT"
          && payment?.status === "CREATED"
          && payment.token
          && payment.redirectUrl
          && Date.now() - payment.createdAt.getTime() < WEBPAY_LAUNCH_REUSE_MILLISECONDS
        ) {
          existingLaunch = {
            orderId: existingOrder.id,
            paymentId: payment.id,
            token: payment.token,
            url: payment.redirectUrl,
            total: Number(existingOrder.total),
          };
          return;
        }

        if (
          existingOrder.status === "PENDING_PAYMENT"
          && payment?.status === "CREATED"
          && !payment.token
          && !payment.redirectUrl
          && Date.now() - payment.createdAt.getTime() < WEBPAY_LAUNCH_INITIALIZATION_MILLISECONDS
        ) {
          throw new OnlineOrderError(
            "El pago Webpay se esta iniciando. Espera unos segundos y vuelve a intentarlo.",
            409,
          );
        }

        if (
          existingOrder.status === "PENDING_PAYMENT"
          && payment?.status === "CREATED"
          && !payment.token
          && !payment.redirectUrl
        ) {
          await updatePaymentResult(tx, payment.id, { status: "EXPIRED" });
          await updateOrderStatus(tx, existingOrder.id, "EXPIRED", ["PENDING_PAYMENT"]);
          expiredLaunch = true;
          return;
        }
        if (existingOrder.status === "PENDING_PAYMENT" && payment?.status === "CREATED") {
          throw new OnlineOrderError(
            "La sesion anterior de Webpay ya no puede reutilizarse. Revisa Mis pedidos.",
            409,
          );
        }
        throw new OnlineOrderError(
          "Este intento de checkout ya fue procesado. Revisa Mis pedidos.",
          409,
        );
      }

      if (await findPendingOrderForClient(tx, clientId)) {
        throw new OnlineOrderError(
          "Tienes un pago pendiente. Finaliza o revisa tu compra anterior antes de iniciar un nuevo pago.",
          409,
        );
      }

      const productIds = data.items.map((item) => item.productId);
      const products = await lockProductsForAvailability(tx, productIds);
      const productById = new Map(products.map((product) => [product.id, product]));
      const reservedByProduct = await findActiveReservedQuantities(tx, productIds);

      const orderItems = data.items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) throw new OnlineOrderError(`Producto ${item.productId} no encontrado`, 404);
        if (!product.status) {
          throw new OnlineOrderError(`El producto ${product.name} ya no esta disponible`, 409);
        }

        const availableStock = calculateAvailableStock(
          product.currentStock,
          reservedByProduct.get(product.id) || 0,
        );
        if (item.quantity > availableStock) {
          throw new OnlineOrderError(
            `El stock disponible de ${product.name} cambio. Solo quedan ${availableStock} unidades.`,
            409,
          );
        }

        const unitPrice = Number(product.price);
        if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
          throw new OnlineOrderError(
            `El precio de ${product.name} no es valido para un pago en pesos chilenos.`,
            409,
          );
        }

        const unitPriceInCents = moneyInCents(unitPrice);
        const subtotalInCents = unitPriceInCents * item.quantity;
        return {
          productId: product.id,
          quantity: item.quantity,
          unitPrice: (unitPriceInCents / 100).toFixed(2),
          subtotal: (subtotalInCents / 100).toFixed(2),
          subtotalInCents,
        };
      });

      const totalInCents = orderItems.reduce(
        (total, item) => total + item.subtotalInCents,
        0,
      );
      const order = await createOnlineOrder(tx, {
        clientId,
        checkoutKey: data.checkoutKey,
        total: (totalInCents / 100).toFixed(2),
        deliveryType: data.deliveryType,
        deliveryRecipientName: data.deliveryRecipientName,
        deliveryPhone: data.deliveryPhone,
        deliveryAddress: data.deliveryAddress,
        deliveryCommune: data.deliveryCommune,
        deliveryReference: data.deliveryReference,
        deliveryLatitude: data.deliveryLatitude,
        deliveryLongitude: data.deliveryLongitude,
        reservationExpiresAt: reservationExpiration(),
      });

      await createOnlineOrderItems(tx, orderItems.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })));

      if (data.deliveryType === "DELIVERY" && data.saveDeliveryAddress) {
        await upsertClientDeliveryAddress(tx, {
          clientId,
          recipientName: data.deliveryRecipientName!,
          phone: data.deliveryPhone!,
          address: data.deliveryAddress!,
          commune: data.deliveryCommune!,
          reference: data.deliveryReference,
          latitude: data.deliveryLatitude,
          longitude: data.deliveryLongitude,
        });
      }

      prepared = await preparePaymentAttempt(tx, {
        orderId: order.id,
        clientId,
        total: order.total,
      });
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new OnlineOrderError(
        "Tienes un pago pendiente. Finaliza o revisa tu compra anterior antes de iniciar un nuevo pago.",
        409,
      );
    }
    throw error;
  }

  if (expiredLaunch) {
    throw new OnlineOrderError(
      "La sesion de Webpay vencio. Reintenta el pago desde Mis pedidos.",
      409,
    );
  }
  if (existingLaunch) return existingLaunch;
  if (!prepared) throw new OnlineOrderError("No se pudo preparar el pago", 500);
  return startWebpayPayment(prepared);
}

export async function getClientDeliveryAddressService(clientId: number) {
  return findClientDeliveryAddress(clientId);
}

export async function retryOnlineOrderPaymentService(clientId: number, orderId: number) {
  await reconcileDueOnlinePaymentsService(clientId);

  const prepared = await db.transaction(async (tx) => {
    const client = await findActiveClientForUpdate(tx, clientId);
    assertActiveClient(client);
    await expirePendingOrdersForClient(tx, clientId);

    const order = await findOrderForClientUpdate(tx, orderId, clientId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);
    if (!["PAYMENT_FAILED", "CANCELLED", "EXPIRED"].includes(order.status)) {
      throw new OnlineOrderError("Este pedido no permite reintentar el pago", 409);
    }
    if (await findPendingOrderForClient(tx, clientId, orderId)) {
      throw new OnlineOrderError(
        "Tienes un pago pendiente. Finaliza o revisa tu compra anterior antes de reintentar otro pedido.",
        409,
      );
    }

    const items = await findOrderItems(tx, order.id);
    const productIds = items.map((item) => item.productId);
    const products = await lockProductsForAvailability(tx, productIds);
    const productById = new Map(products.map((product) => [product.id, product]));
    const reservedByProduct = await findActiveReservedQuantities(tx, productIds, order.id);

    for (const item of items) {
      const product = productById.get(item.productId);
      if (!product || !product.status) {
        throw new OnlineOrderError("Uno de los productos ya no esta disponible", 409);
      }
      const availableStock = calculateAvailableStock(
        product.currentStock,
        reservedByProduct.get(product.id) || 0,
      );
      if (item.quantity > availableStock) {
        throw new OnlineOrderError(
          `El stock disponible de ${product.name} cambio. Solo quedan ${availableStock} unidades.`,
          409,
        );
      }
    }

    await resetOrderReservation(tx, order.id, reservationExpiration());
    return preparePaymentAttempt(tx, {
      orderId: order.id,
      clientId,
      total: order.total,
    });
  });

  return startWebpayPayment(prepared);
}

export async function continueOnlineOrderPaymentService(clientId: number, orderId: number) {
  await reconcileDueOnlinePaymentsService(clientId);

  return db.transaction(async (tx) => {
    const client = await findActiveClientForUpdate(tx, clientId);
    assertActiveClient(client);
    await expirePendingOrdersForClient(tx, clientId);

    const order = await findOrderForClientUpdate(tx, orderId, clientId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);
    if (order.status !== "PENDING_PAYMENT") {
      throw new OnlineOrderError("Este pedido ya no tiene un pago pendiente", 409);
    }
    if (order.reservationExpiresAt.getTime() <= Date.now()) {
      throw new OnlineOrderError("La reserva del pedido ya vencio", 409);
    }

    const payment = await findPaymentLaunchByOrder(tx, order.id);
    if (payment?.status === "PROCESSING") {
      throw new OnlineOrderError(
        "El pago se esta confirmando. Revisa el estado del pedido antes de volver a intentarlo.",
        409,
      );
    }
    if (
      payment?.status !== "CREATED"
      || !payment.token
      || !payment.redirectUrl
    ) {
      throw new OnlineOrderError(
        "La sesion de Webpay ya no se puede continuar. Revisa el pedido y espera su conciliacion o vencimiento.",
        409,
      );
    }

    return {
      orderId: order.id,
      paymentId: payment.id,
      token: payment.token,
      url: payment.redirectUrl,
      total: Number(payment.amount),
    };
  });
}

export async function archiveClientOrderService(clientId: number, orderId: number) {
  await reconcileDueOnlinePaymentsService(clientId);
  await expireClientOrders(clientId);

  return db.transaction(async (tx) => {
    const client = await findActiveClientForUpdate(tx, clientId);
    assertActiveClient(client);

    const order = await findOrderForClientUpdate(tx, orderId, clientId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);
    if (!["PAYMENT_FAILED", "CANCELLED", "EXPIRED"].includes(order.status)) {
      throw new OnlineOrderError("Este pedido no se puede ocultar", 409);
    }

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment && !["FAILED", "CANCELLED", "EXPIRED"].includes(latestPayment.status)) {
      throw new OnlineOrderError(
        "El estado del pago todavia requiere seguimiento y el pedido no se puede ocultar",
        409,
      );
    }

    const archived = await archiveOrderForClient(tx, order.id, clientId);
    if (!archived) throw new OnlineOrderError("El pedido ya estaba oculto", 409);
    return { orderId: archived.id };
  });
}

function transactionDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function responseData(response: WebpayTransactionResult) {
  return {
    authorizationCode: response.authorization_code || null,
    paymentTypeCode: response.payment_type_code || null,
    responseCode: Number.isInteger(response.response_code) ? response.response_code : null,
    transactionDate: transactionDate(response.transaction_date),
  };
}

function isAuthorizedResponse(response: WebpayTransactionResult) {
  return response.status === "AUTHORIZED" && response.response_code === 0;
}

function isDefinitiveFailureResponse(
  response: WebpayTransactionResult,
  source: "commit" | "status",
) {
  const terminalStatuses = ["FAILED", "REVERSED", "NULLIFIED", "PARTIALLY_NULLIFIED"];
  if (terminalStatuses.includes(String(response.status || ""))) return true;
  return source === "commit"
    && Number.isInteger(response.response_code)
    && response.response_code !== 0;
}

function responseMatchesPayment(
  response: WebpayTransactionResult,
  payment: { amount: string; buyOrder: string; sessionId: string },
) {
  return moneyInCents(response.amount) === moneyInCents(payment.amount)
    && response.buy_order === payment.buyOrder
    && response.session_id === payment.sessionId;
}

type ProviderResponseSource = "commit" | "status";

type LocatedPayment = { id: number; orderId: number };

async function finishProviderResponse(data: {
  locatedPayment: LocatedPayment;
  response: WebpayTransactionResult;
  source: ProviderResponseSource;
}) {
  const result = await db.transaction(async (tx) => {
    // Todos los flujos usan el mismo orden de locks: pedido -> pago -> productos.
    const order = await findOrderForUpdate(tx, data.locatedPayment.orderId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);

    const payment = await findPaymentForUpdateById(tx, data.locatedPayment.id);
    if (!payment || payment.orderId !== order.id) {
      throw new OnlineOrderError("Pago Webpay no encontrado", 404);
    }

    if (payment.status === "AUTHORIZED" && hasSettledPayment(order.status)) {
      return { orderId: order.id, orderStatus: order.status, becamePaid: false };
    }

    const authorized = isAuthorizedResponse(data.response);
    if (!authorized) {
      if (!isDefinitiveFailureResponse(data.response, data.source)) {
        return { orderId: order.id, orderStatus: order.status, becamePaid: false };
      }

      if (!["AUTHORIZED", "FAILED", "CANCELLED", "EXPIRED"].includes(payment.status)) {
        await updatePaymentResult(tx, payment.id, {
          status: "FAILED",
          ...responseData(data.response),
        });
      }

      const latestPayment = await findLatestPaymentForOrder(tx, order.id);
      if (latestPayment?.id === payment.id && order.status === "PENDING_PAYMENT") {
        const updated = await updateOrderStatus(
          tx,
          order.id,
          "PAYMENT_FAILED",
          ["PENDING_PAYMENT"],
        );
        return {
          orderId: order.id,
          orderStatus: updated?.status || order.status,
          becamePaid: false,
        };
      }

      return { orderId: order.id, orderStatus: order.status, becamePaid: false };
    }

    const validProviderData = responseMatchesPayment(data.response, payment);
    const anotherAuthorizedPayment = await findOtherAuthorizedPayment(tx, order.id, payment.id);

    await updatePaymentResult(tx, payment.id, {
      status: "AUTHORIZED",
      ...responseData(data.response),
    });

    if (
      !validProviderData
      || anotherAuthorizedPayment
      || hasSettledPayment(order.status)
    ) {
      await cancelOtherOpenPayments(tx, order.id, payment.id);
      if (order.status !== "PAYMENT_REVIEW") {
        await updateOrderStatus(tx, order.id, "PAYMENT_REVIEW");
      }
      return { orderId: order.id, orderStatus: "PAYMENT_REVIEW", becamePaid: false };
    }

    const items = await findOrderItems(tx, order.id);
    const productIds = items.map((item) => item.productId);
    const products = await lockProductsForAvailability(tx, productIds);
    const productById = new Map(products.map((product) => [product.id, product]));
    const reservedByProduct = await findActiveReservedQuantities(tx, productIds, order.id);

    const canFulfill = items.length > 0 && items.every((item) => {
      const product = productById.get(item.productId);
      if (!product) return false;
      const availableStock = calculateAvailableStock(
        product.currentStock,
        reservedByProduct.get(product.id) || 0,
      );
      return item.quantity <= availableStock;
    });

    if (!canFulfill) {
      await cancelOtherOpenPayments(tx, order.id, payment.id);
      await updateOrderStatus(tx, order.id, "PAYMENT_REVIEW");
      return { orderId: order.id, orderStatus: "PAYMENT_REVIEW", becamePaid: false };
    }

    await cancelOtherOpenPayments(tx, order.id, payment.id);

    for (const item of items) {
      await applyInventoryMovement(tx, {
        productId: item.productId,
        userId: order.clientId,
        movementType: "EXIT",
        quantity: item.quantity,
        reason: `Pedido online P-${String(order.id).padStart(6, "0")}`,
        allowInactive: true,
        excludedReservationOrderId: order.id,
      });
    }

    const updated = await updateOrderStatus(
      tx,
      order.id,
      "PAID",
      ["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED", "EXPIRED"],
    );
    if (!updated) throw new OnlineOrderError("El pedido ya fue procesado", 409);
    return { orderId: order.id, orderStatus: "PAID", becamePaid: true };
  });

  if (result.becamePaid) {
    void notifyWarehousesBestEffort({
      folio: `P-${String(result.orderId).padStart(6, "0")}`,
      event: "NEW_ONLINE_ORDER_PAID",
    });
  }

  return { orderId: result.orderId, orderStatus: result.orderStatus };
}

async function claimWebpayConfirmation(token: string) {
  const locatedPayment = await findPaymentByToken(token);
  if (!locatedPayment) throw new OnlineOrderError("Pago Webpay no encontrado", 404);

  return db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, locatedPayment.orderId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);

    const payment = await findPaymentForUpdateById(tx, locatedPayment.id);
    if (!payment || payment.orderId !== order.id) {
      throw new OnlineOrderError("Pago Webpay no encontrado", 404);
    }

    if (payment.status === "AUTHORIZED" && hasSettledPayment(order.status)) {
      return {
        locatedPayment: payment,
        orderStatus: order.status,
        mode: "settled" as const,
      };
    }

    if (hasSettledPayment(order.status)) {
      return {
        locatedPayment: payment,
        orderStatus: order.status,
        mode: "status" as const,
      };
    }

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (
      payment.status === "CREATED"
      && order.status === "PENDING_PAYMENT"
      && latestPayment?.id === payment.id
    ) {
      const claimed = await markPaymentProcessing(tx, payment.id);
      if (claimed) {
        return {
          locatedPayment: { ...payment, status: "PROCESSING" },
          orderStatus: order.status,
          mode: "commit" as const,
        };
      }
    }

    return {
      locatedPayment: payment,
      orderStatus: order.status,
      mode: "status" as const,
    };
  });
}

export async function confirmWebpayPaymentService(token: string) {
  const claim = await claimWebpayConfirmation(token);
  if (claim.mode === "settled") {
    return { orderId: claim.locatedPayment.orderId, orderStatus: claim.orderStatus };
  }

  let response: WebpayTransactionResult | null = null;
  let source: ProviderResponseSource = claim.mode === "commit" ? "commit" : "status";

  if (claim.mode === "commit") {
    try {
      response = await commitWebpayTransaction(token);
    } catch {
      source = "status";
    }
  }

  if (!response) {
    try {
      response = await getWebpayTransactionStatus(token);
    } catch {
      return { orderId: claim.locatedPayment.orderId, orderStatus: claim.orderStatus };
    }
  }

  return finishProviderResponse({
    locatedPayment: claim.locatedPayment,
    response,
    source,
  });
}

export async function cancelWebpayPaymentService(data: {
  token?: string;
  buyOrder?: string;
  sessionId?: string;
  outcome: "cancelled" | "expired" | "failed";
}) {
  const locatedPayment = await findPaymentByReturnIdentifiers(data);
  if (!locatedPayment) throw new OnlineOrderError("Intento de pago no encontrado", 404);

  if (data.token) {
    try {
      const response = await getWebpayTransactionStatus(data.token);
      if (
        isAuthorizedResponse(response)
        || isDefinitiveFailureResponse(response, "status")
      ) {
        return finishProviderResponse({ locatedPayment, response, source: "status" });
      }
    } catch {
      // Un retorno de aborto puede no permitir consultar el token.
    }
  }

  return db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, locatedPayment.orderId);
    if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);

    const payment = await findPaymentForUpdateById(tx, locatedPayment.id);
    if (!payment || payment.orderId !== order.id) {
      throw new OnlineOrderError("Intento de pago no encontrado", 404);
    }

    if (payment.status === "AUTHORIZED" || hasSettledPayment(order.status)) {
      return { orderId: order.id, orderStatus: order.status };
    }

    // Un commit puede seguir en curso aunque llegue un retorno de cancelacion.
    // No se libera la reserva hasta obtener un resultado definitivo del proveedor.
    if (payment.status === "PROCESSING") {
      return { orderId: order.id, orderStatus: order.status };
    }

    const paymentStatus = data.outcome === "expired"
      ? "EXPIRED"
      : data.outcome === "failed" ? "FAILED" : "CANCELLED";
    const orderStatus = data.outcome === "expired"
      ? "EXPIRED"
      : data.outcome === "failed" ? "PAYMENT_FAILED" : "CANCELLED";

    if (["CREATED", "PROCESSING"].includes(payment.status)) {
      await updatePaymentResult(tx, payment.id, { status: paymentStatus });
    }

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment?.id === payment.id && order.status === "PENDING_PAYMENT") {
      const updated = await updateOrderStatus(
        tx,
        order.id,
        orderStatus,
        ["PENDING_PAYMENT"],
      );
      return { orderId: order.id, orderStatus: updated?.status || order.status };
    }

    return { orderId: order.id, orderStatus: order.status };
  });
}

export async function findOrderIdByPaymentReturnService(data: {
  token?: string;
  buyOrder?: string;
  sessionId?: string;
}) {
  return (await findPaymentByReturnIdentifiers(data))?.orderId ?? null;
}

async function expireClientOrders(clientId: number) {
  await db.transaction(async (tx) => {
    const client = await findActiveClientForUpdate(tx, clientId);
    assertActiveClient(client);
    await expirePendingOrdersForClient(tx, clientId);
  });
}

async function protectAmbiguousPayment(
  candidate: Awaited<ReturnType<typeof findPaymentsNeedingReconciliation>>[number],
) {
  await db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, candidate.orderId);
    if (!order || order.status !== "PENDING_PAYMENT") return;

    const payment = await findPaymentForUpdateById(tx, candidate.paymentId);
    if (
      !payment
      || payment.orderId !== order.id
      || !["CREATED", "PROCESSING"].includes(payment.status)
    ) return;

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment?.id !== payment.id) return;

    if (
      Date.now() - candidate.paymentCreatedAt.getTime()
        >= PAYMENT_REVIEW_AFTER_MILLISECONDS
    ) {
      await updateOrderStatus(tx, order.id, "PAYMENT_REVIEW", ["PENDING_PAYMENT"]);
      return;
    }

    const items = await findOrderItems(tx, order.id);
    const productIds = items.map((item) => item.productId);
    const products = await lockProductsForAvailability(tx, productIds);
    const productById = new Map(products.map((product) => [product.id, product]));
    const reservedByProduct = await findActiveReservedQuantities(tx, productIds, order.id);

    const canProtect = items.length > 0 && items.every((item) => {
      const product = productById.get(item.productId);
      if (!product) return false;
      return item.quantity <= calculateAvailableStock(
        product.currentStock,
        reservedByProduct.get(product.id) || 0,
      );
    });

    if (canProtect) {
      await resetOrderReservation(
        tx,
        order.id,
        new Date(Math.max(
          order.reservationExpiresAt.getTime(),
          Date.now() + RECONCILIATION_EXTENSION_MILLISECONDS,
        )),
      );
      return;
    }

    await updateOrderStatus(tx, order.id, "PAYMENT_REVIEW", ["PENDING_PAYMENT"]);
  });
}

async function expireReconciledPayment(
  candidate: Awaited<ReturnType<typeof findPaymentsNeedingReconciliation>>[number],
) {
  await db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, candidate.orderId);
    if (!order || order.status !== "PENDING_PAYMENT") return;

    const payment = await findPaymentForUpdateById(tx, candidate.paymentId);
    if (
      !payment
      || payment.orderId !== order.id
      || payment.status !== "CREATED"
      || payment.updatedAt.getTime() !== candidate.paymentUpdatedAt.getTime()
    ) return;

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment?.id !== payment.id || order.reservationExpiresAt.getTime() > Date.now()) {
      return;
    }

    await updatePaymentResult(tx, payment.id, { status: "EXPIRED" });
    await updateOrderStatus(tx, order.id, "EXPIRED", ["PENDING_PAYMENT"]);
  });
}

async function reconcilePaymentCandidate(
  candidate: Awaited<ReturnType<typeof findPaymentsNeedingReconciliation>>[number],
) {
  if (!candidate.token) return;

  const locatedPayment = { id: candidate.paymentId, orderId: candidate.orderId };
  let response: WebpayTransactionResult;

  if (
    candidate.paymentStatus === "PROCESSING"
    && candidate.orderStatus === "PENDING_PAYMENT"
    &&
    candidate.reservationExpiresAt.getTime()
      <= Date.now() + RECONCILIATION_EXTENSION_MILLISECONDS
  ) {
    await protectAmbiguousPayment(candidate);
  }

  try {
    response = await getWebpayTransactionStatus(candidate.token);
  } catch {
    if (
      candidate.paymentStatus === "PROCESSING"
      && candidate.orderStatus !== "PENDING_PAYMENT"
    ) {
      await deferSupersededProcessingPayment(
        candidate.orderId,
        candidate.paymentId,
        candidate.paymentUpdatedAt,
        false,
      );
    } else {
      await protectAmbiguousPayment(candidate);
    }
    return;
  }

  if (isAuthorizedResponse(response) || isDefinitiveFailureResponse(response, "status")) {
    await finishProviderResponse({ locatedPayment, response, source: "status" });
    return;
  }

  if (
    candidate.paymentStatus === "PROCESSING"
    && candidate.orderStatus !== "PENDING_PAYMENT"
  ) {
    const canExpire = response.status === "INITIALIZED"
      && Date.now() - candidate.paymentCreatedAt.getTime()
        >= SUPERSEDED_PROCESSING_EXPIRATION_MILLISECONDS;
    await deferSupersededProcessingPayment(
      candidate.orderId,
      candidate.paymentId,
      candidate.paymentUpdatedAt,
      canExpire,
    );
    return;
  }

  if (candidate.paymentStatus === "CREATED") {
    if (
      response.status === "INITIALIZED"
      && candidate.reservationExpiresAt.getTime() <= Date.now()
    ) {
      await expireReconciledPayment(candidate);
    } else if (response.status !== "INITIALIZED") {
      await protectAmbiguousPayment(candidate);
    }
    return;
  }

  if (response.status !== "INITIALIZED") {
    await protectAmbiguousPayment(candidate);
    return;
  }

  if (!await claimPaymentReconciliationLease(
    candidate.orderId,
    candidate.paymentId,
    candidate.paymentUpdatedAt,
  )) {
    return;
  }

  try {
    response = await commitWebpayTransaction(candidate.token);
    if (isAuthorizedResponse(response) || isDefinitiveFailureResponse(response, "commit")) {
      await finishProviderResponse({ locatedPayment, response, source: "commit" });
    } else {
      await protectAmbiguousPayment(candidate);
    }
  } catch {
    try {
      response = await getWebpayTransactionStatus(candidate.token);
      if (isAuthorizedResponse(response) || isDefinitiveFailureResponse(response, "status")) {
        await finishProviderResponse({ locatedPayment, response, source: "status" });
        return;
      }
      await protectAmbiguousPayment(candidate);
    } catch {
      await protectAmbiguousPayment(candidate);
    }
  }
}

export async function reconcileDueOnlinePaymentsService(clientId?: number) {
  const processingStaleBefore = new Date(
    Date.now() - WEBPAY_TIMEOUT_MS - RECONCILIATION_STALE_MARGIN_MILLISECONDS,
  );
  const candidates = await findPaymentsNeedingReconciliation(processingStaleBefore, clientId);

  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map(reconcilePaymentCandidate));
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("No se pudo conciliar un pago Webpay:", result.reason);
      }
    }
  }

  await db.transaction((tx) => expirePendingOrdersForClient(tx, clientId));
}

export async function getClientOrdersService(clientId: number) {
  await reconcileDueOnlinePaymentsService(clientId);
  await expireClientOrders(clientId);
  return findOrdersByClient(clientId);
}

export async function getClientOrderByIdService(clientId: number, orderId: number) {
  await reconcileDueOnlinePaymentsService(clientId);
  await expireClientOrders(clientId);
  const order = await findOrderByIdAndClient(orderId, clientId);
  if (!order) throw new OnlineOrderError("Pedido no encontrado", 404);
  return order;
}
