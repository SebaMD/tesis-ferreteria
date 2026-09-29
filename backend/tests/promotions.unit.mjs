import assert from "node:assert/strict";
import { calculatePromotionPricing } from "../dist/modules/promotions/promotionPricing.js";
import { validatePromotion, validatePromotionStatus } from "../dist/modules/promotions/promotions.validation.js";

const startsAt = new Date("2026-10-01T03:00:00.000Z");
const percentagePromotion = {
  id: 1,
  name: "Octubre ferretero",
  type: "PERCENTAGE_DISCOUNT",
  percentage: 20,
  startsAt,
  endsAt: null,
};
const twoForOnePromotion = {
  id: 2,
  name: "Dia del tornillo",
  type: "BUY_2_PAY_1",
  percentage: null,
  startsAt,
  endsAt: null,
};

assert.deepEqual(calculatePromotionPricing(10000, 2, percentagePromotion), {
  baseUnitPrice: 10000,
  promotionalUnitPrice: 8000,
  baseSubtotal: 20000,
  discountAmount: 4000,
  finalSubtotal: 16000,
  paidUnits: 2,
  freeUnits: 0,
  promotion: percentagePromotion,
});
assert.equal(calculatePromotionPricing(101, 1, percentagePromotion).promotionalUnitPrice, 81);
assert.equal(calculatePromotionPricing(99, 3, { ...percentagePromotion, percentage: 33 }).finalSubtotal, 198);

for (const [quantity, paidUnits, freeUnits, total] of [
  [1, 1, 0, 5000],
  [2, 1, 1, 5000],
  [3, 2, 1, 10000],
  [4, 2, 2, 10000],
  [11, 6, 5, 30000],
]) {
  const result = calculatePromotionPricing(5000, quantity, twoForOnePromotion);
  assert.equal(result.paidUnits, paidUnits);
  assert.equal(result.freeUnits, freeUnits);
  assert.equal(result.finalSubtotal, total);
  assert.equal(result.discountAmount, freeUnits * 5000);
}

const validPayload = {
  name: "  Oferta   valida ",
  type: "PERCENTAGE_DISCOUNT",
  isActive: true,
  percentage: 20,
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-11-01T00:00:00.000Z",
  productIds: [1, 1, 2],
  categoryIds: [],
};
const valid = validatePromotion(validPayload);
assert.equal(valid.success, true);
assert.equal(valid.value.name, "Oferta valida");
assert.deepEqual(valid.value.productIds, [1, 2]);

for (const payload of [
  { ...validPayload, percentage: 0 },
  { ...validPayload, percentage: 100 },
  { ...validPayload, percentage: 10.5 },
  { ...validPayload, productIds: [], categoryIds: [] },
  { ...validPayload, endsAt: validPayload.startsAt },
  { ...validPayload, type: "BUY_2_PAY_1", percentage: 20 },
  { ...validPayload, unexpected: true },
]) {
  assert.equal(validatePromotion(payload).success, false, JSON.stringify(payload));
}

assert.equal(validatePromotion({
  ...validPayload,
  type: "BUY_2_PAY_1",
  percentage: null,
  productIds: [],
  categoryIds: [3],
  endsAt: null,
}).success, true);
assert.deepEqual(validatePromotionStatus({ isActive: false }), { success: true, value: false });
assert.equal(validatePromotionStatus({ isActive: true, extra: true }).success, false);

console.log("PASS promociones: validacion, porcentaje CLP y 2x1 por SKU");
