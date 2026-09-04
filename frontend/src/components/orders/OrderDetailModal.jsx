import { MapPin, Store, Truck } from "lucide-react";
import AppModal from "../AppModal.jsx";
import DeliveryMap from "../DeliveryMap.jsx";
import { formatClp, formatDate } from "../../helpers/formatters.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
} from "../../helpers/onlineOrders.js";
import { badgeClass } from "../../helpers/uiClasses.js";
import OrderProgressTimeline from "./OrderProgressTimeline.jsx";
import OrderProductImage from "./OrderProductImage.jsx";
import DeliveryProofViewer from "./DeliveryProofViewer.jsx";

function hasCoordinates(order) {
  if (
    order?.deliveryLatitude === null
    || order?.deliveryLatitude === undefined
    || order?.deliveryLatitude === ""
    || order?.deliveryLongitude === null
    || order?.deliveryLongitude === undefined
    || order?.deliveryLongitude === ""
  ) return false;

  return Number.isFinite(Number(order?.deliveryLatitude))
    && Number.isFinite(Number(order?.deliveryLongitude));
}

export default function OrderDetailModal({ order, onClose, requestDeliveryProof }) {
  if (!order) return null;
  const status = getOnlineOrderStatus(order.status);
  const delivery = getOnlineOrderDeliveryType(order.deliveryType);

  return (
    <AppModal
      open={Boolean(order)}
      title={`${order.status === "DELIVERED" ? "Detalle de la compra" : "Seguimiento del pedido"} ${formatOnlineOrderFolio(order.id)}`}
      description={delivery.label}
      onClose={onClose}
      size="large"
    >
      <div className="grid gap-6">
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-500">Estado actual</span>
              <h3 className="mt-1 mb-0 text-xl text-ink-950">{status.label}</h3>
            </div>
            <span className={badgeClass(status.tone)}>{status.label}</span>
          </div>
          <OrderProgressTimeline order={order} />
        </section>

        <section className="grid gap-3">
          <h3 className="m-0 text-base text-ink-950">Entrega</h3>
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            {order.deliveryType === "DELIVERY" ? <Truck className="shrink-0 text-rust-600" size={20} /> : <Store className="shrink-0 text-rust-600" size={20} />}
            <div className="grid gap-1">
              <strong className="text-ink-950">{delivery.label}</strong>
              {order.deliveryType === "DELIVERY" ? (
                <>
                  <span className="flex items-start gap-1 text-slate-600"><MapPin className="mt-0.5 shrink-0" size={14} /> {order.deliveryAddress}, {order.deliveryCommune}</span>
                  {order.deliveryRecipientName && <span className="text-xs text-slate-500">Recibe: {order.deliveryRecipientName} · {order.deliveryPhone}</span>}
                  {order.deliveryReference && <span className="text-xs text-slate-500">Referencia: {order.deliveryReference}</span>}
                </>
              ) : <span className="text-xs text-slate-500">Retiro directamente en FERRETERIA FYF.</span>}
            </div>
          </div>
          {order.deliveryType === "DELIVERY" && hasCoordinates(order) && (
            <DeliveryMap
              latitude={order.deliveryLatitude}
              longitude={order.deliveryLongitude}
              address={order.deliveryAddress}
              commune={order.deliveryCommune}
              showRouteButton={false}
            />
          )}
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-base text-ink-950">Productos</h3>
            <span className="text-xs text-slate-500">{order.items?.length || 0} {(order.items?.length || 0) === 1 ? "producto" : "productos"}</span>
          </div>
          <div className="grid gap-2">
            {(order.items || []).map((item) => (
              <article className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 p-3 max-[430px]:grid-cols-[48px_minmax(0,1fr)]" key={`${order.id}-${item.productId}`}>
                <div className="grid size-14 place-items-center overflow-hidden rounded-md bg-slate-100 max-[430px]:size-12">
                  <OrderProductImage src={item.productImageUrl} alt={item.productName} fallbackSize={20} />
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-ink-950">{item.productName}</strong>
                  <span className="text-xs text-slate-500">{item.quantity} × {formatClp(item.unitPrice)}</span>
                </div>
                <strong className="font-mono text-sm text-ink-950 max-[430px]:col-span-2 max-[430px]:justify-self-end">{formatClp(item.subtotal)}</strong>
              </article>
            ))}
          </div>
        </section>

        <DeliveryProofViewer
          key={order.id}
          order={order}
          requestProof={requestDeliveryProof}
        />

        <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
          <div>
            <span className="block text-xs font-bold text-slate-500">Fecha de compra</span>
            <span className="mt-1 block text-sm text-ink-950">{formatDate(order.paidAt || order.createdAt, { dateStyle: "long", timeStyle: "short" })}</span>
          </div>
          <div className="text-right">
            <span className="block text-xs font-bold text-slate-500">Total</span>
            <strong className="font-mono text-2xl text-ink-950">{formatClp(order.total)}</strong>
          </div>
        </footer>
      </div>
    </AppModal>
  );
}
