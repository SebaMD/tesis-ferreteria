import { useCallback, useContext, useEffect, useRef, useState } from "react";
import CartContext from "../context/CartContext.js";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";

// One authorized read at a time, shared by initial load, browser restoration and manual refresh.
export default function useBuyerOrders(request, errorMessage) {
  const cart = useContext(CartContext);
  const settleCart = useRef(cart?.settlePurchasedOrder);
  useEffect(() => { settleCart.current = cart?.settlePurchasedOrder; }, [cart?.settlePurchasedOrder]);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(null);
  const mounted = useRef(false);
  const lastStarted = useRef(0);
  const loadOrders = useCallback(({ showLoading = true, notifyError = true, automatic = false } = {}) => {
    if (!mounted.current) return Promise.resolve();
    if (active.current) return active.current.promise;
    if (automatic && (document.visibilityState === "hidden" || Date.now() - lastStarted.current < 1500)) return Promise.resolve();
    const task = { controller: new AbortController() };
    active.current = task;
    lastStarted.current = Date.now();
    if (showLoading) setLoading(true);
    setRefreshing(true);
    task.promise = (async () => {
      try {
        const data = await request({ signal: task.controller.signal });
        if (!mounted.current || active.current !== task || task.controller.signal.aborted) return;
        for (const order of data) settleCart.current?.(order);
        setOrders(data);
        setSelectedOrder(current => current ? data.find(order => order.id === current.id) || null : null);
        setError("");
      } catch (failure) {
        if (!mounted.current || active.current !== task || task.controller.signal.aborted) return;
        const message = getApiError(failure, errorMessage);
        setError(message);
        if (notifyError) toast.error(message);
      } finally {
        if (mounted.current && active.current === task) {
          active.current = null;
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return task.promise;
  }, [request, errorMessage]);
  const hasPending = orders.some(order => ["PENDING_PAYMENT", "PAYMENT_REVIEW"].includes(order.status));
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    const refresh = () => loadOrders({ showLoading: false, notifyError: false, automatic: true });
    // BFCache can preserve this component; abandon only its read, never the payment.
    const abandonRead = () => {
      active.current?.controller.abort();
      active.current = null;
      lastStarted.current = 0;
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("pagehide", abandonRead);
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      active.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("pagehide", abandonRead);
    };
  }, [loadOrders]);
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => loadOrders({ showLoading: false, notifyError: false, automatic: true }), 30_000);
    return () => window.clearInterval(timer);
  }, [hasPending, loadOrders]);
  return { orders, setOrders, selectedOrder, setSelectedOrder, loading, refreshing, error, loadOrders };
}
