import { LogOut, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import BrandLogo from "../components/BrandLogo.jsx";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import useAuth from "../hooks/useAuth.js";
import { requestInternalEmailVerification, verifyInternalEmail } from "../services/emailVerification.service.js";

const INTERNAL_ROLES = new Set(["MANAGER", "CASHIER", "WAREHOUSE"]);

export default function InternalEmailVerificationPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, replaceSession, logout } = useAuth();
  const [initialChallenge, setInitialChallenge] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !INTERNAL_ROLES.has(user?.role) || !user?.requiresEmailVerification) {
      return undefined;
    }
    let active = true;
    requestInternalEmailVerification()
      .then((challenge) => {
        if (active) setInitialChallenge({ ...challenge, sent: true });
      })
      .catch((error) => {
        if (active) toast.error(getApiError(error, "No se pudo enviar el código de verificación"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAuthenticated, user?.requiresEmailVerification, user?.role]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!INTERNAL_ROLES.has(user?.role)) return <Navigate to={user?.role === "CLIENT" ? "/catalog" : "/dashboard"} replace />;
  if (!user?.requiresEmailVerification) return <Navigate to="/dashboard" replace />;

  const handleVerified = (session) => {
    replaceSession(session);
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f6f7] px-4 py-8">
      <ThemeToggle className="fixed top-3 right-3 z-50" showLabel />
      <section className="grid w-full max-w-145 gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(16,21,31,0.12)] max-[520px]:p-4">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-12" />
          <div>
            <span className="text-xs font-bold text-rust-600">FERRETERÍA FYF</span>
            <h1 className="m-0 mt-1 flex items-center gap-2 text-xl font-bold text-ink-950"><MailCheck size={22} /> Verifica tu correo</h1>
          </div>
        </div>
        <p className="m-0 text-sm leading-6 text-slate-600">Antes de ingresar al sistema interno, confirma que tienes acceso a <strong className="break-all text-ink-950">{user.correo}</strong>.</p>
        {loading ? (
          <p className="m-0 rounded-md bg-slate-100 p-4 text-sm text-slate-600" role="status">Preparando la verificación…</p>
        ) : (
          <EmailVerificationPanel
            key={initialChallenge?.challengeId || user.correo}
            email={user.correo}
            initialChallenge={initialChallenge}
            requestCode={requestInternalEmailVerification}
            verifyCode={verifyInternalEmail}
            onVerified={handleVerified}
            title="Código de acceso por correo"
            description="Ingresa el código de 6 dígitos. Puedes solicitar uno nuevo cuando termine el tiempo de espera."
          />
        )}
        <button className="w-fit border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={logout}><LogOut size={17} /> Cerrar sesión</button>
      </section>
    </main>
  );
}
