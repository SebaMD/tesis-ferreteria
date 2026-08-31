import { ChevronRight, MapPin, Store, Truck } from "lucide-react";
import { formatClp, formatDate } from "../../helpers/formatters.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
} from "../../helpers/onlineOrders.js";
import { badgeClass } from "../../helpers/uiClasses.js";
import OrderProductImage from "./OrderProductImage.jsx";

const DATE_OPTIONS = { day: "2-digit", month: "short", year: "numeric" };

export default function OrderSummaryCard({
  order,
  onView,
  actions,
  secondary = false,
}) {
  const status = getOnlineOrderStatus(order.status);
  const delivery = getOnlineOrderDeliveryType(order.deliveryType);
  const primaryItem = order.items?.[0];
  const extraProducts = Math.max((order.items?.length || 0) - 1, 0);

  return (
    <article
      className={`scroll-mt-24 overflow-hidden rounded-lg border bg-white ${secondary ? "border-slate-200 shadow-none" : "border-slate-200 shadow-sm"}`}
      id={`order-${order.id}`}
    >
      <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-stretch gap-4 p-4 max-[680px]:grid-cols-[80px_minmax(0,1fr)] max-[680px]:gap-3 max-[430px]:grid-cols-[68px_minmax(0,1fr)] max-[430px]:p-3">
        <div className="grid min-h-24 place-items-center overflow-hidden rounded-md bg-slate-100 max-[430px]:min-h-18">
          <OrderProductImage src={primaryItem?.productImageUrl} alt={primaryItem?.productName || "Producto del pedido"} />
        </div>

        <div className="grid min-w-0 content-start gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <strong className="block truncate text-base text-ink-950 max-[430px]:text-sm">{primaryItem?.productName || "Pedido online"}</strong>
              <span className="mt-0.5 block text-xs text-slate-500">
                {primaryItem ? `${primaryItem.quantity} ${Number(primaryItem.quantity) === 1 ? "unidad" : "unidades"}` : "Sin productos"}
                {extraProducts > 0 ? ` · +${extraProducts} ${extraProducts === 1 ? "producto" : "productos"}` : ""}
              </span>
            </div>
            <span className={badgeClass(status.tone)}>{status.label}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <strong className="font-mono text-ink-700">{formatOnlineOrderFolio(order.id)}</strong>
            <span>{formatDate(order.createdAt, DATE_OPTIONS)}</span>
            <span className="inline-flex items-center gap-1">
              {order.deliveryType === "DELIVERY" ? <Truck size={14} /> : <Store size={14} />}
              {delivery.label}
            </span>
          </div>

          {order.deliveryType === "DELIVERY" && order.deliveryAddress && (
            <span className="flex min-w-0 items-start gap-1 text-xs text-slate-600">
              <MapPin className="mt-0.5 shrink-0" size={14} />
              <span className="truncate">{order.deliveryAddress}, {order.deliveryCommune}</span>
            </span>
          )}
          <p className="m-0 line-clamp-2 text-xs leading-5 text-slate-500">{status.description}</p>
        </div>

        <div className="flex min-w-34 flex-col items-end justify-between gap-3 border-l border-slate-200 pl-4 max-[680px]:col-span-2 max-[680px]:min-w-0 max-[680px]:flex-row max-[680px]:items-center max-[680px]:border-t max-[680px]:border-l-0 max-[680px]:pt-3 max-[680px]:pl-0">
          <strong className="font-mono text-lg text-ink-950">{formatClp(order.total)}</strong>
          <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => onView(order)}>
            {order.status === "DELIVERED" ? "Ver compra" : "Ver detalle"} <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {actions && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">{actions}</footer>}
    </article>
  );
}
