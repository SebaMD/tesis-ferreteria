export const DELIVERY_COMMUNE = "Santa Juana";

export function canonicalizeDeliveryCommune(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.localeCompare(DELIVERY_COMMUNE, "es", { sensitivity: "base" }) === 0
    ? DELIVERY_COMMUNE
    : null;
}

export function normalizeOptionalCoordinate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : Number.NaN;
}

export function validateCoordinatePair(latitude: unknown, longitude: unknown) {
  const normalizedLatitude = normalizeOptionalCoordinate(latitude);
  const normalizedLongitude = normalizeOptionalCoordinate(longitude);

  if (normalizedLatitude === null && normalizedLongitude === null) {
    return { success: true as const, latitude: null, longitude: null };
  }

  if (
    normalizedLatitude === null
    || normalizedLongitude === null
    || Number.isNaN(normalizedLatitude)
    || Number.isNaN(normalizedLongitude)
    || normalizedLatitude < -90
    || normalizedLatitude > 90
    || normalizedLongitude < -180
    || normalizedLongitude > 180
  ) {
    return {
      success: false as const,
      error: "Las coordenadas del punto de entrega no son validas",
    };
  }

  return {
    success: true as const,
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  };
}
