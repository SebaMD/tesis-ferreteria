import { LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import loginBackground from "../assets/fondo-login.png";
import BrandLogo from "../components/BrandLogo.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { clearSessionNotice, readSessionNotice } from "../helpers/session.js";
import useAuth from "../hooks/useAuth.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [sessionNotice, setSessionNotice] = useState(readSessionNotice);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionNotice) return;
    toast.warning(sessionNotice);
    clearSessionNotice();
  }, [sessionNotice]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const clearExpiredSessionMessage = () => {
    if (!sessionNotice) return;
    setSessionNotice("");
    clearSessionNotice();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearExpiredSessionMessage();
    setLoading(true);

    try {
      await login({ correo, password });
      navigate("/dashboard");
    } catch (err) {
      toast.error(getApiError(err, "No se pudo iniciar sesion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate grid h-dvh min-h-0 grid-cols-[minmax(400px,44%)_1fr] overflow-hidden bg-[#f7f8f9] max-[720px]:grid-cols-1">
      <LoadingOverlay active={loading} fullScreen />

      <section className="relative z-10 grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r-2 border-r-rust-500 bg-ink-950 bg-[linear-gradient(rgba(217,119,6,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(217,119,6,0.14)_1px,transparent_1px)] bg-size-[32px_32px] p-12 text-white max-[720px]:hidden">
        <div className="relative z-1 flex items-center gap-2.5">
          <BrandLogo className="size-13" />
          <strong className="text-[17px] font-bold">FERRETERIA FYF</strong>
        </div>
        <div className="relative z-1 w-full max-w-120 -translate-y-20 place-self-center py-8 text-left max-[980px]:-translate-y-12">
          <h1 className="m-0 text-[42px] leading-[1.08] font-bold max-[980px]:text-[34px]">Control de inventario y ventas, con reportes</h1>
          <p className="mt-4.5 mb-0 max-w-97.5 text-[15px] leading-[1.65] text-[#aab3bf]">Gestión interna de productos, stock y ventas presenciales para la ferretería.</p>
        </div>
        <span className="relative z-1 font-mono text-[11px] text-[#727e8e]">V1.0 · USO INTERNO</span>
      </section>

      <img
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover brightness-125"
        src={loginBackground}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <section
        className="relative z-1 grid h-full min-h-0 place-items-center overflow-hidden p-8 max-[720px]:p-6"
      >
        <form className="z-10 grid w-full max-w-110 min-w-0 gap-6 rounded-md border-2 border-rust-500 bg-white p-7.5 shadow-[0_14px_38px_rgba(16,21,31,0.09)] max-[720px]:w-[calc(100vw-48px)] max-[720px]:gap-4 max-[720px]:px-5 max-[720px]:py-6" onSubmit={handleSubmit}>
          <div className="hidden items-center justify-center gap-2.5 text-ink-950 max-[720px]:flex">
            <BrandLogo className="size-13" />
            <strong className="text-[17px] font-bold">FERRETERIA FYF</strong>
          </div>
          <div>
            <h2 className="m-0 text-2xl font-bold text-ink-950">Iniciar sesión</h2>
            <p className="mt-1.5 mb-0 text-sm text-slate-500">Ingresa con tu cuenta institucional para continuar.</p>
          </div>

          <label>
            Correo electrónico
            <span className="relative block">
              <Mail className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-[#8d97a4]" size={17} />
              <input
                className="pl-9.75"
                type="email"
                value={correo}
                onChange={(event) => {
                  clearExpiredSessionMessage();
                  setCorreo(event.target.value);
                }}
                placeholder="correo@ejemplo.cl"
                autoComplete="username"
                required
              />
            </span>
          </label>

          <label>
            Contraseña
            <span className="relative block">
              <LockKeyhole className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-[#8d97a4]" size={17} />
              <input
                className="pl-9.75"
                type="password"
                value={password}
                onChange={(event) => {
                  clearExpiredSessionMessage();
                  setPassword(event.target.value);
                }}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                required
              />
            </span>
          </label>

          <button className="mt-0.5 w-full" type="submit" disabled={loading}>
            Ingresar
          </button>
        </form>
      </section>
    </main>
  );
}
