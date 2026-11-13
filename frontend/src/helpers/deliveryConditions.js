// FYF references, not a payable tariff. Never reuse the legacy automatic threshold.
export function deliveryConditionsInformation(information) {
  return {
    coverage: information?.coverage || "Región del Biobío",
    radius: information?.noChargeRadiusKmReference ?? 5,
    outboundKm: information?.minimumOutboundKmPriceReference ?? 1000,
    conditionalThreshold: information?.conditionalFreeThresholdReference ?? 500000,
  };
}
