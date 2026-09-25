import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicCustomerNoticeRequest } from "../services/customerNotice.service.js";
import CustomerNoticeContext from "./CustomerNoticeContext.js";

export default function CustomerNoticeProvider({ children }) {
  const [notices, setNotices] = useState([]);

  const refreshNotices = useCallback(async () => {
    try {
      const current = await getPublicCustomerNoticeRequest();
      setNotices(current);
      return current;
    } catch {
      setNotices([]);
      return [];
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshNotices();
  }, [refreshNotices]);

  const value = useMemo(() => ({ notices, refreshNotices }), [notices, refreshNotices]);

  return <CustomerNoticeContext.Provider value={value}>{children}</CustomerNoticeContext.Provider>;
}
