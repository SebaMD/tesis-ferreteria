import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, MapPin, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  buildDeliveryRouteUrl,
  normalizeDeliveryCoordinates,
  requestCurrentLocation,
} from "../helpers/delivery.js";

const deliveryMarkerIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function prepareRouteWindow(routeWindow) {
  if (!routeWindow || routeWindow.closed) return;

  try {
    routeWindow.document.open();
    routeWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Preparando ruta...</title>
          <style>
            :root { color-scheme: light; font-family: Arial, sans-serif; }
            * { box-sizing: border-box; }
            body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: #f5f6f7; color: #10151f; }
            main { width: min(100%, 420px); display: grid; justify-items: center; gap: 14px; border: 1px solid #d9dee5; border-top: 4px solid #d97706; border-radius: 8px; background: white; padding: 34px 24px; text-align: center; box-shadow: 0 14px 38px rgba(16, 21, 31, 0.1); }
            svg { width: 52px; height: 52px; color: #d97706; animation: truck-move 1s ease-in-out infinite alternate; }
            h1 { margin: 0; font-size: 22px; }
            p { margin: 0; max-width: 330px; color: #5f6b7a; font-size: 14px; line-height: 1.55; }
            @keyframes truck-move { from { transform: translateX(-8px); } to { transform: translateX(8px); } }
            @media (prefers-reduced-motion: reduce) { svg { animation: none; } }
          </style>
        </head>
        <body>
          <main role="status" aria-live="polite">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-2"/><path d="M14 17h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
            </svg>
            <h1>Preparando ruta...</h1>
            <p>Estamos obteniendo tu ubicación y preparando las indicaciones.</p>
          </main>
        </body>
      </html>`);
    routeWindow.document.close();
  } catch {
    // La ruta de respaldo seguirá abriéndose aunque el navegador limite el documento temporal.
  }
}

function openPreparedRoute(routeWindow, routeUrl) {
  if (!routeWindow) {
    window.location.assign(routeUrl);
    return;
  }
  if (routeWindow.closed) return;

  try {
    routeWindow.opener = null;
    routeWindow.location.replace(routeUrl);
  } catch {
    try {
      routeWindow.close();
    } catch {
      // La pestaña puede haber sido cerrada por el usuario.
    }
    window.location.assign(routeUrl);
  }
}

function MapInteraction({ coordinates, interactive, onLocationChange }) {
  const map = useMap();

  useEffect(() => {
    map.setView([coordinates.latitude, coordinates.longitude], map.getZoom(), {
      animate: false,
    });
  }, [coordinates.latitude, coordinates.longitude, map]);

  useMapEvents({
    click(event) {
      if (!interactive || !onLocationChange) return;
      const nextCoordinates = normalizeDeliveryCoordinates(event.latlng.lat, event.latlng.lng);
      if (nextCoordinates) onLocationChange(nextCoordinates);
    },
  });

  return (
    <Marker
      position={[coordinates.latitude, coordinates.longitude]}
      icon={deliveryMarkerIcon}
    />
  );
}

function MapCanvas({ coordinates, interactive, onLocationChange }) {
  const [tilesLoading, setTilesLoading] = useState(true);

  return (
    <div className="relative h-64 overflow-hidden rounded-[5px] border border-slate-200 bg-slate-100">
      <MapContainer
        className="h-full w-full"
        center={[coordinates.latitude, coordinates.longitude]}
        zoom={16}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            loading: () => setTilesLoading(true),
            load: () => setTilesLoading(false),
            tileerror: () => setTilesLoading(false),
          }}
        />
        <MapInteraction
          coordinates={coordinates}
          interactive={interactive}
          onLocationChange={onLocationChange}
        />
      </MapContainer>
      {tilesLoading && (
        <div
          className="absolute inset-0 z-[1000] grid place-items-center bg-white/90 text-center"
          role="status"
          aria-live="polite"
        >
          <span className="grid justify-items-center gap-2 text-sm font-bold text-ink-950">
            <Truck className="animate-bounce text-rust-600" size={34} />
            Cargando mapa...
          </span>
        </div>
      )}
    </div>
  );
}

export default function DeliveryMap({
  latitude,
  longitude,
  address,
  commune,
  interactive = false,
  onLocationChange,
  showRouteButton = true,
}) {
  const [openingRoute, setOpeningRoute] = useState(false);
  const openingRouteRef = useRef(false);
  const coordinates = useMemo(
    () => normalizeDeliveryCoordinates(latitude, longitude),
    [latitude, longitude],
  );
  const destinationAddress = [address, commune].filter(Boolean).join(", ");
  const fallbackRouteUrl = buildDeliveryRouteUrl({ latitude, longitude, address, commune });

  const handleOpenRoute = async () => {
    if (!fallbackRouteUrl || openingRouteRef.current) return;

    openingRouteRef.current = true;
    setOpeningRoute(true);
    const routeWindow = window.open("", "_blank");
    prepareRouteWindow(routeWindow);

    try {
      const currentLocation = await requestCurrentLocation();
      const routeUrl = buildDeliveryRouteUrl({
        latitude,
        longitude,
        address,
        commune,
        originLatitude: currentLocation.latitude,
        originLongitude: currentLocation.longitude,
      });

      openPreparedRoute(routeWindow, routeUrl || fallbackRouteUrl);
    } catch {
      openPreparedRoute(routeWindow, fallbackRouteUrl);
    } finally {
      openingRouteRef.current = false;
      setOpeningRoute(false);
    }
  };

  return (
    <section className="grid gap-3">
      {coordinates ? (
        <MapCanvas
          key={`${coordinates.latitude}-${coordinates.longitude}`}
          coordinates={coordinates}
          interactive={interactive}
          onLocationChange={onLocationChange}
        />
      ) : (
        <div className="grid min-h-28 place-items-center rounded-[5px] border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
          <span className="grid justify-items-center gap-2 text-xs leading-5 text-slate-500">
            <MapPin size={24} />
            No se registró un punto exacto. La dirección escrita seguirá siendo válida.
          </span>
        </div>
      )}

      {coordinates && interactive && (
        <p className="m-0 text-xs leading-5 text-slate-500">
          Toca el mapa para ajustar el marcador al punto exacto de entrega.
        </p>
      )}

      {showRouteButton && fallbackRouteUrl && (
        <button
          className="w-fit border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
          type="button"
          onClick={handleOpenRoute}
          disabled={openingRoute}
        >
          {openingRoute ? <Truck className="animate-bounce" size={17} /> : <ExternalLink size={17} />}
          {openingRoute ? "Preparando ruta..." : "Abrir ruta"}
        </button>
      )}

      {!coordinates && destinationAddress && showRouteButton && (
        <span className="text-xs text-slate-500">Destino: {destinationAddress}</span>
      )}
    </section>
  );
}
