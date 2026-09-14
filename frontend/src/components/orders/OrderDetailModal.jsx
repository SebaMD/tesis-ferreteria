import { ChevronDown, MapPin, Store, Truck } from "lucide-react";
import { useState } from "react";
import AppModal from "../AppModal.jsx";
import DeliveryMap from "../DeliveryMap.jsx";
import { formatClp, formatDate } from "../../helpers/formatters.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
} from "../../helpers/onlineOrders.js";
import OrderProgressTimeline, { OrderProgressCurrentIcon } from "./OrderProgressTimeline.jsx";
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

function AccordionContent({ id, open, children }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"}`}
      id={id}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-slate-200 p-4 max-[430px]:p-3">{children}</div>
      </div>
    </div>
  );
}

function AccordionChevron({ open }) {
  return (
    <ChevronDown
      className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      size={19}
      aria-hidden="true"
    />
  );
}

function StatusAccordion({ id, status, icon, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        className="grid min-h-14 w-full gap-3 rounded-none border-0 bg-white px-4 py-4 text-left text-ink-950 hover:bg-slate-50 focus-visible:relative focus-visible:z-1 max-[430px]:px-3"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-rust-200 bg-rust-50 text-rust-600 max-[430px]:size-11">
            {icon}
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Estado actual</span>
            <strong className="text-base text-ink-950">{status.label}</strong>
            <span className="text-xs leading-5 text-slate-600">{status.description}</span>
          </span>
        </span>
        <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-rust-600">
          {open ? "Ver menos" : "Ver más"}
          <AccordionChevron open={open} />
        </span>
      </button>
      <AccordionContent id={id} open={open}>{children}</AccordionContent>
    </section>
  );
}

function DetailAccordion({ id, title, summary, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        className="flex min-h-14 w-full items-center gap-3 rounded-none border-0 bg-white px-4 py-3 text-left text-ink-950 hover:bg-slate-50 focus-visible:relative focus-visible:z-1 max-[430px]:px-3"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <strong className="text-sm">{title}</strong>
          {summary}
        </span>
        <AccordionChevron open={open} />
      </button>
      <AccordionContent id={id} open={open}>{children}</AccordionContent>
    </section>
  );
}

export default function OrderDetailModal({ order, onClose, requestDeliveryProof }) {
  const [expandedSections, setExpandedSections] = useState({
    orderId: null,
    progress: false,
    products: false,
  });

  if (!order) return null;
  const status = getOnlineOrderStatus(order.status);
  const delivery = getOnlineOrderDeliveryType(order.deliveryType);
  const progressOpen = expandedSections.orderId === order.id && expandedSections.progress;
  const productsOpen = expandedSections.orderId === order.id && expandedSections.products;
  const productCount = order.items?.length || 0;

  const toggleSection = (section) => {
    setExpandedSections((current) => {
      const belongsToCurrentOrder = current.orderId === order.id;
      return {
        orderId: order.id,
        progress: section === "progress"
          ? !(belongsToCurrentOrder && current.progress)
          : belongsToCurrentOrder && current.progress,
        products: section === "products"
          ? !(belongsToCurrentOrder && current.products)
          : belongsToCurrentOrder && current.products,
      };
    });
  };

  const handleClose = () => {
    setExpandedSections({ orderId: null, progress: false, products: false });
    onClose();
  };

  return (
    <AppModal
      open={Boolean(order)}
      title={`${order.status === "DELIVERED" ? "Detalle de la compra" : "Seguimiento del pedido"} ${formatOnlineOrderFolio(order.id)}`}
      description={delivery.label}
      onClose={handleClose}
      size="large"
    >
      <div className="grid gap-6">
        <StatusAccordion
          id={`order-progress-${order.id}`}
          status={status}
          icon={<OrderProgressCurrentIcon order={order} />}
          open={progressOpen}
          onToggle={() => toggleSection("progress")}
        >
          <OrderProgressTimeline order={order} />
        </StatusAccordion>

        <section className="grid gap-3">
          <h3 className="m-0 text-base text-ink-950">Entrega</h3>
          <div className="order-delivery-panel flex items-start gap-3 rounded-lg border border-transparent bg-slate-50 p-4 text-sm">
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

        <DetailAccordion
          id={`order-products-${order.id}`}
          title="Productos"
          summary={<span className="text-xs font-semibold text-slate-500">· {productCount} {productCount === 1 ? "producto" : "productos"}</span>}
          open={productsOpen}
          onToggle={() => toggleSection("products")}
        >
          <div className="grid gap-2">
            {(order.items || []).map((item) => (
              <article className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 p-3 max-[430px]:grid-cols-[48px_minmax(0,1fr)]" key={`${order.id}-${item.productId}`}>
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 max-[430px]:size-12">
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
        </DetailAccordion>

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
