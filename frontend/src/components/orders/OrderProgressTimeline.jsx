import {
  Check,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageOpen,
  Store,
  Truck,
} from "lucide-react";
import { formatDate } from "../../helpers/formatters.js";
import { getOnlineOrderStatus } from "../../helpers/onlineOrders.js";

const PAYMENT_ONLY_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "CANCELLED",
  "EXPIRED",
  "PAYMENT_REVIEW",
]);

const DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function operationalSteps(order) {
  const delivery = order.deliveryType === "DELIVERY";
  return [
    {
      key: "PAID",
      label: "Compra confirmada",
      description: "El pago fue confirmado y el pedido ingresó a preparación.",
      date: order.paidAt,
      icon: CheckCircle2,
    },
    {
      key: "PREPARING",
      label: "En preparación",
      description: "El equipo de bodega está preparando los productos.",
      date: order.preparationStartedAt,
      icon: PackageOpen,
    },
    {
      key: delivery ? "READY_FOR_DELIVERY" : "READY_FOR_PICKUP",
      label: delivery ? "Listo para despacho" : "Listo para retirar",
      description: delivery
        ? "El pedido está preparado y disponible para reparto."
        : "El pedido está preparado para ser retirado en la ferretería.",
      date: order.preparedAt,
      icon: delivery ? PackageCheck : Store,
    },
    ...(delivery ? [{
      key: "OUT_FOR_DELIVERY",
      label: "En reparto",
      description: "El pedido salió a reparto hacia la dirección indicada.",
      date: order.deliveryStartedAt,
      icon: Truck,
    }] : []),
    {
      key: "DELIVERED",
      label: delivery ? "Pedido entregado" : "Pedido retirado",
      description: delivery
        ? "El pedido fue entregado en su destino."
        : "El pedido fue entregado a la persona que lo retiró.",
      date: order.deliveredAt,
      icon: Check,
    },
  ];
}

function currentStepIndex(order, steps) {
  if (order.status === "DELIVERED") return steps.length - 1;
  return Math.max(steps.findIndex((step) => step.key === order.status), 0);
}

export default function OrderProgressTimeline({ order }) {
  if (PAYMENT_ONLY_STATUSES.has(order.status)) {
    const status = getOnlineOrderStatus(order.status);
    return (
      <section className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <Clock3 className="mt-0.5 shrink-0 text-rust-600" size={22} />
        <div>
          <strong className="text-sm text-ink-950">{status.label}</strong>
          <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{status.description}</p>
        </div>
      </section>
    );
  }

  const steps = operationalSteps(order);
  const currentIndex = currentStepIndex(order, steps);

  return (
    <ol className="m-0 grid list-none gap-0 p-0" aria-label="Progreso del pedido">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const completed = index < currentIndex || order.status === "DELIVERED";
        const current = index === currentIndex && order.status !== "DELIVERED";
        const active = completed || current;
        return (
          <li className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 pb-5 last:pb-0" key={step.key}>
            {index < steps.length - 1 && (
              <span className={`absolute top-8 bottom-0 left-[17px] w-0.5 ${index < currentIndex ? "bg-positive-600" : "bg-slate-200"}`} aria-hidden="true" />
            )}
            <span className={`relative z-1 grid size-9 place-items-center rounded-full border-2 ${active ? "border-positive-600 bg-positive-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <strong className={active ? "text-ink-950" : "text-slate-400"}>{step.label}</strong>
                {step.date && <time className="text-[11px] text-slate-500">{formatDate(step.date, DATE_OPTIONS)}</time>}
              </div>
              <p className={`mt-1 mb-0 text-xs leading-5 ${active ? "text-slate-600" : "text-slate-400"}`}>{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
