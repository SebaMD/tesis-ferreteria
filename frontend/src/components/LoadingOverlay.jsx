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

export default function LoadingOverlay({ active, contained = false, fullScreen = false }) {
  if (!active) return null;

  const className = [
    "app-loading-overlay",
    contained ? "app-loading-overlay--contained" : "",
    fullScreen ? "app-loading-overlay--screen" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Cargando"
    >
      <div className="app-loading-indicator">
        <div className="app-loading-road" aria-hidden="true">
          <LoadingTruck />
        </div>
        <p className="app-loading-text">
          Cargando
          <span className="app-loading-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>
    </div>
  );
}
