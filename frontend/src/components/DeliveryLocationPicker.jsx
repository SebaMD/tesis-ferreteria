import { LocateFixed, MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import { requestCurrentLocation } from "../helpers/delivery.js";
import DeliveryMap from "./DeliveryMap.jsx";

export default function DeliveryLocationPicker({
  latitude,
  longitude,
  address,
  commune,
  onChange,
  disabled = false,
}) {
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  const handleUseCurrentLocation = async () => {
    if (locating || disabled) return;

    setLocating(true);
    setLocationMessage("");
    try {
      const location = await requestCurrentLocation();
      onChange({ latitude: location.latitude, longitude: location.longitude });
      setLocationMessage("Punto registrado. Puedes ajustarlo tocando el mapa.");
    } catch (error) {
      setLocationMessage(error.message);
    } finally {
      setLocating(false);
    }
  };

  const hasCoordinates = latitude !== null
    && latitude !== undefined
    && longitude !== null
    && longitude !== undefined;

  return (
    <section className="col-span-2 grid gap-3 rounded-[5px] border border-slate-200 bg-slate-50 p-4 max-[620px]:col-span-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <strong className="flex items-center gap-2 text-sm text-ink-950">
            <MapPin size={17} /> Punto de entrega <span className="font-normal text-slate-400">(opcional)</span>
          </strong>
          <span className="text-xs leading-5 text-slate-500">
            Úsalo si estás físicamente en el lugar de entrega. La dirección escrita continúa siendo obligatoria.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleUseCurrentLocation} disabled={locating || disabled}>
            <LocateFixed className={locating ? "animate-pulse" : ""} size={17} />
            {locating ? "Ubicando..." : hasCoordinates ? "Actualizar ubicación" : "Usar mi ubicación"}
          </button>
          {hasCoordinates && (
            <button
              className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
              type="button"
              onClick={() => {
                onChange({ latitude: null, longitude: null });
                setLocationMessage("Punto eliminado. Se utilizará solamente la dirección escrita.");
              }}
              disabled={disabled}
            >
              <Trash2 size={16} /> Quitar punto
            </button>
          )}
        </div>
      </div>

      {locationMessage && (
        <p className="m-0 rounded-[5px] bg-white px-3 py-2 text-xs leading-5 text-slate-600" role="status">
          {locationMessage}
        </p>
      )}

      {hasCoordinates && (
        <DeliveryMap
          latitude={latitude}
          longitude={longitude}
          address={address}
          commune={commune}
          interactive
          onLocationChange={(coordinates) => {
            onChange(coordinates);
            setLocationMessage("Punto de entrega ajustado.");
          }}
          showRouteButton={false}
        />
      )}
    </section>
  );
}
