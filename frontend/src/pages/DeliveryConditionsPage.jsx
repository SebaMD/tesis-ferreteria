import { useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import { deliveryConditionsInformation } from "../helpers/deliveryConditions.js";
import { getStoreContactDetails } from "../helpers/storeInformation.js";
import { formatClp } from "../helpers/formatters.js";
import { panelClass } from "../helpers/uiClasses.js";

export default function DeliveryConditionsPage() {
  const { deliveryInformation } = useCustomerNotice();
  const conditions = deliveryConditionsInformation(deliveryInformation);
  const location = getStoreContactDetails().find(contact => contact.kind === "address");
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, []);
  return <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6">
    <header className="grid gap-2"><h1 className="m-0 text-2xl font-bold text-ink-950">Condiciones de despacho</h1>
      <p className="m-0 text-sm leading-6 text-slate-600">Información entregada por FYF. La ferretería debe confirmar el importe definitivo antes del cobro.</p></header>
    {deliveryInformation?.deliveryEnabled === false && <p role="status" className="m-0 rounded border border-slate-300 bg-white p-3 text-sm font-semibold text-ink-950">El despacho no está disponible por ahora.</p>}
    <section className={panelClass}>
      <h2 className="m-0 text-lg font-bold text-ink-950">Cobertura y costo</h2>
      <ul className="m-0 grid gap-3 pl-5 text-sm leading-6 text-slate-600">
        <li>Cobertura: {conditions.coverage}.</li>
        <li>Dentro de {conditions.radius} km: despacho sin cobro, sujeto a confirmar la distancia por ruta.</li>
        <li>Sobre {conditions.radius} km: referencia mínima de {formatClp(conditions.outboundKm)} CLP por kilómetro de ida. No es un precio final garantizado; FYF debe confirmar cómo se aplica la distancia considerada.</li>
        <li>El costo final depende del vehículo, volumen, peso, transporte de áridos y cantidad de viajes.</li>
      </ul>
    </section>
    <section className={panelClass}><h2 className="m-0 text-lg font-bold text-ink-950">Consulta por despacho gratuito</h2>
      <p className="m-0 text-sm leading-6 text-slate-600">Desde {formatClp(conditions.conditionalThreshold)} de compra se puede consultar por despacho gratuito, sujeto a coordinación previa, entrega no urgente y aprobación de FYF. No es automático ni garantizado.</p>
      <p className="m-0 text-xs leading-5 text-slate-500">El beneficio depende de la política vigente y de la aprobación manual de FYF. Alcanzar el monto no concede gratuidad.</p></section>
    <section className={panelClass}><h2 className="m-0 text-lg font-bold text-ink-950">Ubicación y compra online</h2>
      {location ? <a className="inline-flex min-h-11 items-center text-sm font-bold text-rust-600 underline" href={location.href} target="_blank" rel="noopener noreferrer">Ver ubicación de la ferretería y consultar ruta</a>
        : <p className="m-0 text-sm leading-6 text-slate-600">El enlace para ver la ubicación de la ferretería y consultar ruta está pendiente de confirmar su dirección oficial.</p>}
      <p className="m-0 text-sm leading-6 text-slate-600">El retiro en tienda no tiene costo de despacho. Para entrega a domicilio, solicita la evaluación al finalizar compra. Solo podrás pagar después de que FYF apruebe el flete y aceptes el resumen final. La solicitud no reserva productos.</p></section>
    <Link className="min-h-11 content-center text-sm font-bold text-rust-600 underline" to="/checkout">Volver a finalizar compra</Link>
  </main>;
}
