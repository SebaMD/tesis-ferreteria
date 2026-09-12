import { ArrowRight, CheckCircle2, Clock3, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
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
  const fromRegistration = Boolean(location.state?.fromRegistration);
  const destination = typeof location.state?.from === "string" && location.state.from.startsWith("/")
    ? location.state.from
    : "/catalog";

  useEffect(() => {
    if (fromRegistration) window.scrollTo({ top: 0, behavior: "auto" });
  }, [fromRegistration]);

  const handleVerified = (session) => {
    replaceSession(session);
    setVerified(true);
  };

  return (
    <main className="mx-auto grid w-full max-w-180 gap-5 px-6 py-8 max-[720px]:px-3.5">
      {fromRegistration && !verified && (
        <section className="grid gap-4 rounded-lg border border-positive-200 bg-white p-6 shadow-sm max-[520px]:p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-positive-50 text-positive-600"><CheckCircle2 size={25} /></span>
            <div>
              <h1 className="m-0 text-2xl font-bold text-ink-950 max-[520px]:text-xl">Tu cuenta fue creada con éxito</h1>
              <p className="mt-2 mb-0 text-sm leading-6 text-slate-600">Ahora falta verificar tu correo electrónico. Ya enviamos un código y puedes ingresarlo a continuación.</p>
              <strong className="mt-2 block break-all text-sm text-ink-950">{user.correo}</strong>
            </div>
          </div>
        </section>
      )}
      {(!fromRegistration || verified) && (
        <div>
          <div>
            <h1 className="m-0 flex items-center gap-2 text-2xl font-bold text-ink-950"><MailCheck size={25} /> Verifica tu correo</h1>
            <p className="mt-1.5 mb-0 text-sm text-slate-500">Confirma tu correo una sola vez para poder iniciar compras.</p>
          </div>
        </div>
      )}
      <EmailVerificationPanel
        key={user.correo}
        email={user.correo}
        initialChallenge={location.state?.initialChallenge || null}
        requestCode={requestClientEmailVerification}
        verifyCode={verifyClientEmail}
        onVerified={handleVerified}
        verified={verified}
        description={fromRegistration && !verified
          ? "Ingresa el código de 6 dígitos enviado al crear tu cuenta."
          : "Te enviaremos un código de 6 dígitos."}
      />
      {verified ? (
        <button className="w-fit max-[480px]:w-full" type="button" onClick={() => navigate(destination, { replace: true })}>
          Continuar <ArrowRight size={17} />
        </button>
      ) : fromRegistration ? (
        <button className="w-fit border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[480px]:w-full" type="button" onClick={() => navigate(destination, { replace: true })}><Clock3 size={17} /> Verificar más tarde</button>
      ) : (
        <p className="m-0 text-xs leading-5 text-slate-500">Puedes navegar por el catálogo e iniciar sesión normalmente. La verificación se exigirá solamente antes de una nueva compra.</p>
      )}
      {(!fromRegistration || verified) && <Link className="text-sm font-bold text-rust-600" to="/catalog">Volver al catálogo</Link>}
    </main>
  );
}
