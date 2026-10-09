import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import useAuth from "../hooks/useAuth.js";
import { addFavoriteRequest, getFavoritesRequest, removeFavoriteRequest } from "../services/favorites.service.js";
import FavoritesContext from "./FavoritesContext.js";

function FavoritesStore({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState([]);
  const active = useRef(false);
  const pending = useRef(new Set());
  const request = useRef(null);

  const reload = useCallback((signal) => {
    if (pending.current.size) return Promise.resolve();
    if (request.current && !request.current.signal?.aborted) return request.current.promise;
    const entry = { signal, promise: null };
    entry.promise = (async () => {
      setLoading(true);
      try {
        const data = await getFavoritesRequest(signal);
        if (!active.current || signal?.aborted) return;
        setProducts(data);
        setError("");
      } catch (failure) {
        if (active.current && !signal?.aborted) setError(getApiError(failure, "No se pudieron cargar tus favoritos"));
      } finally {
        if (active.current && !signal?.aborted) setLoading(false);
      }
    })().finally(() => { if (request.current === entry) request.current = null; });
    request.current = entry;
    return entry.promise;
  }, []);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    reload(controller.signal);
    return () => { active.current = false; controller.abort(); };
  }, [reload]);

  const toggle = async (product) => {
    if (loading || error || !active.current || pending.current.has(product.id)) return;
    pending.current.add(product.id);
    setBusy([...pending.current]);
    const selected = products.some((item) => item.id === product.id);
    try {
      if (selected) await removeFavoriteRequest(product.id);
      else await addFavoriteRequest(product.id);
      if (!active.current) return;
      setProducts((current) => selected ? current.filter((item) => item.id !== product.id) : [...current, product]);
    } catch (failure) {
      if (active.current) toast.error(getApiError(failure, "No se pudo actualizar el favorito"));
    } finally {
      pending.current.delete(product.id);
      if (active.current) setBusy([...pending.current]);
    }
  };

  return <FavoritesContext.Provider value={{ enabled: true, products, loading, error, busy, toggle, reload }}>{children}</FavoritesContext.Provider>;
}

export default function FavoritesProvider({ children }) {
  const { user, token } = useAuth();
  if (user?.role !== "CLIENT" || !token) return <FavoritesContext.Provider value={{ enabled: false, products: [], loading: false }}>{children}</FavoritesContext.Provider>;
  // Remount on session changes: no favorites or late responses cross accounts.
  return <FavoritesStore key={`${user.id}:${token}`}>{children}</FavoritesStore>;
}
