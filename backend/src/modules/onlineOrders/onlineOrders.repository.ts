import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  onlineOrderItemsTable,
  onlineOrdersTable,
  onlinePaymentsTable,
  productsTable,
  rolesTable,
  usersTable,
  type NewOnlineOrderItem,
  type OnlineOrderStatus,
} from "../../db/schema/index.js";

const orderColumns = {
  id: onlineOrdersTable.id,
  clientId: onlineOrdersTable.clientId,
  clientNames: usersTable.names,
  clientSurnames: usersTable.surnames,
  clientEmail: usersTable.correo,
  clientPhone: usersTable.phone,
  checkoutKey: onlineOrdersTable.checkoutKey,
  status: onlineOrdersTable.status,
  total: onlineOrdersTable.total,
  deliveryType: onlineOrdersTable.deliveryType,
  deliveryRecipientName: onlineOrdersTable.deliveryRecipientName,
  deliveryPhone: onlineOrdersTable.deliveryPhone,
  deliveryAddress: onlineOrdersTable.deliveryAddress,
  deliveryCommune: onlineOrdersTable.deliveryCommune,
  deliveryReference: onlineOrdersTable.deliveryReference,
  reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
  paidAt: onlineOrdersTable.paidAt,
  clientArchivedAt: onlineOrdersTable.clientArchivedAt,
  preparationStartedAt: onlineOrdersTable.preparationStartedAt,
  preparedAt: onlineOrdersTable.preparedAt,
  deliveryStartedAt: onlineOrdersTable.deliveryStartedAt,
  deliveredAt: onlineOrdersTable.deliveredAt,
  createdAt: onlineOrdersTable.createdAt,
  updatedAt: onlineOrdersTable.updatedAt,
};

const paymentColumns = {
  id: onlinePaymentsTable.id,
  orderId: onlinePaymentsTable.orderId,
  provider: onlinePaymentsTable.provider,
  buyOrder: onlinePaymentsTable.buyOrder,
  amount: onlinePaymentsTable.amount,
  status: onlinePaymentsTable.status,
  authorizationCode: onlinePaymentsTable.authorizationCode,
  paymentTypeCode: onlinePaymentsTable.paymentTypeCode,
  responseCode: onlinePaymentsTable.responseCode,
  transactionDate: onlinePaymentsTable.transactionDate,
  createdAt: onlinePaymentsTable.createdAt,
  updatedAt: onlinePaymentsTable.updatedAt,
  token: onlinePaymentsTable.token,
  redirectUrl: onlinePaymentsTable.redirectUrl,
};

export async function findActiveClientForUpdate(tx: DbTransaction, clientId: number) {
  const [client] = await tx
    .select({
      id: usersTable.id,
      role: rolesTable.name,
      status: usersTable.status,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, clientId))
    .limit(1)
    .for("update");

  return client ?? null;
}

export async function expirePendingOrdersForClient(tx: DbTransaction, clientId?: number) {
  const conditions = [
    eq(onlineOrdersTable.status, "PENDING_PAYMENT"),
    lte(onlineOrdersTable.reservationExpiresAt, sql`now()`),
    sql`not exists (
      select 1
      from ${onlinePaymentsTable}
      where ${onlinePaymentsTable.orderId} = ${onlineOrdersTable.id}
        and ${onlinePaymentsTable.token} is not null
        and ${onlinePaymentsTable.status} in ('CREATED', 'PROCESSING')
    )`,
  ];

  if (clientId !== undefined) conditions.push(eq(onlineOrdersTable.clientId, clientId));

  const expiredOrders = await tx
    .update(onlineOrdersTable)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: onlineOrdersTable.id });

  if (expiredOrders.length > 0) {
    await tx
      .update(onlinePaymentsTable)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(and(
        inArray(onlinePaymentsTable.orderId, expiredOrders.map((order) => order.id)),
        eq(onlinePaymentsTable.status, "CREATED"),
      ));
  }

  return expiredOrders;
}

export async function findOrderByCheckoutKey(
  tx: DbTransaction,
  clientId: number,
  checkoutKey: string,
) {
  const [order] = await tx
    .select({
      id: onlineOrdersTable.id,
      status: onlineOrdersTable.status,
      total: onlineOrdersTable.total,
      reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
    })
    .from(onlineOrdersTable)
    .where(and(
      eq(onlineOrdersTable.clientId, clientId),
      eq(onlineOrdersTable.checkoutKey, checkoutKey),
    ))
    .limit(1)
    .for("update");

  return order ?? null;
}

export async function findPendingOrderForClient(
  tx: DbTransaction,
  clientId: number,
  excludedOrderId?: number,
) {
  const conditions = [
    eq(onlineOrdersTable.clientId, clientId),
    eq(onlineOrdersTable.status, "PENDING_PAYMENT"),
    sql`${onlineOrdersTable.reservationExpiresAt} > now()`,
  ];

  if (excludedOrderId !== undefined) conditions.push(ne(onlineOrdersTable.id, excludedOrderId));

  const [order] = await tx
    .select({ id: onlineOrdersTable.id })
    .from(onlineOrdersTable)
    .where(and(...conditions))
    .limit(1);

  return order ?? null;
}

export async function createOnlineOrder(
  tx: DbTransaction,
  data: {
    clientId: number;
    checkoutKey: string;
    total: string;
    reservationExpiresAt: Date;
    deliveryType: "PICKUP" | "DELIVERY";
    deliveryRecipientName: string | null;
    deliveryPhone: string | null;
    deliveryAddress: string | null;
    deliveryCommune: string | null;
    deliveryReference: string | null;
  },
) {
  const [order] = await tx
    .insert(onlineOrdersTable)
    .values({ ...data, status: "PENDING_PAYMENT" })
    .returning({
      id: onlineOrdersTable.id,
      total: onlineOrdersTable.total,
      status: onlineOrdersTable.status,
      reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
    });

  return order;
}

export async function createOnlineOrderItems(
  tx: DbTransaction,
  items: NewOnlineOrderItem[],
) {
  return tx.insert(onlineOrderItemsTable).values(items);
}

export async function createOnlinePayment(
  tx: DbTransaction,
  data: {
    orderId: number;
    buyOrder: string;
    sessionId: string;
    amount: string;
  },
) {
  const [payment] = await tx
    .insert(onlinePaymentsTable)
    .values({ ...data, provider: "WEBPAY_PLUS", status: "CREATED" })
    .returning({
      id: onlinePaymentsTable.id,
      orderId: onlinePaymentsTable.orderId,
      buyOrder: onlinePaymentsTable.buyOrder,
      sessionId: onlinePaymentsTable.sessionId,
      amount: onlinePaymentsTable.amount,
      status: onlinePaymentsTable.status,
    });

  return payment;
}

export async function findPaymentLaunchByOrder(tx: DbTransaction, orderId: number) {
  const [payment] = await tx
    .select({
      id: onlinePaymentsTable.id,
      status: onlinePaymentsTable.status,
      token: onlinePaymentsTable.token,
      redirectUrl: onlinePaymentsTable.redirectUrl,
      amount: onlinePaymentsTable.amount,
      createdAt: onlinePaymentsTable.createdAt,
    })
    .from(onlinePaymentsTable)
    .where(eq(onlinePaymentsTable.orderId, orderId))
    .orderBy(desc(onlinePaymentsTable.createdAt), desc(onlinePaymentsTable.id))
    .limit(1);

  return payment ?? null;
}

export async function saveWebpayLaunch(
  paymentId: number,
  data: { token: string; redirectUrl: string },
) {
  const [payment] = await db
    .update(onlinePaymentsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(
      eq(onlinePaymentsTable.id, paymentId),
      eq(onlinePaymentsTable.status, "CREATED"),
    ))
    .returning({ id: onlinePaymentsTable.id });

  return payment ?? null;
}

export async function markPaymentLaunchFailed(paymentId: number, orderId: number) {
  return db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, orderId);
    if (!order) return;

    const payment = await findPaymentForUpdateById(tx, paymentId);
    if (!payment || payment.orderId !== order.id || payment.status !== "CREATED") return;

    const [failedPayment] = await tx
      .update(onlinePaymentsTable)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(and(
        eq(onlinePaymentsTable.id, paymentId),
        eq(onlinePaymentsTable.status, "CREATED"),
      ))
      .returning({ id: onlinePaymentsTable.id });

    if (!failedPayment) return;

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment?.id !== payment.id) return;

    await tx
      .update(onlineOrdersTable)
      .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
      .where(and(
        eq(onlineOrdersTable.id, orderId),
        eq(onlineOrdersTable.status, "PENDING_PAYMENT"),
      ));
  });
}

export async function findOrderForClientUpdate(
  tx: DbTransaction,
  orderId: number,
  clientId: number,
) {
  const [order] = await tx
    .select({
      id: onlineOrdersTable.id,
      clientId: onlineOrdersTable.clientId,
      status: onlineOrdersTable.status,
      total: onlineOrdersTable.total,
      reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
    })
    .from(onlineOrdersTable)
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      eq(onlineOrdersTable.clientId, clientId),
    ))
    .limit(1)
    .for("update");

  return order ?? null;
}

export async function findOrderForUpdate(tx: DbTransaction, orderId: number) {
  const [order] = await tx
    .select({
      id: onlineOrdersTable.id,
      clientId: onlineOrdersTable.clientId,
      status: onlineOrdersTable.status,
      total: onlineOrdersTable.total,
      reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
    })
    .from(onlineOrdersTable)
    .where(eq(onlineOrdersTable.id, orderId))
    .limit(1)
    .for("update");

  return order ?? null;
}

export async function findOrderItems(tx: DbTransaction, orderId: number) {
  return tx
    .select({
      orderId: onlineOrderItemsTable.orderId,
      productId: onlineOrderItemsTable.productId,
      quantity: onlineOrderItemsTable.quantity,
      unitPrice: onlineOrderItemsTable.unitPrice,
      subtotal: onlineOrderItemsTable.subtotal,
    })
    .from(onlineOrderItemsTable)
    .where(eq(onlineOrderItemsTable.orderId, orderId));
}

export async function resetOrderReservation(
  tx: DbTransaction,
  orderId: number,
  reservationExpiresAt: Date,
) {
  const [order] = await tx
    .update(onlineOrdersTable)
    .set({
      status: "PENDING_PAYMENT",
      reservationExpiresAt,
      clientArchivedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(onlineOrdersTable.id, orderId))
    .returning({ id: onlineOrdersTable.id });

  return order ?? null;
}

export async function findPaymentByToken(token: string) {
  const [payment] = await db
    .select()
    .from(onlinePaymentsTable)
    .where(eq(onlinePaymentsTable.token, token))
    .limit(1);

  return payment ?? null;
}

export async function findPaymentByReturnIdentifiers(
  data: { token?: string; buyOrder?: string; sessionId?: string },
) {
  const conditions = [];
  if (data.token) conditions.push(eq(onlinePaymentsTable.token, data.token));
  if (data.buyOrder) conditions.push(eq(onlinePaymentsTable.buyOrder, data.buyOrder));
  if (data.sessionId) conditions.push(eq(onlinePaymentsTable.sessionId, data.sessionId));
  if (conditions.length === 0) return null;

  const [payment] = await db
    .select()
    .from(onlinePaymentsTable)
    .where(and(...conditions))
    .limit(1);

  return payment ?? null;
}

export async function findPaymentForUpdateById(tx: DbTransaction, paymentId: number) {
  const [payment] = await tx
    .select()
    .from(onlinePaymentsTable)
    .where(eq(onlinePaymentsTable.id, paymentId))
    .limit(1)
    .for("update");

  return payment ?? null;
}

export async function findLatestPaymentForOrder(tx: DbTransaction, orderId: number) {
  const [payment] = await tx
    .select({ id: onlinePaymentsTable.id, status: onlinePaymentsTable.status })
    .from(onlinePaymentsTable)
    .where(eq(onlinePaymentsTable.orderId, orderId))
    .orderBy(desc(onlinePaymentsTable.createdAt), desc(onlinePaymentsTable.id))
    .limit(1);

  return payment ?? null;
}

export async function findOtherAuthorizedPayment(
  tx: DbTransaction,
  orderId: number,
  excludedPaymentId: number,
) {
  const [payment] = await tx
    .select({ id: onlinePaymentsTable.id })
    .from(onlinePaymentsTable)
    .where(and(
      eq(onlinePaymentsTable.orderId, orderId),
      eq(onlinePaymentsTable.status, "AUTHORIZED"),
      ne(onlinePaymentsTable.id, excludedPaymentId),
    ))
    .limit(1);

  return payment ?? null;
}

export async function findPaymentsNeedingReconciliation(
  processingStaleBefore: Date,
  clientId?: number,
) {
  const conditions = [
    isNotNull(onlinePaymentsTable.token),
    sql`(
      (
        ${onlinePaymentsTable.status} = 'CREATED'
        and ${onlineOrdersTable.status} = 'PENDING_PAYMENT'
        and ${onlineOrdersTable.reservationExpiresAt} <= now() + interval '2 minutes'
      )
      or (
        ${onlinePaymentsTable.status} = 'PROCESSING'
        and ${onlinePaymentsTable.updatedAt} <= ${processingStaleBefore}
      )
    )`,
  ];

  if (clientId !== undefined) conditions.push(eq(onlineOrdersTable.clientId, clientId));

  const rows = await db
    .select({
      paymentId: onlinePaymentsTable.id,
      paymentStatus: onlinePaymentsTable.status,
      paymentCreatedAt: onlinePaymentsTable.createdAt,
      paymentUpdatedAt: onlinePaymentsTable.updatedAt,
      token: onlinePaymentsTable.token,
      orderId: onlineOrdersTable.id,
      orderStatus: onlineOrdersTable.status,
      clientId: onlineOrdersTable.clientId,
      orderCreatedAt: onlineOrdersTable.createdAt,
      reservationExpiresAt: onlineOrdersTable.reservationExpiresAt,
    })
    .from(onlinePaymentsTable)
    .innerJoin(onlineOrdersTable, eq(onlinePaymentsTable.orderId, onlineOrdersTable.id))
    .where(and(...conditions))
    .orderBy(asc(onlinePaymentsTable.updatedAt), asc(onlinePaymentsTable.id))
    .limit(50);

  return rows;
}

export async function claimPaymentReconciliationLease(
  orderId: number,
  paymentId: number,
  observedUpdatedAt: Date,
) {
  return db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, orderId);
    if (!order || order.status !== "PENDING_PAYMENT") return null;

    const payment = await findPaymentForUpdateById(tx, paymentId);
    if (
      !payment
      || payment.orderId !== order.id
      || payment.status !== "PROCESSING"
      || payment.updatedAt.getTime() !== observedUpdatedAt.getTime()
    ) return null;

    const latestPayment = await findLatestPaymentForOrder(tx, order.id);
    if (latestPayment?.id !== payment.id) return null;

    const [leasedPayment] = await tx
      .update(onlinePaymentsTable)
      .set({ updatedAt: new Date() })
      .where(and(
        eq(onlinePaymentsTable.id, paymentId),
        eq(onlinePaymentsTable.status, "PROCESSING"),
        eq(onlinePaymentsTable.updatedAt, observedUpdatedAt),
      ))
      .returning({ id: onlinePaymentsTable.id });

    return leasedPayment ?? null;
  });
}

export async function deferSupersededProcessingPayment(
  orderId: number,
  paymentId: number,
  observedUpdatedAt: Date,
  expire: boolean,
) {
  return db.transaction(async (tx) => {
    const order = await findOrderForUpdate(tx, orderId);
    if (!order || order.status === "PENDING_PAYMENT") return null;

    const payment = await findPaymentForUpdateById(tx, paymentId);
    if (
      !payment
      || payment.orderId !== order.id
      || payment.status !== "PROCESSING"
      || payment.updatedAt.getTime() !== observedUpdatedAt.getTime()
    ) return null;

    const [updatedPayment] = await tx
      .update(onlinePaymentsTable)
      .set({
        status: expire ? "EXPIRED" : "PROCESSING",
        updatedAt: new Date(),
      })
      .where(and(
        eq(onlinePaymentsTable.id, payment.id),
        eq(onlinePaymentsTable.status, "PROCESSING"),
        eq(onlinePaymentsTable.updatedAt, observedUpdatedAt),
      ))
      .returning({ id: onlinePaymentsTable.id });

    return updatedPayment ?? null;
  });
}

export async function markPaymentProcessing(tx: DbTransaction, paymentId: number) {
  const [payment] = await tx
    .update(onlinePaymentsTable)
    .set({ status: "PROCESSING", updatedAt: new Date() })
    .where(and(
      eq(onlinePaymentsTable.id, paymentId),
      eq(onlinePaymentsTable.status, "CREATED"),
    ))
    .returning({ id: onlinePaymentsTable.id });

  return payment ?? null;
}

export async function cancelOtherOpenPayments(
  tx: DbTransaction,
  orderId: number,
  authorizedPaymentId: number,
) {
  return tx
    .update(onlinePaymentsTable)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(
      eq(onlinePaymentsTable.orderId, orderId),
      ne(onlinePaymentsTable.id, authorizedPaymentId),
      eq(onlinePaymentsTable.status, "CREATED"),
    ));
}

export async function updatePaymentResult(
  tx: DbTransaction,
  paymentId: number,
  data: {
    status: "PROCESSING" | "AUTHORIZED" | "FAILED" | "CANCELLED" | "EXPIRED";
    authorizationCode?: string | null;
    paymentTypeCode?: string | null;
    responseCode?: number | null;
    transactionDate?: Date | null;
  },
) {
  const [payment] = await tx
    .update(onlinePaymentsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(onlinePaymentsTable.id, paymentId))
    .returning({ id: onlinePaymentsTable.id, status: onlinePaymentsTable.status });

  return payment ?? null;
}

export async function updateOrderStatus(
  tx: DbTransaction,
  orderId: number,
  status: OnlineOrderStatus,
  allowedCurrentStatuses?: OnlineOrderStatus[],
) {
  const now = new Date();
  const [order] = await tx
    .update(onlineOrdersTable)
    .set({
      status,
      paidAt: status === "PAID" ? now : undefined,
      clientArchivedAt: ["PAID", "PAYMENT_REVIEW"].includes(status) ? null : undefined,
      updatedAt: now,
    })
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      allowedCurrentStatuses?.length
        ? inArray(onlineOrdersTable.status, allowedCurrentStatuses)
        : sql`true`,
    ))
    .returning({ id: onlineOrdersTable.id, status: onlineOrdersTable.status });

  return order ?? null;
}

async function attachOrderData<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return [];
  const orderIds = orders.map((order) => order.id);

  const [items, payments] = await Promise.all([
    db
      .select({
        orderId: onlineOrderItemsTable.orderId,
        productId: onlineOrderItemsTable.productId,
        productName: productsTable.name,
        quantity: onlineOrderItemsTable.quantity,
        unitPrice: onlineOrderItemsTable.unitPrice,
        subtotal: onlineOrderItemsTable.subtotal,
      })
      .from(onlineOrderItemsTable)
      .innerJoin(productsTable, eq(onlineOrderItemsTable.productId, productsTable.id))
      .where(inArray(onlineOrderItemsTable.orderId, orderIds)),
    db
      .select(paymentColumns)
      .from(onlinePaymentsTable)
      .where(inArray(onlinePaymentsTable.orderId, orderIds))
      .orderBy(desc(onlinePaymentsTable.createdAt), desc(onlinePaymentsTable.id)),
  ]);

  const itemsByOrder = new Map<number, typeof items>();
  const paymentByOrder = new Map<number, (typeof payments)[number]>();

  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push(item);
    itemsByOrder.set(item.orderId, current);
  }

  for (const payment of payments) {
    const current = paymentByOrder.get(payment.orderId);
    if (!current || (payment.status === "AUTHORIZED" && current.status !== "AUTHORIZED")) {
      paymentByOrder.set(payment.orderId, payment);
    }
  }

  return orders.map((order) => {
    const payment = paymentByOrder.get(order.id) ?? null;
    const { token, redirectUrl, ...clientPayment } = payment || {
      token: null,
      redirectUrl: null,
    };
    const orderStatus = String((order as { status?: string }).status || "");
    const reservationExpiresAt = (order as { reservationExpiresAt?: Date }).reservationExpiresAt;
    const terminalOrder = ["PAYMENT_FAILED", "CANCELLED", "EXPIRED"].includes(orderStatus);
    const terminalPayment = !payment || ["FAILED", "CANCELLED", "EXPIRED"].includes(payment.status);

    return {
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
      payment: payment ? clientPayment : null,
      canContinuePayment: orderStatus === "PENDING_PAYMENT"
        && payment?.status === "CREATED"
        && Boolean(token && redirectUrl)
        && Boolean(reservationExpiresAt && reservationExpiresAt.getTime() > Date.now()),
      canRetryPayment: terminalOrder,
      canArchive: terminalOrder && terminalPayment,
    };
  });
}

export async function findOrdersByClient(clientId: number) {
  const orders = await db
    .select(orderColumns)
    .from(onlineOrdersTable)
    .innerJoin(usersTable, eq(onlineOrdersTable.clientId, usersTable.id))
    .where(and(
      eq(onlineOrdersTable.clientId, clientId),
      isNull(onlineOrdersTable.clientArchivedAt),
    ))
    .orderBy(desc(onlineOrdersTable.createdAt), desc(onlineOrdersTable.id));

  return attachOrderData(orders);
}

export async function findOrderByIdAndClient(orderId: number, clientId: number) {
  const orders = await db
    .select(orderColumns)
    .from(onlineOrdersTable)
    .innerJoin(usersTable, eq(onlineOrdersTable.clientId, usersTable.id))
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      eq(onlineOrdersTable.clientId, clientId),
    ))
    .limit(1);

  const [order] = await attachOrderData(orders);
  return order ?? null;
}

export async function archiveOrderForClient(
  tx: DbTransaction,
  orderId: number,
  clientId: number,
) {
  const [order] = await tx
    .update(onlineOrdersTable)
    .set({ clientArchivedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      eq(onlineOrdersTable.clientId, clientId),
      inArray(onlineOrdersTable.status, ["PAYMENT_FAILED", "CANCELLED", "EXPIRED"]),
      isNull(onlineOrdersTable.clientArchivedAt),
    ))
    .returning({ id: onlineOrdersTable.id });

  return order ?? null;
}
