import {
  CheckCircle2,
  Eye,
  PackageCheck,
  Play,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp, formatDate } from "../helpers/formatters.js";
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
  getOperationalOrderByIdRequest,
  getOperationalOrdersRequest,
  startOrderDeliveryRequest,
  startOrderPreparationRequest,
} from "../services/orderLogistics.service.js";

const STATUS_FILTERS = [
  { value: "ALL", label: "Todos los operacionales" },
  { value: "PAID", label: "Pendientes de preparación" },
  { value: "PREPARING", label: "En preparación" },
  { value: "READY_FOR_PICKUP", label: "Listos para retiro" },
  { value: "READY_FOR_DELIVERY", label: "Listos para despacho" },
  { value: "OUT_FOR_DELIVERY", label: "En reparto" },
  { value: "DELIVERED", label: "Entregados" },
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
    description: "El pedido quedará asignado al bodeguero que inicia esta acción.",
    icon: Play,
    request: startOrderPreparationRequest,
  },
  FINISH_PREPARATION: {
    label: "Marcar como preparado",
    confirmLabel: "Marcar preparado",
    title: "Confirmar preparación",
    description: "El pedido avanzará automáticamente según su modalidad de entrega.",
    icon: PackageCheck,
    request: finishOrderPreparationRequest,
  },
  START_DELIVERY: {
    label: "Iniciar reparto",
    confirmLabel: "Iniciar reparto",
    title: "Confirmar inicio de reparto",
    description: "Quedarás registrado como responsable de iniciar el despacho.",
    icon: Truck,
    request: startOrderDeliveryRequest,
  },
  COMPLETE_DELIVERY: {
    label: "Confirmar entrega",
    confirmLabel: "Confirmar entrega",
    title: "Confirmar entrega",
    description: "Esta acción dejará el pedido como entregado al cliente o destinatario.",
    icon: CheckCircle2,
    request: completeOrderDeliveryRequest,
  },
};

function availableAction(order) {
  if (!order) return null;
  if (order.status === "PAID") return "START_PREPARATION";
  if (order.status === "PREPARING") return "FINISH_PREPARATION";
  if (order.status === "READY_FOR_DELIVERY") return "START_DELIVERY";
  if (order.status === "READY_FOR_PICKUP" || order.status === "OUT_FOR_DELIVERY") {
    return "COMPLETE_DELIVERY";
  }
  return null;
}

function actorName(actor) {
  return actor ? `${actor.names} ${actor.surnames}`.trim() : "Sin registrar";
}

function productSummary(order) {
  const productCount = Number(order.productCount || 0);
  const totalUnits = Number(order.totalUnits || 0);
  return `${productCount} ${productCount === 1 ? "producto" : "productos"} · ${totalUnits} ${totalUnits === 1 ? "unidad" : "unidades"}`;
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
  const [status, setStatus] = useState("ALL");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [processingAction, setProcessingAction] = useState(false);

  const loadOrders = useCallback(async (notifyError = true) => {
    setLoading(true);
    try {
      setOrders(await getOperationalOrdersRequest({
        status,
        search: appliedSearch || undefined,
      }));
    } catch (error) {
      if (notifyError) toast.error(getApiError(error, "No se pudieron cargar los pedidos online"));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
  }, [loadOrders]);

  const openOrder = async (orderId) => {
    setDetailLoading(true);
    try {
      setSelectedOrder(await getOperationalOrderByIdRequest(orderId));
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cargar el detalle del pedido"));
      await loadOrders(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    if (processingAction) return;
    setConfirmationAction(null);
    setSelectedOrder(null);
  };

  const runAction = async () => {
    const config = ACTIONS[confirmationAction];
    if (!config || !selectedOrder || processingAction) return;

    setProcessingAction(true);
    try {
      const updatedOrder = await config.request(selectedOrder.id);
      setSelectedOrder(updatedOrder);
      setConfirmationAction(null);
      toast.success(config.title === "Confirmar entrega" ? "Entrega confirmada" : "Estado del pedido actualizado");
      await loadOrders(false);
    } catch (error) {
      toast.error(getApiError(error, "El estado del pedido cambió. Se actualizará la información."));
      setConfirmationAction(null);
      try {
        setSelectedOrder(await getOperationalOrderByIdRequest(selectedOrder.id));
      } catch {
        setSelectedOrder(null);
      }
      await loadOrders(false);
    } finally {
      setProcessingAction(false);
    }
  };

  const orderAction = availableAction(selectedOrder);
  const actionConfig = orderAction ? ACTIONS[orderAction] : null;
  const confirmationConfig = confirmationAction ? ACTIONS[confirmationAction] : null;
  const selectedStatus = selectedOrder ? getOnlineOrderStatus(selectedOrder.status) : null;
  const selectedDelivery = selectedOrder
    ? getOnlineOrderDeliveryType(selectedOrder.deliveryType)
    : null;

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
  } else if (selectedOrder && canManage && actionConfig) {
    const Icon = actionConfig.icon;
    modalFooter = <button type="button" onClick={() => setConfirmationAction(orderAction)}><Icon size={17} />{actionConfig.label}</button>;
  } else if (selectedOrder) {
    modalFooter = <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={closeModal}>Cerrar</button>;
  }

  return (
    <main className={pageClass}>
      <LoadingOverlay active={loading || detailLoading} />
      <header className={pageHeaderClass}>
        <div>
          <h1>Pedidos online</h1>
          <p>{canManage ? "Prepara y entrega los pedidos pagados." : "Consulta el avance logístico de los pedidos pagados."}</p>
        </div>
      </header>

      <form
        className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search.trim());
        }}
      >
        <div className="relative min-w-60 flex-1 max-[620px]:min-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={17} />
          <input className="w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por folio o cliente" />
        </div>
        <select className="min-w-55 max-[620px]:w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="submit"><Search size={17} /> Buscar</button>
        {(appliedSearch || status !== "ALL") && (
          <button
            className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
            type="button"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setStatus("ALL");
            }}
          >Limpiar filtros</button>
        )}
      </form>

      <section className={tablePanelClass}>
        <div className="flex min-h-14 items-center border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
          Mostrando {orders.length} pedidos operacionales
        </div>
        <div className={tableScrollClass}>
          <table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th>Productos</th><th>Total</th><th>Acción</th></tr></thead>
            <tbody>
              {orders.map((order) => {
                const orderStatus = getOnlineOrderStatus(order.status);
                const delivery = getOnlineOrderDeliveryType(order.deliveryType);
                return (
                  <tr key={order.id}>
                    <td className="font-mono font-bold text-ink-950">{formatOnlineOrderFolio(order.id)}</td>
                    <td className={dateCellClass}>{formatDate(order.paidAt || order.createdAt, DATE_OPTIONS)}</td>
                    <td><strong className="block text-ink-950">{order.clientNames} {order.clientSurnames}</strong><span className="text-xs text-slate-500">{order.clientRut}</span></td>
                    <td>{delivery.shortLabel}</td>
                    <td><span className={badgeClass(orderStatus.tone)}>{orderStatus.label}</span></td>
                    <td>{productSummary(order)}</td>
                    <td className={numericCellClass}>{formatClp(order.total)}</td>
                    <td><button className={tableActionButtonClass} type="button" onClick={() => openOrder(order.id)}><Eye size={15} /> Ver detalle</button></td>
                  </tr>
                );
              })}
              {!loading && orders.length === 0 && <tr><td className="h-24 text-center text-slate-500" colSpan="8">No hay pedidos para los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AppModal
        open={Boolean(selectedOrder)}
        onClose={closeModal}
        size="xlarge"
        title={confirmationConfig?.title || (selectedOrder ? `Pedido ${formatOnlineOrderFolio(selectedOrder.id)}` : "Pedido")}
        description={confirmationConfig?.description || "Detalle operacional y trazabilidad del pedido online."}
        footer={modalFooter}
      >
        {selectedOrder && confirmationConfig ? (
          <div className="grid min-h-35 place-items-center text-center">
            <div className="grid max-w-120 justify-items-center gap-3">
              <confirmationConfig.icon className="text-rust-600" size={42} />
              <strong className="text-lg text-ink-950">¿Confirmas esta acción para {formatOnlineOrderFolio(selectedOrder.id)}?</strong>
              <p className="m-0 text-sm leading-6 text-slate-500">{confirmationConfig.description}</p>
            </div>
          </div>
        ) : selectedOrder ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2"><span className={badgeClass(selectedStatus.tone)}>{selectedStatus.label}</span><span className="text-sm font-bold text-slate-600">{selectedDelivery.label}</span></div>
              <strong className="font-mono text-xl text-ink-950">{formatClp(selectedOrder.total)}</strong>
            </div>

            <dl className="grid grid-cols-3 gap-3 max-[800px]:grid-cols-2 max-[520px]:grid-cols-1">
              <DetailField label="Cliente">{selectedOrder.clientNames} {selectedOrder.clientSurnames}</DetailField>
              <DetailField label="RUT">{selectedOrder.clientRut}</DetailField>
              <DetailField label="Fecha de compra">{formatDate(selectedOrder.paidAt || selectedOrder.createdAt, DATE_OPTIONS)}</DetailField>
              {selectedOrder.deliveryType === "DELIVERY" ? (
                <>
                  <DetailField label="Destinatario">{selectedOrder.deliveryRecipientName}</DetailField>
                  <DetailField label="Teléfono">{selectedOrder.deliveryPhone}</DetailField>
                  <DetailField label="Comuna">{selectedOrder.deliveryCommune}</DetailField>
                  <DetailField label="Dirección">{selectedOrder.deliveryAddress}</DetailField>
                  <DetailField label="Referencia">{selectedOrder.deliveryReference || "Sin referencia"}</DetailField>
                </>
              ) : <DetailField label="Modalidad">Retiro en tienda</DetailField>}
            </dl>

            <section className="overflow-hidden rounded-md border border-slate-200">
              <div className={tableScrollClass}>
                <table>
                  <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
                  <tbody>{selectedOrder.items.map((item) => <tr key={item.productId}><td className="font-semibold text-ink-950">{item.productName}</td><td>{item.quantity}</td><td className={numericCellClass}>{formatClp(item.unitPrice)}</td><td className={numericCellClass}>{formatClp(item.subtotal)}</td></tr>)}</tbody>
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
          </div>
        ) : null}
      </AppModal>
    </main>
  );
}
