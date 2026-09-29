export const RECEIPT_ELIGIBLE_ORDER_STATUSES = new Set([
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

const CLP_FORMATTER = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

const UNIT_PLURALS: Record<string, string> = {
  unidad: "unidades",
  litro: "litros",
  metro: "metros",
  caja: "cajas",
  paquete: "paquetes",
  saco: "sacos",
  bolsa: "bolsas",
  par: "pares",
  rollo: "rollos",
  plancha: "planchas",
  barra: "barras",
  tubo: "tubos",
  pieza: "piezas",
  docena: "docenas",
  set: "sets",
  "galón": "galones",
  tarro: "tarros",
};

export function formatOrderMoney(value: string | number) {
  return CLP_FORMATTER.format(Number(value));
}

export function formatOrderDate(value: Date) {
  return DATE_FORMATTER.format(value);
}

export function formatOrderQuantity(quantity: number, unitMeasure: string | null) {
  const unit = String(unitMeasure || "unidad").trim();
  const normalized = unit.toLocaleLowerCase("es");
  const singular = Object.entries(UNIT_PLURALS)
    .find(([, plural]) => plural === normalized)?.[0] ?? normalized;
  const presentedUnit = quantity === 1 ? singular : (UNIT_PLURALS[singular] ?? unit);
  return `${quantity} ${presentedUnit}`;
}

type CommercialOrderItemSource = {
  productId: number;
  productName: string;
  unitMeasure?: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  discountAmount?: string;
  promotionId?: number | null;
  promotionTypeSnapshot?: "PERCENTAGE_DISCOUNT" | "BUY_2_PAY_1" | null;
  promotionNameSnapshot?: string | null;
  promotionValueSnapshot?: number | null;
};

export type CommercialOrderSource = {
  id: number;
  status: string;
  buyerType: "CLIENT" | "GUEST";
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  total: string;
  deliveryType: "PICKUP" | "DELIVERY" | string;
  deliveryRecipientName?: string | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryCommune?: string | null;
  deliveryReference?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
  items: CommercialOrderItemSource[];
};

export type OrderCommercialModel = {
  orderId: number;
  folio: string;
  status: string;
  purchaseDate: Date;
  buyer: {
    type: "CLIENT" | "GUEST";
    name: string;
    email: string;
  };
  items: Array<{
    productId: number;
    productName: string;
    unitMeasure: string | null;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    discountAmount: string;
    promotionId: number | null;
    promotionType: "PERCENTAGE_DISCOUNT" | "BUY_2_PAY_1" | null;
    promotionName: string | null;
    promotionValue: number | null;
    freeUnits: number;
  }>;
  baseSubtotal: string;
  totalDiscount: string;
  total: string;
  delivery: {
    type: "PICKUP" | "DELIVERY";
    label: "Retiro en tienda" | "Despacho a domicilio";
    recipientName: string | null;
    phone: string | null;
    address: string | null;
    commune: string | null;
    reference: string | null;
  };
};

export function formatPromotionSummary(item: OrderCommercialModel["items"][number]) {
  if (!item.promotionType) return null;
  if (item.promotionType === "BUY_2_PAY_1") {
    return `${item.promotionName || "Promocion 2x1"} · 2x1 · ${item.freeUnits} ${item.freeUnits === 1 ? "unidad" : "unidades"} sin costo`;
  }
  return `${item.promotionName || "Promocion"} · ${item.promotionValue}% de descuento`;
}

export function isReceiptEligibleStatus(status: string) {
  return RECEIPT_ELIGIBLE_ORDER_STATUSES.has(status);
}

export function buildOrderCommercialModel(order: CommercialOrderSource): OrderCommercialModel {
  const deliveryType = order.deliveryType === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const items = order.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    unitMeasure: item.unitMeasure?.trim() || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    discountAmount: item.discountAmount ?? "0.00",
    promotionId: item.promotionId ?? null,
    promotionType: item.promotionTypeSnapshot ?? null,
    promotionName: item.promotionNameSnapshot ?? null,
    promotionValue: item.promotionValueSnapshot ?? null,
    freeUnits: item.promotionTypeSnapshot === "BUY_2_PAY_1" ? Math.floor(item.quantity / 2) : 0,
  }));
  const baseSubtotal = items.reduce(
    (total, item) => total + Number(item.unitPrice) * item.quantity,
    0,
  );
  const totalDiscount = items.reduce((total, item) => total + Number(item.discountAmount), 0);

  return {
    orderId: order.id,
    folio: `P-${String(order.id).padStart(6, "0")}`,
    status: order.status,
    purchaseDate: order.paidAt ?? order.createdAt,
    buyer: {
      type: order.buyerType,
      name: order.buyerName?.trim() || (order.buyerType === "GUEST" ? "Invitado" : "Cliente registrado"),
      email: order.buyerEmail?.trim() || "",
    },
    items,
    baseSubtotal: baseSubtotal.toFixed(2),
    totalDiscount: totalDiscount.toFixed(2),
    total: order.total,
    delivery: {
      type: deliveryType,
      label: deliveryType === "DELIVERY" ? "Despacho a domicilio" : "Retiro en tienda",
      recipientName: deliveryType === "DELIVERY" ? order.deliveryRecipientName?.trim() || null : null,
      phone: deliveryType === "DELIVERY" ? order.deliveryPhone?.trim() || null : null,
      address: deliveryType === "DELIVERY" ? order.deliveryAddress?.trim() || null : null,
      commune: deliveryType === "DELIVERY" ? order.deliveryCommune?.trim() || null : null,
      reference: deliveryType === "DELIVERY" ? order.deliveryReference?.trim() || null : null,
    },
  };
}
