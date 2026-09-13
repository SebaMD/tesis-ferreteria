import { ArrowLeft, Mail, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import loginBackground from "../assets/fondo-login.png";
import BrandLogo from "../components/BrandLogo.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { requestPasswordResetRequest } from "../services/auth.service.js";
import AuthThemeToggle from "../components/AuthThemeToggle.jsx";

const GENERIC_MESSAGE = "Si existe una cuenta activa asociada a ese correo, recibirás instrucciones para restablecer tu contraseña.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await requestPasswordResetRequest(email);
      setSubmitted(true);
    } catch (error) {
      toast.error(getApiError(error, "No se pudo procesar la solicitud"));
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
        <Link className="flex items-center gap-2 text-ink-950 no-underline" to="/catalog">
          <BrandLogo className="size-11" /><strong>FERRETERÍA FYF</strong>
        </Link>
        {submitted ? (
          <div className="grid gap-4" role="status">
            <span className="grid size-12 place-items-center rounded-full bg-rust-50 text-rust-600"><Mail size={23} /></span>
            <div>
              <h1 className="m-0 text-2xl font-bold text-ink-950">Revisa tu correo</h1>
              <p className="mt-2 mb-0 text-sm leading-6 text-slate-600">{GENERIC_MESSAGE}</p>
            </div>
            <p className="m-0 text-xs leading-5 text-slate-500">El mensaje puede tardar unos minutos. Revisa también la carpeta de correo no deseado.</p>
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/login">
              <ArrowLeft size={17} /> Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div>
              <h1 className="m-0 text-2xl font-bold text-ink-950">Recuperar contraseña</h1>
              <p className="mt-2 mb-0 text-sm leading-6 text-slate-600">Ingresa tu correo y, si corresponde, te enviaremos un enlace seguro de un solo uso.</p>
            </div>
            <label>
              Correo electrónico
              <span className="relative block">
                <Mail className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pl-9.75" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus />
              </span>
            </label>
            <button className="w-full" type="submit" disabled={loading}><Send size={17} /> Enviar instrucciones</button>
            <Link className="inline-flex items-center justify-center gap-2 text-sm font-bold text-rust-600" to="/login"><ArrowLeft size={16} /> Volver a iniciar sesión</Link>
          </form>
        )}
      </section>
    </main>
  );
}
