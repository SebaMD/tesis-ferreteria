export const DELIVERY_COMMUNE = "Santa Juana";

export function normalizeDeliveryCoordinates(latitude, longitude) {
  const latitudeMissing = latitude === null
    || latitude === undefined
    || (typeof latitude === "string" && !latitude.trim());
  const longitudeMissing = longitude === null
    || longitude === undefined
    || (typeof longitude === "string" && !longitude.trim());

  if (latitudeMissing || longitudeMissing) return null;

  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  if (
    !Number.isFinite(normalizedLatitude)
    || !Number.isFinite(normalizedLongitude)
    || normalizedLatitude < -90
    || normalizedLatitude > 90
    || normalizedLongitude < -180
    || normalizedLongitude > 180
  ) {
    return null;
  }

  return {
    latitude: Number(normalizedLatitude.toFixed(6)),
    longitude: Number(normalizedLongitude.toFixed(6)),
  };
}

export function buildDeliveryDestination({ latitude, longitude, address, commune }) {
  const coordinates = normalizeDeliveryCoordinates(latitude, longitude);
  if (coordinates) return `${coordinates.latitude},${coordinates.longitude}`;

  return [String(address || "").trim(), String(commune || "").trim()]
    .filter(Boolean)
    .join(", ");
}

export function buildDeliveryRouteUrl({
  latitude,
  longitude,
  address,
  commune,
}) {
  const destination = buildDeliveryDestination({ latitude, longitude, address, commune });
  if (!destination) return "";

  const parameters = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
