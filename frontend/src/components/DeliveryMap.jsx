import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, MapPin, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  buildDeliveryRouteUrl,
  normalizeDeliveryCoordinates,
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

function MapMarker({ coordinates }) {
  const map = useMap();

  useEffect(() => {
    map.setView([coordinates.latitude, coordinates.longitude], map.getZoom(), {
      animate: false,
    });
  }, [coordinates.latitude, coordinates.longitude, map]);

  return (
    <Marker
      position={[coordinates.latitude, coordinates.longitude]}
      icon={deliveryMarkerIcon}
    />
  );
}

function MapCanvas({ coordinates }) {
  const [tilesLoading, setTilesLoading] = useState(true);

  return (
    <div className="relative h-64 overflow-hidden rounded-[5px] border border-slate-200 bg-slate-100">
      <MapContainer
        className="h-full w-full"
        center={[coordinates.latitude, coordinates.longitude]}
        zoom={16}
        scrollWheelZoom={false}
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
        <MapMarker coordinates={coordinates} />
      </MapContainer>
      {tilesLoading && (
        <div
          className="absolute inset-0 z-1000 grid place-items-center bg-white/90 text-center"
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
  showRouteButton = true,
}) {
  const coordinates = useMemo(
    () => normalizeDeliveryCoordinates(latitude, longitude),
    [latitude, longitude],
  );
  const destinationAddress = [address, commune].filter(Boolean).join(", ");
  const fallbackRouteUrl = buildDeliveryRouteUrl({ latitude, longitude, address, commune });

  return (
    <section className="grid gap-3">
      {coordinates ? (
        <MapCanvas
          key={`${coordinates.latitude}-${coordinates.longitude}`}
          coordinates={coordinates}
        />
      ) : (
        <div className="grid min-h-28 place-items-center rounded-[5px] border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
          <span className="grid justify-items-center gap-2 text-xs leading-5 text-slate-500">
            <MapPin size={24} />
            No se registró un punto exacto. La dirección escrita seguirá siendo válida.
          </span>
        </div>
      )}

      {showRouteButton && destinationAddress && (
        <span className="text-xs text-slate-500">Destino: {destinationAddress}</span>
      )}

      {showRouteButton && fallbackRouteUrl && (
        <a
          className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-[5px] border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100"
          href={fallbackRouteUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={17} /> Abrir en Google Maps
        </a>
      )}
    </section>
  );
}
