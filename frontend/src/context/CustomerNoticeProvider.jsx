import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicCustomerNoticeRequest } from "../services/customerNotice.service.js";
import CustomerNoticeContext from "./CustomerNoticeContext.js";

const DISMISSED_NOTICE_KEY = "fyf-dismissed-notice-version";

export default function CustomerNoticeProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const [open, setOpen] = useState(false);

  const refreshNotice = useCallback(async ({ revealChanged = true } = {}) => {
    try {
      const current = await getPublicCustomerNoticeRequest();
      setNotice(current);
      const dismissedVersion = sessionStorage.getItem(DISMISSED_NOTICE_KEY);
      setOpen(Boolean(current && revealChanged && current.version !== dismissedVersion));
      return current;
    } catch {
      setNotice(null);
      setOpen(false);
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshNotice();
  }, [refreshNotice]);

  const closeNotice = useCallback(() => {
    if (notice?.version) sessionStorage.setItem(DISMISSED_NOTICE_KEY, notice.version);
    setOpen(false);
  }, [notice]);
  const reopenNotice = useCallback(() => setOpen(Boolean(notice)), [notice]);
  const value = useMemo(() => ({ notice, open, closeNotice, reopenNotice, refreshNotice }), [closeNotice, notice, open, refreshNotice, reopenNotice]);

  return <CustomerNoticeContext.Provider value={value}>{children}</CustomerNoticeContext.Provider>;
}
