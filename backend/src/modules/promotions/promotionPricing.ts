import type { PromotionType } from "../../db/schema/index.js";

export type ApplicablePromotion = {
  id: number;
  name: string;
  type: PromotionType;
  percentage: number | null;
  startsAt: Date;
  endsAt: Date | null;
};

export type PromotionPricing = {
  baseUnitPrice: number;
  promotionalUnitPrice: number | null;
  baseSubtotal: number;
  discountAmount: number;
  finalSubtotal: number;
  paidUnits: number;
  freeUnits: number;
  promotion: ApplicablePromotion | null;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} debe ser un entero positivo`);
  }
}

export function calculatePromotionPricing(
  baseUnitPrice: number,
  quantity: number,
  promotion: ApplicablePromotion | null,
): PromotionPricing {
  assertPositiveInteger(baseUnitPrice, "El precio base");
  assertPositiveInteger(quantity, "La cantidad");

  const baseSubtotal = baseUnitPrice * quantity;
  if (!promotion) {
    return {
      baseUnitPrice,
      promotionalUnitPrice: null,
      baseSubtotal,
      discountAmount: 0,
      finalSubtotal: baseSubtotal,
      paidUnits: quantity,
      freeUnits: 0,
      promotion: null,
    };
  }

  if (promotion.type === "PERCENTAGE_DISCOUNT") {
    const percentage = Number(promotion.percentage);
    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 99) {
      throw new Error("La promocion porcentual no tiene un porcentaje valido");
    }
    const promotionalUnitPrice = Math.floor(
      (baseUnitPrice * (100 - percentage) + 50) / 100,
    );
    const finalSubtotal = promotionalUnitPrice * quantity;
    return {
      baseUnitPrice,
      promotionalUnitPrice,
      baseSubtotal,
      discountAmount: baseSubtotal - finalSubtotal,
      finalSubtotal,
      paidUnits: quantity,
      freeUnits: 0,
      promotion,
    };
  }

  const freeUnits = Math.floor(quantity / 2);
  const paidUnits = quantity - freeUnits;
  const finalSubtotal = paidUnits * baseUnitPrice;
  return {
    baseUnitPrice,
    promotionalUnitPrice: null,
    baseSubtotal,
    discountAmount: freeUnits * baseUnitPrice,
    finalSubtotal,
    paidUnits,
    freeUnits,
    promotion,
  };
}

export function presentPublicPromotion(promotion: ApplicablePromotion | null) {
  if (!promotion) return null;
  return {
    type: promotion.type,
    label: promotion.type === "BUY_2_PAY_1" ? "2x1" : `-${promotion.percentage}%`,
    percentage: promotion.type === "PERCENTAGE_DISCOUNT" ? promotion.percentage : null,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
  };
}
