import { Link } from "react-router-dom";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import { formatClp } from "../helpers/formatters.js";

// All commercial references are supplied by the backend; none are a payable quote.
export default function DeliveryConditions() {
  const {deliveryInformation:info}=useCustomerNotice();
  return <p className="m-0 text-sm leading-6 text-slate-600">Despacho solo en Santa Juana, Región del Biobío. {info?.mode==='LOCAL_FIXED'?'Tarifa '+formatClp(info.flatFee)+'.'+(info.freeShippingFrom===null?'':' Gratis cuando los productos, después de descuentos, superan '+formatClp(info.freeShippingFrom)+'.'):'La tarifa local requiere activación administrativa; el retiro en tienda sigue disponible.'} Consulta las <Link className="font-semibold text-rust-600 underline" to="/delivery-conditions">Condiciones de despacho</Link>.</p>;
}
