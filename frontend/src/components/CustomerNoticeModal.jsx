import { Info } from "lucide-react";
import AppModal from "./AppModal.jsx";
import useCustomerNotice from "../hooks/useCustomerNotice.js";

export default function CustomerNoticeModal() {
  const { notice, open, closeNotice } = useCustomerNotice();
  if (!notice) return null;

  return (
    <AppModal
      open={open}
      title={notice.title}
      description="Información de la ferretería"
      onClose={closeNotice}
      size="small"
      panelClassName="customer-notice-panel"
      footer={<button type="button" onClick={closeNotice}>Entendido</button>}
    >
      <div className="customer-notice-content flex items-start gap-3 rounded-md border border-[#b9783d] bg-[#fff8e9] p-4 text-[#3b281b]">
        <Info className="mt-0.5 shrink-0 text-rust-600" size={22} />
        <p className="m-0 whitespace-pre-wrap text-sm leading-6">{notice.message}</p>
      </div>
    </AppModal>
  );
}
