import { LogOut, MailCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo.jsx";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import {
  clearInternalVerificationChallenge,
  readInternalVerificationChallenge,
  storeInternalVerificationChallenge,
} from "../helpers/session.js";
import useAuth from "../hooks/useAuth.js";
import { requestInternalEmailVerification, verifyInternalEmail } from "../services/emailVerification.service.js";

const INTERNAL_ROLES = new Set(["MANAGER", "CASHIER", "WAREHOUSE"]);

export default function InternalEmailVerificationPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, replaceSession, logout } = useAuth();
  const [initialChallenge] = useState(() => readInternalVerificationChallenge(user?.id));

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!INTERNAL_ROLES.has(user?.role)) return <Navigate to={user?.role === "CLIENT" ? "/catalog" : "/dashboard"} replace />;
  if (!user?.requiresEmailVerification) return <Navigate to="/dashboard" replace />;

  const handleVerified = (session) => {
    clearInternalVerificationChallenge();
    replaceSession(session);
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f6f7] px-4 py-8">
      <section className="grid w-full max-w-145 gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(16,21,31,0.12)] max-[520px]:p-4">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-12" />
          <div>
            <span className="text-xs font-bold text-rust-600">FERRETERÍA FYF</span>
            <h1 className="m-0 mt-1 flex items-center gap-2 text-xl font-bold text-ink-950"><MailCheck size={22} /> Verifica tu correo</h1>
          </div>
        </div>
        <p className="m-0 text-sm leading-6 text-slate-600">Antes de ingresar al sistema interno, confirma que tienes acceso a <strong className="break-all text-ink-950">{user.correo}</strong>.</p>
        <EmailVerificationPanel
          key={initialChallenge?.challengeId || user.correo}
          email={user.correo}
          initialChallenge={initialChallenge}
          requestCode={async () => {
            const challenge = await requestInternalEmailVerification();
            storeInternalVerificationChallenge(user.id, { ...challenge, sent: true });
            return challenge;
          }}
          verifyCode={verifyInternalEmail}
          onVerified={handleVerified}
          title="Código de acceso por correo"
          description={initialChallenge?.sent === false
            ? "No fue posible enviar el código automáticamente. Puedes intentarlo nuevamente con el botón inferior."
            : "Ingresa el código de 6 dígitos enviado al iniciar sesión. El reenvío es siempre manual."}
        />
        <button className="w-fit border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => { clearInternalVerificationChallenge(); logout(); }}><LogOut size={17} /> Cerrar sesión</button>
      </section>
    </main>
  );
}
