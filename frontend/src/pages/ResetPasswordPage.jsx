import { CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import loginBackground from "../assets/fondo-login.png";
import BrandLogo from "../components/BrandLogo.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { isValidPassword, PASSWORD_REQUIREMENTS } from "../helpers/password.js";
import { confirmPasswordResetRequest } from "../services/auth.service.js";
import AuthThemeToggle from "../components/AuthThemeToggle.jsx";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") || "");
  const [form, setForm] = useState({ password: "", confirmation: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (token && window.location.search) window.history.replaceState({}, "", "/reset-password");
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error("El enlace no es válido o ya expiró");
      return;
    }
    if (!isValidPassword(form.password)) {
      toast.error(PASSWORD_REQUIREMENTS);
      return;
    }
    if (form.password !== form.confirmation) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordResetRequest({ token, password: form.password });
      setCompleted(true);
      setForm({ password: "", confirmation: "" });
    } catch (error) {
      toast.error(getApiError(error, "No se pudo restablecer la contraseña"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[#f7f8f9] px-4 py-8">
      <AuthThemeToggle />
      <LoadingOverlay active={loading} fullScreen />
      <img className="pointer-events-none absolute inset-0 h-full w-full object-cover brightness-125" src={loginBackground} alt="" aria-hidden="true" />
      <section className="relative z-1 grid w-full max-w-115 gap-5 rounded-lg border-2 border-rust-500 bg-white p-7 shadow-[0_14px_38px_rgba(16,21,31,0.12)] max-[520px]:p-5">
        <Link className="flex items-center gap-2 text-ink-950 no-underline" to="/catalog"><BrandLogo className="size-11" /><strong>FERRETERÍA FYF</strong></Link>
        {completed ? (
          <div className="grid justify-items-center gap-4 text-center" role="status">
            <CheckCircle2 className="text-positive-600" size={48} />
            <div><h1 className="m-0 text-2xl font-bold text-ink-950">Contraseña actualizada</h1><p className="mt-2 mb-0 text-sm text-slate-600">Ya puedes iniciar sesión con tu nueva contraseña.</p></div>
            <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/login">Iniciar sesión</Link>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submit}>
            <div><h1 className="m-0 text-2xl font-bold text-ink-950">Crea una nueva contraseña</h1><p className="mt-2 mb-0 text-sm leading-6 text-slate-600">El enlace es personal, vence a los 30 minutos y solo puede utilizarse una vez.</p></div>
            {!token && <p className="m-0 rounded-[5px] border border-critical-200 bg-critical-50 p-3 text-sm text-critical-600" role="alert">El enlace no es válido o ya expiró. Solicita uno nuevo.</p>}
            <label>
              Nueva contraseña
              <span className="relative block">
                <LockKeyhole className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pr-12 pl-9.75" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required />
                <button className="absolute top-1/2 right-1.5 grid size-9 min-h-0 -translate-y-1/2 place-items-center border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
            <label>Confirmar nueva contraseña<input type="password" value={form.confirmation} onChange={(event) => setForm((current) => ({ ...current, confirmation: event.target.value }))} autoComplete="new-password" required /></label>
            <p className="m-0 rounded-[5px] bg-rust-50 px-3 py-2 text-xs text-rust-700">{PASSWORD_REQUIREMENTS}.</p>
            <button className="w-full" type="submit" disabled={loading || !token}>Guardar nueva contraseña</button>
            {!token && <Link className="text-center text-sm font-bold text-rust-600" to="/forgot-password">Solicitar otro enlace</Link>}
          </form>
        )}
      </section>
    </main>
  );
}
