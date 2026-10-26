import { Link } from "react-router-dom";

// All commercial references are supplied by the backend; none are a payable quote.
export default function DeliveryConditions() {
  return <p className="m-0 text-sm leading-6 text-slate-600">El costo del despacho depende de tu ubicación y de las características del pedido. Consulta las <Link className="font-semibold text-rust-600 underline" to="/delivery-conditions">Condiciones de despacho</Link>.</p>;
}
