import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { isClientScrollPath, routeScrollAction, readRouteScrollEntries, persistRouteScrollEntries } from "../helpers/routeScroll.js";

function scrollParents() {
  const parents = [];
  let node = document.querySelector("main")?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) parents.push(node);
    node = node.parentElement;
  }
  return parents;
}

export default function ClientScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(null);
  const entries = useRef(null);
  if (entries.current == null) entries.current = readRouteScrollEntries();
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = location;
    if (!isClientScrollPath(location.pathname)) return undefined;
    const originalRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const saved = entries.current.get(location.state?.restoreClientScrollKey || location.key);
    const target = old === location && saved?.pathname === location.pathname ? saved.position : routeScrollAction(old, location, navigationType, saved);
    const parents = scrollParents();
    let last = entries.current.get(location.key)?.position || { x: 0, y: 0 };
    let restoring = Boolean(target?.y);
    const originalMinHeight = document.documentElement.style.minHeight;
    const originalAnchor = document.documentElement.style.overflowAnchor;
    if (target) {
      // Reserve the saved height before paint so async content cannot clamp the
      // history position to zero, then remove the reservation once content fits.
      if (restoring) { document.documentElement.style.minHeight = `${target.y + innerHeight}px`; document.documentElement.style.overflowAnchor = "none"; }
      window.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
      parents.forEach((parent, index) => parent.scrollTo({ left: 0, top: target.parents?.[index] || 0, behavior: "instant" }));
      last = { ...target };
    }
    const save = () => {
      if (!restoring) last = { x: window.scrollX, y: window.scrollY, parents: parents.map(parent => parent.scrollTop) };
      entries.current.set(location.key, { pathname: location.pathname, position: last });
      if (entries.current.size > 60) entries.current.delete(entries.current.keys().next().value);
    };
    const release = () => {
      if (!restoring) return;
      restoring = false;
      document.documentElement.style.minHeight = originalMinHeight;
      document.documentElement.style.overflowAnchor = originalAnchor;
      save();
    };
    const started = performance.now();
    const checkContent = () => {
      const root = document.getElementById("root");
      if (!restoring || !root) return;
      const loading = root.querySelector('[aria-busy="true"], .app-loading-overlay, [role="status"]');
      if (root.getBoundingClientRect().height >= target.y + innerHeight || !loading && performance.now() - started >= 250) release();
    };
    const resize = new ResizeObserver(checkContent);
    const mutation = new MutationObserver(checkContent);
    if (restoring && document.getElementById("root")) resize.observe(document.getElementById("root"));
    if (restoring && document.getElementById("root")) mutation.observe(document.getElementById("root"), { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const settledCheck = window.setTimeout(checkContent, 250);
    const timeout = window.setTimeout(release, 20_000);
    const capture = () => { if (!restoring) save(); };
    const persist = () => { save(); persistRouteScrollEntries(entries.current); };
    const keyScroll = event => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) release(); };
    document.addEventListener("scroll", capture, true);
    document.addEventListener("click", capture, true);
    window.addEventListener("pagehide", persist);
    window.addEventListener("keydown", keyScroll);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    save();
    return () => {
      resize.disconnect(); mutation.disconnect(); clearTimeout(timeout); clearTimeout(settledCheck);
      // Use the last pre-navigation observation, not the new route's short DOM.
      entries.current.set(location.key, { pathname: location.pathname, position: last });
      persistRouteScrollEntries(entries.current);
      if (restoring) { document.documentElement.style.minHeight = originalMinHeight; document.documentElement.style.overflowAnchor = originalAnchor; }
      history.scrollRestoration = originalRestoration;
      document.removeEventListener("scroll", capture, true); document.removeEventListener("click", capture, true);
      window.removeEventListener("pagehide", persist); window.removeEventListener("keydown", keyScroll); window.removeEventListener("wheel", release); window.removeEventListener("touchstart", release);
    };
  }, [location, navigationType]);
  return null;
}
