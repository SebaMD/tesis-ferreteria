import { buildOrderCommercialModel, isReceiptEligibleStatus } from "../onlineOrders/orderCommercialModel.js";
import { INTERNAL_DOCUMENT_NOTICE } from "../../utils/internalDocuments.js";
import type { findOnlineAdministrativeOrder } from "./orderLogistics.repository.js";

export function buildAdministrativeOrderModel(source: NonNullable<Awaited<ReturnType<typeof findOnlineAdministrativeOrder>>>) {
  const paymentConfirmed = isReceiptEligibleStatus(source.status) && source.paidAt !== null
    && source.authorizedPayment !== null && Number(source.authorizedPayment.amount) === Number(source.total);
  const commercial = buildOrderCommercialModel({
    ...source,
    buyerType: source.customerType,
    buyerName: source.customerName,
    buyerEmail: source.customerEmail,
  });
  // Lista explícita: nunca serializar la fila de pedido/pago completa.
  return {
    folio: commercial.folio,
    createdAt: source.createdAt,
    status: source.status,
    paidAt: source.paidAt,
    paymentConfirmed,
    buyer: { ...commercial.buyer, rut: source.customerRut, phone: source.customerPhone },
    items: commercial.items,
    baseSubtotal: commercial.baseSubtotal,
    totalDiscount: commercial.totalDiscount,
    total: commercial.total,
    delivery: commercial.delivery,
    authorizedPayment: paymentConfirmed && source.authorizedPayment ? {
      provider: "WEBPAY_PLUS",
      buyOrder: source.authorizedPayment.buyOrder,
      authorizationCode: source.authorizedPayment.authorizationCode,
      amount: source.authorizedPayment.amount,
      transactionDate: source.authorizedPayment.transactionDate,
    } : null,
    notice: INTERNAL_DOCUMENT_NOTICE,
  };
}
