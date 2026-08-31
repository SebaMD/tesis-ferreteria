import {
  Camera,
  CheckCircle2,
  Eye,
  PackageCheck,
  Play,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import DeliveryEvidenceForm from "../components/DeliveryEvidenceForm.jsx";
import DeliveryMap from "../components/DeliveryMap.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp, formatDate } from "../helpers/formatters.js";
import { isValidRut, normalizeRut } from "../helpers/rut.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
} from "../helpers/onlineOrders.js";
import {
  badgeClass,
  dateCellClass,
  numericCellClass,
  pageClass,
  pageHeaderClass,
  tableActionButtonClass,
  tablePanelClass,
  tableScrollClass,
} from "../helpers/uiClasses.js";
import useAuth from "../hooks/useAuth.js";
import {
  completeOrderDeliveryRequest,
  finishOrderPreparationRequest,
  getDeliveryProofRequest,
  getOperationalOrderByIdRequest,
  getOperationalOrdersRequest,
  startOrderDeliveryRequest,
  startOrderPreparationRequest,
} from "../services/orderLogistics.service.js";

const STATUS_FILTERS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "PAID", label: "Pendiente de preparación" },
  { value: "PREPARING", label: "En preparación" },
  { value: "READY_FOR_PICKUP", label: "Listo para retirar" },
  { value: "READY_FOR_DELIVERY", label: "Listo para reparto" },
  { value: "OUT_FOR_DELIVERY", label: "En reparto" },
  { value: "DELIVERED", label: "Entregado" },
];

const DATE_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const ACTIONS = {
  START_PREPARATION: {
    label: "Comenzar preparación",
    confirmLabel: "Comenzar preparación",
    title: "Comenzar preparación",
    description: "La tarea quedará asignada a tu usuario hasta que termines la preparación.",
    icon: Play,
    request: startOrderPreparationRequest,
  },
  FINISH_PREPARATION: {
    label: "Marcar como preparado",
    confirmLabel: "Marcar preparado",
    title: "Confirmar preparación",
    description: "La tarea avanzará automáticamente según su modalidad de entrega.",
    icon: PackageCheck,
    request: finishOrderPreparationRequest,
  },
  START_DELIVERY: {
    label: "Iniciar reparto",
    confirmLabel: "Iniciar reparto",
    title: "Confirmar inicio de reparto",
    description: "El reparto quedará asignado a tu usuario hasta que confirmes la entrega.",
    icon: Truck,
    request: startOrderDeliveryRequest,
  },
  COMPLETE_DELIVERY: {
    label: "Confirmar entrega",
    confirmLabel: "Confirmar entrega",
    title: "Registrar entrega",
    description: "Registra a la persona que recibió físicamente esta compra.",
    icon: CheckCircle2,
    request: completeOrderDeliveryRequest,
  },
};

const ACTION_ORDER = [
  "START_PREPARATION",
  "FINISH_PREPARATION",
  "START_DELIVERY",
  "COMPLETE_DELIVERY",
];

const EMPTY_EVIDENCE = {
  receiverName: "",
  receiverRut: "",
  proofImage: null,
};

function orderKey(order) {
  return `${order.origin}-${order.id}`;
}

function formatFolio(order) {
  if (order?.folio) return order.folio;
  if (order?.origin === "POS") return `V-${String(order.id || 0).padStart(6, "0")}`;
  return formatOnlineOrderFolio(order?.id);
}

function originData(origin) {
  return origin === "POS"
    ? { label: "Venta en caja", tone: "neutral" }
    : { label: "Online", tone: "info" };
}

function actorName(actor) {
  if (!actor) return "Sin registrar";
  if (typeof actor === "string") return actor;
  return actor.name || `${actor.names || ""} ${actor.surnames || ""}`.trim() || "Sin registrar";
}

function customerName(order) {
  return order.customerName
    || `${order.clientNames || ""} ${order.clientSurnames || ""}`.trim()
    || order.deliveryRecipientName
    || "Sin registrar";
}

function productSummary(order) {
  const productCount = Number(order.productCount ?? order.items?.length ?? 0);
  const totalUnits = Number(
    order.totalUnits
    ?? order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    ?? 0,
  );
  return `${productCount} ${productCount === 1 ? "producto" : "productos"} · ${totalUnits} ${totalUnits === 1 ? "unidad" : "unidades"}`;
}

function allowedAction(order) {
  if (!order) return null;
  const allowed = Array.isArray(order.allowedActions)
    ? order.allowedActions
    : Object.entries(order.allowedActions || {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([action]) => action);
  return ACTION_ORDER.find((action) => allowed.includes(action)) || null;
}

function currentResponsible(order) {
  if (order.status === "PREPARING") return actorName(order.preparationStartedByUser);
  if (order.status === "OUT_FOR_DELIVERY") return actorName(order.deliveryStartedByUser);
  if (order.status === "DELIVERED") return actorName(order.deliveredByUser);
  return "Sin asignar";
}

function emptyMessage({ scope, status, search }) {
  if (scope === "MINE") return "No tienes tareas asignadas actualmente.";
  if (search) return "No se encontraron pedidos con esos filtros.";
  if (status === "PAID") return "No hay pedidos pendientes de preparación.";
  if (status !== "ALL") return "No se encontraron pedidos con ese estado.";
  return "No hay pedidos ni repartos operacionales.";
}

function DetailField({ label, children }) {
  return (
    <div className="rounded-[5px] bg-slate-50 p-3">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 ml-0 text-sm font-semibold text-ink-950">{children || "Sin registrar"}</dd>
    </div>
  );
}

export default function OnlineOrdersManagementPage() {
  const { user } = useAuth();
  const canManage = user?.role === "WAREHOUSE";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [scope, setScope] = useState("ALL");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [processingAction, setProcessingAction] = useState(false);
  const [evidence, setEvidence] = useState(EMPTY_EVIDENCE);
  const [proofUrl, setProofUrl] = useState("");
  const [proofLoading, setProofLoading] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
  }, [proofUrl]);

  const loadOrders = useCallback(async (notifyError = true) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    try {
      const data = await getOperationalOrdersRequest({
        status,
        search: debouncedSearch || undefined,
        scope: canManage ? scope : "ALL",
      });
      if (requestSequence.current === sequence) setOrders(data);
    } catch (error) {
      if (notifyError && requestSequence.current === sequence) {
        toast.error(getApiError(error, "No se pudieron cargar los pedidos y repartos"));
      }
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [canManage, debouncedSearch, scope, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
  }, [loadOrders]);

  const openOrder = async (order) => {
    setDetailLoading(true);
    setProofUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    try {
      setSelectedOrder(await getOperationalOrderByIdRequest(order.origin, order.id));
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cargar el detalle"));
      await loadOrders(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    if (processingAction) return;
    setConfirmationAction(null);
    setEvidence(EMPTY_EVIDENCE);
    setSelectedOrder(null);
    setProofUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const beginConfirmation = (action) => {
    if (action === "COMPLETE_DELIVERY") setEvidence(EMPTY_EVIDENCE);
    setConfirmationAction(action);
  };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;
    try {
      setSelectedOrder(await getOperationalOrderByIdRequest(
        selectedOrder.origin,
        selectedOrder.id,
      ));
    } catch {
      setSelectedOrder(null);
    }
  };

  const runAction = async () => {
    const config = ACTIONS[confirmationAction];
    if (!config || !selectedOrder || processingAction) return;
    let actionEvidence = evidence;

    if (confirmationAction === "COMPLETE_DELIVERY") {
      const receiverName = evidence.receiverName.trim().replace(/\s+/g, " ");
      const receiverRut = normalizeRut(evidence.receiverRut);
      if (receiverName.length < 3 || receiverName.length > 240) {
        toast.warning("El nombre de quien recibió debe tener entre 3 y 240 caracteres");
        return;
      }
      if (!isValidRut(receiverRut)) {
        toast.warning("Ingresa un RUT válido para quien recibió la compra");
        return;
      }
      if (selectedOrder.deliveryType === "DELIVERY" && !evidence.proofImage) {
        toast.warning("Agrega una fotografía comprobante de la entrega");
        return;
      }
      actionEvidence = { ...evidence, receiverName, receiverRut };
    }

    setProcessingAction(true);
    try {
      const updatedOrder = confirmationAction === "COMPLETE_DELIVERY"
        ? await config.request(selectedOrder.origin, selectedOrder.id, actionEvidence)
        : await config.request(selectedOrder.origin, selectedOrder.id);
      setSelectedOrder(updatedOrder);
      setConfirmationAction(null);
      setEvidence(EMPTY_EVIDENCE);
      toast.success(confirmationAction === "COMPLETE_DELIVERY"
        ? "Entrega confirmada exitosamente"
        : "Estado logístico actualizado");
      await loadOrders(false);
    } catch (error) {
      toast.error(getApiError(error, "El estado cambió. Se actualizará la información."));
      setConfirmationAction(null);
      await refreshSelectedOrder();
      await loadOrders(false);
    } finally {
      setProcessingAction(false);
    }
  };

  const loadProof = async () => {
    if (!selectedOrder || proofLoading) return;
    setProofLoading(true);
    try {
      const blob = await getDeliveryProofRequest(selectedOrder.origin, selectedOrder.id);
      const nextUrl = URL.createObjectURL(blob);
      setProofUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cargar el comprobante de entrega"));
    } finally {
      setProofLoading(false);
    }
  };

  const orderAction = canManage ? allowedAction(selectedOrder) : null;
  const actionConfig = orderAction ? ACTIONS[orderAction] : null;
  const confirmationConfig = confirmationAction ? ACTIONS[confirmationAction] : null;
  const selectedStatus = selectedOrder ? getOnlineOrderStatus(selectedOrder.status) : null;
  const selectedDelivery = selectedOrder
    ? getOnlineOrderDeliveryType(selectedOrder.deliveryType)
    : null;
  const selectedOrigin = selectedOrder ? originData(selectedOrder.origin) : null;

  let modalFooter = null;
  if (selectedOrder && confirmationConfig) {
    modalFooter = (
      <>
        <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => setConfirmationAction(null)} disabled={processingAction}>Volver</button>
        <button type="button" onClick={runAction} disabled={processingAction}>
          {processingAction && <RefreshCw className="animate-spin" size={17} />}
          {processingAction ? "Procesando..." : confirmationConfig.confirmLabel}
        </button>
      </>
    );
  } else if (selectedOrder && actionConfig) {
    const Icon = actionConfig.icon;
    modalFooter = <button type="button" onClick={() => beginConfirmation(orderAction)}><Icon size={17} />{actionConfig.label}</button>;
  } else if (selectedOrder) {
    modalFooter = <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={closeModal}>Cerrar</button>;
  }

  const noResultsMessage = emptyMessage({ scope, status, search: debouncedSearch });

  return (
    <main className={pageClass}>
      <LoadingOverlay active={loading || detailLoading} />
      <header className={pageHeaderClass}>
        <div>
          <h1>Pedidos y repartos</h1>
          <p>{canManage ? "Prepara y entrega compras online o ventas en caja con despacho." : "Consulta el avance de las tareas logísticas."}</p>
        </div>
        {canManage && (
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 max-[720px]:ml-0 max-[720px]:w-full max-[720px]:[&>button]:flex-1">
            {[
              { value: "ALL", label: "Todos los pedidos" },
              { value: "MINE", label: "Mis tareas" },
            ].map((option) => (
              <button
                className={`min-h-11 rounded-sm border-2 px-4 py-2 text-sm font-extrabold ${scope === option.value ? "border-rust-700 bg-rust-500 text-white hover:bg-rust-600" : "border-ink-950 bg-white text-ink-950 hover:border-rust-500 hover:bg-rust-50"}`}
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                aria-pressed={scope === option.value}
              >{option.label}</button>
            ))}
          </div>
        )}
      </header>

      <section className="flex items-center gap-3 max-[620px]:flex-col max-[620px]:items-stretch">
        <div className="relative min-w-64 flex-1 max-[620px]:min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={17} />
          <input className="w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por folio o cliente" />
        </div>
        <select className="w-60 shrink-0 max-[620px]:w-full" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {(search || status !== "ALL") && (
          <button
            className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("ALL");
            }}
          >Limpiar filtros</button>
        )}
      </section>

      <section className={tablePanelClass}>
        <div className="flex min-h-14 items-center border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
          Mostrando {orders.length} {orders.length === 1 ? "registro" : "registros"}
        </div>
        <div className={tableScrollClass}>
          <table>
            <thead><tr><th>Folio</th><th>Origen</th><th>Fecha</th><th>Cliente / destinatario</th><th>Entrega</th><th>Estado</th><th>Responsable</th><th>Productos</th><th>Total</th><th>Acción</th></tr></thead>
            <tbody>
              {orders.map((order) => {
                const orderStatus = getOnlineOrderStatus(order.status);
                const delivery = getOnlineOrderDeliveryType(order.deliveryType);
                const origin = originData(order.origin);
                return (
                  <tr key={orderKey(order)}>
                    <td className="font-mono font-bold text-ink-950">{formatFolio(order)}</td>
                    <td><span className={badgeClass(origin.tone)}>{origin.label}</span></td>
                    <td className={dateCellClass}>{formatDate(order.paidAt || order.createdAt, DATE_OPTIONS)}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-ink-950">{customerName(order)}</strong>
                        {order.customerType === "GUEST" && <span className={badgeClass("neutral")}>Invitado</span>}
                      </span>
                      {order.customerEmail && <span className="text-xs text-slate-500">{order.customerEmail}</span>}
                    </td>
                    <td>{delivery.shortLabel}</td>
                    <td><span className={badgeClass(orderStatus.tone)}>{orderStatus.label}</span></td>
                    <td className="text-sm text-slate-600">{currentResponsible(order)}</td>
                    <td>{productSummary(order)}</td>
                    <td className={numericCellClass}>{formatClp(order.total)}</td>
                    <td><button className={tableActionButtonClass} type="button" onClick={() => openOrder(order)}><Eye size={15} /> Ver detalle</button></td>
                  </tr>
                );
              })}
              {!loading && orders.length === 0 && <tr><td className="h-24 text-center text-slate-500" colSpan="10">{noResultsMessage}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AppModal
        open={Boolean(selectedOrder)}
        onClose={closeModal}
        size="xlarge"
        title={confirmationConfig?.title || (selectedOrder ? `${formatFolio(selectedOrder)} · ${selectedOrigin.label}` : "Detalle")}
        description={confirmationConfig?.description || "Detalle operacional, destino y trazabilidad de la tarea."}
        footer={modalFooter}
      >
        {selectedOrder && confirmationConfig ? (
          confirmationAction === "COMPLETE_DELIVERY" ? (
            <DeliveryEvidenceForm
              deliveryType={selectedOrder.deliveryType}
              value={evidence}
              onChange={setEvidence}
              disabled={processingAction}
            />
          ) : (
            <div className="grid min-h-35 place-items-center text-center">
              <div className="grid max-w-120 justify-items-center gap-3">
                <confirmationConfig.icon className="text-rust-600" size={42} />
                <strong className="text-lg text-ink-950">¿Confirmas esta acción para {formatFolio(selectedOrder)}?</strong>
                <p className="m-0 text-sm leading-6 text-slate-500">{confirmationConfig.description}</p>
              </div>
            </div>
          )
        ) : selectedOrder ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={badgeClass(selectedOrigin.tone)}>{selectedOrigin.label}</span>
                <span className={badgeClass(selectedStatus.tone)}>{selectedStatus.label}</span>
                <span className="text-sm font-bold text-slate-600">{selectedDelivery.label}</span>
              </div>
              <strong className="font-mono text-xl text-ink-950">{formatClp(selectedOrder.total)}</strong>
            </div>

            <dl className="grid grid-cols-3 gap-3 max-[800px]:grid-cols-2 max-[520px]:grid-cols-1">
              <DetailField label={selectedOrder.origin === "ONLINE" ? "Comprador" : "Destinatario"}>
                {customerName(selectedOrder)}{selectedOrder.customerType === "GUEST" ? " · Invitado" : ""}
              </DetailField>
              {selectedOrder.customerType !== "GUEST" && (
                <DetailField label="RUT">{selectedOrder.customerRut || selectedOrder.clientRut}</DetailField>
              )}
              <DetailField label="Fecha de compra">{formatDate(selectedOrder.paidAt || selectedOrder.createdAt, DATE_OPTIONS)}</DetailField>
              {selectedOrder.deliveryType === "DELIVERY" ? (
                <>
                  <DetailField label="Destinatario">{selectedOrder.deliveryRecipientName || customerName(selectedOrder)}</DetailField>
                  <DetailField label="Teléfono">{selectedOrder.deliveryPhone}</DetailField>
                  <DetailField label="Comuna">{selectedOrder.deliveryCommune}</DetailField>
                  <DetailField label="Dirección">{selectedOrder.deliveryAddress}</DetailField>
                  <DetailField label="Referencia">{selectedOrder.deliveryReference || "Sin referencia"}</DetailField>
                </>
              ) : <DetailField label="Modalidad">Retiro en tienda</DetailField>}
            </dl>

            {selectedOrder.deliveryType === "DELIVERY" && (
              <DeliveryMap
                latitude={selectedOrder.deliveryLatitude}
                longitude={selectedOrder.deliveryLongitude}
                address={selectedOrder.deliveryAddress}
                commune={selectedOrder.deliveryCommune}
              />
            )}

            <section className="overflow-hidden rounded-md border border-slate-200">
              <div className={tableScrollClass}>
                <table>
                  <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
                  <tbody>{(selectedOrder.items || []).map((item) => <tr key={`${item.productId}-${item.productName}`}><td className="font-semibold text-ink-950">{item.productName}</td><td>{item.quantity}</td><td className={numericCellClass}>{formatClp(item.unitPrice)}</td><td className={numericCellClass}>{formatClp(item.subtotal)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="m-0 text-sm font-bold text-ink-950">Trazabilidad logística</h3>
              <dl className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <DetailField label="Preparación iniciada">{selectedOrder.preparationStartedAt ? `${formatDate(selectedOrder.preparationStartedAt, DATE_OPTIONS)} · ${actorName(selectedOrder.preparationStartedByUser)}` : "Pendiente"}</DetailField>
                <DetailField label="Preparación terminada">{selectedOrder.preparedAt ? `${formatDate(selectedOrder.preparedAt, DATE_OPTIONS)} · ${actorName(selectedOrder.preparedByUser)}` : "Pendiente"}</DetailField>
                {selectedOrder.deliveryType === "DELIVERY" && <DetailField label="Reparto iniciado">{selectedOrder.deliveryStartedAt ? `${formatDate(selectedOrder.deliveryStartedAt, DATE_OPTIONS)} · ${actorName(selectedOrder.deliveryStartedByUser)}` : "Pendiente"}</DetailField>}
                <DetailField label="Entrega confirmada">{selectedOrder.deliveredAt ? `${formatDate(selectedOrder.deliveredAt, DATE_OPTIONS)} · ${actorName(selectedOrder.deliveredByUser)}` : "Pendiente"}</DetailField>
              </dl>
            </section>

            {selectedOrder.deliveredAt && (selectedOrder.receivedByName || selectedOrder.receivedByRut || selectedOrder.proofAvailable) && (
              <section className="grid gap-3 rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-sm font-bold text-ink-950">Comprobante de entrega</h3>
                    <p className="mt-1 mb-0 text-xs text-slate-500">Información histórica registrada al confirmar la entrega.</p>
                  </div>
                  {selectedOrder.proofAvailable && !proofUrl && (
                    <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={loadProof} disabled={proofLoading}>
                      {proofLoading ? <RefreshCw className="animate-spin" size={17} /> : <Camera size={17} />}
                      {proofLoading ? "Cargando..." : "Ver fotografía"}
                    </button>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  <DetailField label="Recibido por">{selectedOrder.receivedByName}</DetailField>
                  <DetailField label="RUT de quien recibe">{selectedOrder.receivedByRut}</DetailField>
                </dl>
                {proofUrl && <img className="max-h-110 w-full rounded-md border border-slate-200 bg-slate-50 object-contain" src={proofUrl} alt="Fotografía comprobante de la entrega" />}
              </section>
            )}
          </div>
        ) : null}
      </AppModal>
    </main>
  );
}
