import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function LoadingTruck() {
  return (
    <svg
      className="app-loading-truck"
      viewBox="0 0 132 66"
      role="presentation"
      focusable="false"
    >
      <path className="app-loading-truck-bed" d="M5 22h73v25H5z" />
      <path className="app-loading-truck-rail" d="M9 26h65M9 32h65M9 38h65" />
      <path className="app-loading-truck-cab" d="M80 16h27l17 19v18H77V22z" />
      <path className="app-loading-truck-window" d="M87 21h17l12 14H87z" />
      <path className="app-loading-truck-chassis" d="M4 47h122v8H4z" />
      <path className="app-loading-truck-bumper" d="M121 45h8v10h-8z" />
      <circle className="app-loading-wheel" cx="28" cy="54" r="10" />
      <circle className="app-loading-wheel-hub" cx="28" cy="54" r="4" />
      <circle className="app-loading-wheel" cx="103" cy="54" r="10" />
      <circle className="app-loading-wheel-hub" cx="103" cy="54" r="4" />
    </svg>
  );
}

export function LoadingIndicator({ label = 'Cargando' }) {
  return <div className="app-loading-indicator"><div className="app-loading-road" aria-hidden="true"><LoadingTruck /></div>
    <p className="app-loading-text">{label}<span className="app-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p></div>;
}

export default function LoadingOverlay({ active, contained = false, fullScreen = false, label = 'Cargando' }) {
  const [bounds, setBounds] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!active || contained || fullScreen) return undefined;
    const navbar = document.querySelector('[data-loading-navbar], [data-client-navbar]');
    const sidebar = document.querySelector('[data-loading-sidebar]');
    const measure = () => {
      const nav = navbar?.getBoundingClientRect(), side = sidebar?.getBoundingClientRect();
      const next = { top: Math.max(0, Math.min(innerHeight, nav?.bottom || 0)), left: innerWidth > 980 && side && side.left >= 0 && side.right < innerWidth ? side.right : 0 };
      setBounds(old => old.top === next.top && old.left === next.left ? old : next);
    };
    measure();const observer = new ResizeObserver(measure);
    if (navbar) observer.observe(navbar);if (sidebar) observer.observe(sidebar);
    window.addEventListener('resize', measure);window.addEventListener('scroll', measure, true);
    return () => { observer.disconnect();window.removeEventListener('resize', measure);window.removeEventListener('scroll', measure, true); };
  }, [active, contained, fullScreen]);
  if (!active) return null;

  const className = [
    "app-loading-overlay",
    contained ? "app-loading-overlay--contained" : "",
    fullScreen ? "app-loading-overlay--screen" : "",
  ].filter(Boolean).join(" ");

  const overlay = (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
      style={!contained && !fullScreen ? { top: bounds.top, left: bounds.left } : undefined}
    >
      <LoadingIndicator label={label} />
    </div>
  );
  return contained ? overlay : createPortal(overlay, document.body);
}
