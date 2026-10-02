import { ArrowLeft, CheckCircle2, Eye, EyeOff, Mail, RefreshCw, RotateCcwKey } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import loginBackground from "../assets/fondo-login.png";
import BrandLogo from "../components/BrandLogo.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { isValidRut, normalizeRut } from "../helpers/rut.js";
import useAuth from "../hooks/useAuth.js";
import {
  confirmClientReactivationRequest,
  requestClientReactivationRequest,
} from "../services/auth.service.js";

function secondsUntil(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

export default function ClientReactivationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [identifier, setIdentifier] = useState(() => String(location.state?.identifier || ""));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!challenge?.resendAvailableAt || remaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRemaining(secondsUntil(challenge.resendAvailableAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.resendAvailableAt, remaining]);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const normalizedCredentials = () => {
    const normalizedIdentifier = identifier.includes("@")
      ? identifier.trim().toLowerCase()
      : normalizeRut(identifier);
    if (!identifier.includes("@") && !isValidRut(normalizedIdentifier)) {
      throw new Error("Ingresa un RUT chileno válido");
    }
    if (!password) throw new Error("Ingresa tu contraseña actual");
    return { identifier: normalizedIdentifier, password };
  };

  const requestCode = async () => {
    if (busy || remaining > 0) return;
    setBusy(true);
    try {
      const credentials = normalizedCredentials();
      const result = await requestClientReactivationRequest(credentials);
      setIdentifier(credentials.identifier);
      setChallenge(result);
      setPin("");
      setRemaining(secondsUntil(result.resendAvailableAt));
      toast.success("Código enviado. Revisa tu correo.");
    } catch (error) {
      const message = error instanceof Error && !error.response
        ? error.message
        : getApiError(error, "No se pudo enviar el código");
      const retryAfter = Number(error?.response?.data?.details?.retryAfterSeconds || 0);
      if (retryAfter > 0 && challenge) {
        const resendAvailableAt = new Date(Date.now() + retryAfter * 1000).toISOString();
        setChallenge((current) => ({ ...current, resendAvailableAt }));
        setRemaining(retryAfter);
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    if (!challenge?.challengeId || !/^\d{6}$/.test(pin) || busy) return;
    setBusy(true);
    try {
      const credentials = normalizedCredentials();
      await confirmClientReactivationRequest({
        ...credentials,
        challengeId: challenge.challengeId,
        pin,
      });
      toast.success("Cuenta reactivada. Ya puedes iniciar sesión.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(getApiError(error, "No se pudo reactivar la cuenta"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[#f7f8f9] px-4 py-8">
      <LoadingOverlay active={busy} fullScreen />
      <img className="pointer-events-none absolute inset-0 h-full w-full object-cover brightness-125" src={loginBackground} alt="" aria-hidden="true" />
      <section className="relative z-1 grid w-full max-w-125 gap-5 rounded-lg border-2 border-rust-500 bg-white p-7 shadow-[0_14px_38px_rgba(16,21,31,0.12)] max-[520px]:p-5">
        <Link className="flex items-center gap-2 text-ink-950 no-underline" to="/catalog">
          <BrandLogo className="size-11" /><strong>FERRETERÍA FYF</strong>
        </Link>
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-rust-50 text-rust-600"><RotateCcwKey size={23} /></span>
          <h1 className="mt-4 mb-0 text-2xl font-bold text-ink-950">Reactivar mi cuenta</h1>
          <p className="mt-2 mb-0 text-sm leading-6 text-slate-600">Confirma tu contraseña y el código enviado a tu correo. Este flujo solo funciona para cuentas de cliente desactivadas voluntariamente.</p>
        </div>

        <div className="grid gap-4">
          <label>Correo electrónico o RUT<input type="text" value={identifier} onChange={(event) => { setIdentifier(event.target.value); setChallenge(null); }} autoComplete="username" placeholder="correo@ejemplo.cl o 10120345-K" required /></label>
          <label>
            Contraseña actual
            <span className="relative block">
              <input className="pr-12" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setChallenge(null); }} autoComplete="current-password" required />
              <button className="absolute top-1/2 right-1.5 grid size-9 min-h-0 -translate-y-1/2 place-items-center border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100 hover:text-ink-950" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
        </div>

        {challenge ? (
          <form className="grid gap-4 rounded-lg border border-rust-200 bg-rust-50 p-4" onSubmit={confirm}>
            <div className="flex items-start gap-3"><Mail className="mt-0.5 shrink-0 text-rust-600" size={20} /><div><strong className="block text-sm text-ink-950">Verifica tu correo</strong><span className="text-xs text-slate-600">Código enviado a {challenge.emailMasked || "tu correo registrado"}</span></div></div>
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Código de 6 dígitos<input className="max-w-60 font-mono text-lg tracking-[0.28em]" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required /></label>
            <div className="flex flex-wrap gap-2 max-[480px]:*:w-full">
              <button type="submit" disabled={busy || pin.length !== 6}><CheckCircle2 size={17} /> Reactivar cuenta</button>
              <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={requestCode} disabled={busy || remaining > 0}><RefreshCw size={17} /> {remaining > 0 ? `Reenviar en ${remaining}s` : "Reenviar código"}</button>
            </div>
          </form>
        ) : (
          <button className="w-full" type="button" onClick={requestCode} disabled={busy || !identifier.trim() || !password}><Mail size={17} /> Enviar código de reactivación</button>
        )}

        <Link className="inline-flex items-center justify-center gap-2 text-sm font-bold text-rust-600" to="/login"><ArrowLeft size={16} /> Volver a iniciar sesión</Link>
      </section>
    </main>
  );
}
