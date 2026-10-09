import { useContext } from "react";
import CustomerNoticeContext from "../context/CustomerNoticeContext.js";

export default function useCustomerNotice() {
  const value = useContext(CustomerNoticeContext);
  if (!value) throw new Error("useCustomerNotice debe utilizarse dentro de CustomerNoticeProvider");
  return value;
}
