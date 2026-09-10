import { ArrowRight, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import useAuth from "../hooks/useAuth.js";
import {
  requestClientEmailVerification,
  verifyClientEmail,
} from "../services/emailVerification.service.js";

export default function ClientEmailVerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, replaceSession } = useAuth();
  const [verified, setVerified] = useState(Boolean(user?.emailVerifiedAt || user?.emailVerified));
  const destination = typeof location.state?.from === "string" && location.state.from.startsWith("/")
    ? location.state.from
    : "/catalog";

  const handleVerified = (session) => {
    replaceSession(session);
    setVerified(true);
  };

  return (
    <main className="mx-auto grid w-full max-w-180 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <div>
        <h1 className="m-0 flex items-center gap-2 text-2xl font-bold text-ink-950"><MailCheck size={25} /> Verifica tu correo</h1>
        <p className="mt-1.5 mb-0 text-sm text-slate-500">Confirma tu correo una sola vez para poder iniciar compras.</p>
      </div>
      <EmailVerificationPanel
        key={user.correo}
        email={user.correo}
        initialChallenge={location.state?.initialChallenge || null}
        requestCode={requestClientEmailVerification}
        verifyCode={verifyClientEmail}
        onVerified={handleVerified}
        verified={verified}
      />
      {verified ? (
        <button className="w-fit max-[480px]:w-full" type="button" onClick={() => navigate(destination, { replace: true })}>
          Continuar <ArrowRight size={17} />
        </button>
      ) : (
        <p className="m-0 text-xs leading-5 text-slate-500">Puedes navegar por el catálogo e iniciar sesión normalmente. La verificación se exigirá solamente antes de una nueva compra.</p>
      )}
      <Link className="text-sm font-bold text-rust-600" to="/catalog">Volver al catálogo</Link>
    </main>
  );
}
