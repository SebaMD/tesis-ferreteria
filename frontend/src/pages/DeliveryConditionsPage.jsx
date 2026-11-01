import { InformationBackLink } from "../components/InformationNavigation.jsx";
import { useLayoutEffect } from "react";
import DeliveryConditions from "../components/DeliveryConditions.jsx";
import {panelClass} from "../helpers/uiClasses.js";
export default function DeliveryConditionsPage(){
 useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, []);
 return <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6">
 <header className="flex flex-wrap items-start justify-between gap-3"><h1 className="m-0 min-w-0 text-2xl font-bold">Condiciones de despacho local</h1><InformationBackLink /></header>
 <section className={panelClass}><h2 className="m-0 text-lg font-bold">Cobertura y costo</h2><DeliveryConditions showLink={false}/><p className="m-0 text-sm">No se ofrece despacho a otras comunas en esta versión. El costo final se calcula en el servidor y se muestra antes de Webpay. El retiro en tienda no tiene costo.</p></section>
 <section className={panelClass}><h2 className="m-0 text-lg font-bold">Dirección y entrega</h2><p className="m-0 text-sm">Indica destinatario, teléfono, dirección y una referencia útil si no existe numeración. No verificamos físicamente direcciones mediante mapas ni geocodificación. El pago aprobado no significa que el pedido haya sido entregado: podrás consultar su preparación y entrega.</p></section>
 <p className="text-sm">Las solicitudes de despacho anteriores conservan sus condiciones y pueden consultarse desde su historial. No se recalculan con la tarifa vigente.</p>
 </main>;}
