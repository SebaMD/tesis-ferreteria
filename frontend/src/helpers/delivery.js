export const DELIVERY_COMMUNE = "Santa Juana";

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 60_000,
};

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

export function requestCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador no permite obtener la ubicación actual."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = normalizeDeliveryCoordinates(
          position.coords.latitude,
          position.coords.longitude,
        );

        if (!coordinates) {
          reject(new Error("El navegador no entregó una ubicación válida."));
          return;
        }

        resolve({
          ...coordinates,
          accuracy: Number(position.coords.accuracy || 0),
        });
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "No autorizaste el acceso a tu ubicación. Puedes continuar usando la dirección escrita."
          : "No se pudo obtener tu ubicación. Puedes continuar usando la dirección escrita.";
        reject(new Error(message));
      },
      GEOLOCATION_OPTIONS,
    );
  });
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
  originLatitude,
  originLongitude,
}) {
  const destination = buildDeliveryDestination({ latitude, longitude, address, commune });
  if (!destination) return "";

  const origin = normalizeDeliveryCoordinates(originLatitude, originLongitude);
  const parameters = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });

  if (origin) parameters.set("origin", `${origin.latitude},${origin.longitude}`);

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
