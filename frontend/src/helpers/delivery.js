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
    if (window.isSecureContext === false) {
      reject(new Error("Para usar tu ubicación, abre el sitio mediante una conexión HTTPS. Puedes continuar ingresando la dirección manualmente."));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error("La geolocalización no está disponible en este navegador. Puedes continuar usando la dirección escrita."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = normalizeDeliveryCoordinates(
          position?.coords?.latitude,
          position?.coords?.longitude,
        );

        if (!coordinates) {
          reject(new Error("El navegador no entregó coordenadas válidas. Puedes continuar usando la dirección escrita."));
          return;
        }

        resolve({
          ...coordinates,
          accuracy: Number(position.coords.accuracy || 0),
        });
      },
      (error) => {
        const messages = {
          1: "El permiso de ubicación está denegado. Revisa los permisos del sitio en tu navegador.",
          2: "Tu ubicación no está disponible en este momento. Comprueba la señal o inténtalo nuevamente.",
          3: "Se agotó el tiempo de espera para obtener tu ubicación. Puedes volver a intentarlo.",
        };
        reject(new Error(`${messages[error.code] || "Ocurrió un error al obtener tu ubicación."} Puedes continuar usando la dirección escrita.`));
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
