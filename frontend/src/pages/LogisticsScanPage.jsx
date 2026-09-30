import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  LoaderCircle,
  MapPinned,
  PackageCheck,
  Phone,
  ScanLine,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import DeliveryEvidenceForm from "../components/DeliveryEvidenceForm.jsx";
import { buildDeliveryRouteUrl } from "../helpers/delivery.js";
import { getOnlineOrderDeliveryType, getOnlineOrderStatus } from "../helpers/onlineOrders.js";
import {
  completeOrderDeliveryRequest,
  getLogisticsHandoffRequest,
  takeLogisticsHandoffRequest,
} from "../services/orderLogistics.service.js";

const EMPTY_EVIDENCE = { receiverName: "", receiverRut: "", proofImage: null };

function Detail({ label, children }) {
  if (!children) return null;
  return (
    <div className="grid gap-1 rounded-md border border-slate-200 bg-slate-50 p-3">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="break-words text-sm font-semibold text-ink-950">{children}</span>
    </div>
  );
}

export default function LogisticsScanPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token")?.trim() || "";
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState(EMPTY_EVIDENCE);

  const loadTask = useCallback(async () => {
    if (!token) {
      setError("El enlace no contiene un código QR logístico válido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setTask(await getLogisticsHandoffRequest(token));
    } catch (requestError) {
      setError(getApiError(requestError, "No se pudo localizar la tarea de reparto."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTask();
  }, [loadTask]);

  const actions = useMemo(() => new Set(task?.allowedActions || []), [task]);
  const status = getOnlineOrderStatus(task?.status);
  const modality = getOnlineOrderDeliveryType(task?.deliveryType);
  const hasPrivateDelivery = Boolean(task?.deliveryAddress || task?.deliveryPhone || task?.deliveryRecipientName);
  const routeUrl = hasPrivateDelivery ? buildDeliveryRouteUrl({
    latitude: task.deliveryLatitude,
    longitude: task.deliveryLongitude,
    address: task.deliveryAddress,
    commune: task.deliveryCommune,
  }) : "";

  const takeDelivery = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const assignedTask = await takeLogisticsHandoffRequest(token);
      setTask(assignedTask);
      toast.success("Reparto asignado. Ya puedes consultar los datos de entrega.");
    } catch (requestError) {
      toast.error(getApiError(requestError, "No se pudo tomar el reparto."));
      await loadTask();
    } finally {
      setProcessing(false);
    }
  };

  const completeDelivery = async () => {
    if (processing || !task) return;
    setProcessing(true);
    try {
      await completeOrderDeliveryRequest(task.origin, task.id, evidence);
      toast.success("Entrega confirmada exitosamente.");
      navigate("/online-orders-management", { replace: true });
    } catch (requestError) {
      toast.error(getApiError(requestError, "No se pudo confirmar la entrega."));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-5 py-6 max-[520px]:px-3 max-[520px]:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-rust-100 text-rust-700">
            <ScanLine size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-black text-ink-950 max-[430px]:text-lg">Traspaso de reparto</h1>
            <p className="m-0 text-sm text-slate-500">Escaneo seguro de etiqueta de preparación</p>
          </div>
        </div>
        <Link className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100" to="/online-orders-management">
          <ArrowLeft size={18} aria-hidden="true" />
          <span className="max-[430px]:sr-only">Volver</span>
        </Link>
      </div>

      {loading && (
        <section className="grid min-h-56 place-items-center rounded-lg border border-slate-200 bg-white p-6 text-slate-500">
          <span className="grid justify-items-center gap-3"><LoaderCircle className="animate-spin" size={30} />Validando código QR…</span>
        </section>
      )}

      {!loading && error && (
        <section className="grid gap-4 rounded-lg border border-critical-200 bg-critical-50 p-5 text-critical-700">
          <strong>No se pudo abrir esta tarea</strong>
          <span className="text-sm">{error}</span>
          <button type="button" className="justify-self-start" onClick={loadTask}>Intentar nuevamente</button>
        </section>
      )}

      {!loading && !error && task && (
        <>
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[430px]:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tarea localizada</span>
                <h2 className="mt-1 mb-0 font-mono text-2xl font-black text-ink-950">{task.folio}</h2>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-800">{status.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
              <Detail label="Modalidad"><span className="inline-flex items-center gap-2"><Truck size={17} />{modality.label}</span></Detail>
              <Detail label="Origen">{task.origin === "ONLINE" ? "Pedido online" : "Venta presencial"}</Detail>
              <Detail label="Productos"><span className="inline-flex items-center gap-2"><Boxes size={17} />{task.productCount} productos</span></Detail>
              <Detail label="Unidades">{task.totalUnits}</Detail>
            </div>
            {!hasPrivateDelivery && (
              <p className="m-0 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                El escaneo identifica la tarea, pero no revela dirección ni datos del comprador. Esa información se habilita únicamente al WAREHOUSE que toma el reparto.
              </p>
            )}
            {actions.has("START_DELIVERY") && (
              <button className="min-h-12 w-full bg-rust-600 text-white hover:bg-rust-700" type="button" onClick={takeDelivery} disabled={processing}>
                {processing ? <LoaderCircle className="animate-spin" size={19} /> : <Truck size={19} />}
                {processing ? "Asignando…" : "Tomar reparto"}
              </button>
            )}
            {!hasPrivateDelivery && !actions.has("START_DELIVERY") && task.status === "OUT_FOR_DELIVERY" && (
              <p className="m-0 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                Este reparto ya fue tomado por otro bodeguero. Los datos privados permanecen ocultos.
              </p>
            )}
          </section>

          {hasPrivateDelivery && (
            <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[430px]:p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-success-100 text-success-700"><PackageCheck size={21} /></span>
                <div>
                  <h2 className="m-0 text-lg font-black text-ink-950">Datos autorizados de entrega</h2>
                  <p className="m-0 text-sm text-slate-500">Visibles porque este reparto está asignado a tu cuenta.</p>
                </div>
              </div>
              <div className="grid gap-3">
                <Detail label="Receptor">{task.deliveryRecipientName}</Detail>
                <Detail label="Dirección">{[task.deliveryAddress, task.deliveryCommune].filter(Boolean).join(", ")}</Detail>
                <Detail label="Referencia">{task.deliveryReference}</Detail>
              </div>
              <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
                {task.deliveryPhone && (
                  <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-bold text-ink-700 no-underline hover:bg-slate-100" href={`tel:${task.deliveryPhone}`}>
                    <Phone size={19} />Llamar
                  </a>
                )}
                {routeUrl && (
                  <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-bold text-ink-700 no-underline hover:bg-slate-100" href={routeUrl} target="_blank" rel="noreferrer">
                    <MapPinned size={19} />Abrir en Google Maps
                  </a>
                )}
              </div>
            </section>
          )}

          {hasPrivateDelivery && actions.has("COMPLETE_DELIVERY") && (
            <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[430px]:p-4">
              <div>
                <h2 className="m-0 text-lg font-black text-ink-950">Confirmar entrega</h2>
                <p className="mt-1 mb-0 text-sm text-slate-500">Mantiene el mismo flujo de receptor y evidencia fotográfica.</p>
              </div>
              <DeliveryEvidenceForm deliveryType={task.deliveryType} value={evidence} onChange={setEvidence} disabled={processing} />
              <button className="min-h-12 w-full bg-success-700 text-white hover:bg-success-800" type="button" onClick={completeDelivery} disabled={processing}>
                {processing ? <LoaderCircle className="animate-spin" size={19} /> : <CheckCircle2 size={19} />}
                {processing ? "Confirmando…" : "Confirmar entrega"}
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
