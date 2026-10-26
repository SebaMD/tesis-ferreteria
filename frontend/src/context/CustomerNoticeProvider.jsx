import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPublicCustomerNoticeRequest } from "../services/customerNotice.service.js";
import CustomerNoticeContext from "./CustomerNoticeContext.js";

export default function CustomerNoticeProvider({ children }) {
  const [notices, setNotices] = useState([]);
  const [presentation, setPresentation] = useState(null);
  const [deliveryAnnouncement, setDeliveryAnnouncement] = useState(null);
  const [deliveryInformation, setDeliveryInformation] = useState(null);
  const generation = useRef(0);
  const invalidateRequests = useCallback(() => { generation.current++; }, []);

  const refreshNotices = useCallback(async () => {
    const request = ++generation.current;
    try {
      const current = await getPublicCustomerNoticeRequest();
      if (request !== generation.current) return current;
      setPresentation(current.presentation);
      setNotices(current.notices);
      setDeliveryAnnouncement(current.deliveryAnnouncement);
      setDeliveryInformation(current.deliveryInformation);
      return current;
    } catch {
      // Keep manual notices on transient failure, but do not advertise a stale benefit.
      if (request === generation.current) { setDeliveryAnnouncement(null); setDeliveryInformation(null); }
      return { presentation: null, notices: [] };
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshNotices();
    const refreshVisible = () => { if (document.visibilityState === "visible") refreshNotices(); };
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { invalidateRequests(); window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [refreshNotices, invalidateRequests]);

  const value = useMemo(
    () => ({ presentation, notices, deliveryAnnouncement, deliveryInformation, refreshNotices }),
    [notices, presentation, deliveryAnnouncement, deliveryInformation, refreshNotices],
  );

  return <CustomerNoticeContext.Provider value={value}>{children}</CustomerNoticeContext.Provider>;
}
