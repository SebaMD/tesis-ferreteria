import { Link } from "react-router-dom";
import DeliveryConditions from "../components/DeliveryConditions.jsx";
import {panelClass} from "../helpers/uiClasses.js";
export default function DeliveryConditionsPage(){return <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6">
 <h1 className="m-0 text-2xl font-bold">Condiciones de despacho local</h1>
 <section className={panelClass}><h2 className="m-0 text-lg font-bold">Cobertura y costo</h2><DeliveryConditions/><p className="m-0 text-sm">No se ofrece despacho a otras comunas en esta versión. El costo final se calcula en el servidor y se muestra antes de Webpay. El retiro en tienda no tiene costo.</p></section>
 <section className={panelClass}><h2 className="m-0 text-lg font-bold">Dirección y entrega</h2><p className="m-0 text-sm">Indica destinatario, teléfono, dirección y una referencia útil si no existe numeración. No verificamos físicamente direcciones mediante mapas ni geocodificación. El pago aprobado no significa que el pedido haya sido entregado: podrás consultar su preparación y entrega.</p></section>
 <p className="text-sm">Las solicitudes de despacho anteriores conservan sus condiciones y pueden consultarse desde su historial. No se recalculan con la tarifa vigente.</p><Link to="/checkout" className="font-bold text-rust-600 underline">Volver a finalizar compra</Link>
 </main>;}
