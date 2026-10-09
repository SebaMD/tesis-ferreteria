import { CheckCircle2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";

function secondsUntil(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

export default function EmailVerificationPanel({
  email,
  requestCode,
  verifyCode,
  onVerified,
  initialChallenge = null,
  verified = false,
  title = "Verifica tu correo",
  description = "Te enviaremos un codigo de 6 digitos.",
}) {
  const [challenge, setChallenge] = useState(initialChallenge?.sent ? initialChallenge : null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    initialChallenge?.sent === false ? initialChallenge.message || "No se pudo enviar el codigo." : "",
  );
  const [resendAvailableAt, setResendAvailableAt] = useState(initialChallenge?.resendAvailableAt || null);
  const [remaining, setRemaining] = useState(() => secondsUntil(initialChallenge?.resendAvailableAt));

  useEffect(() => {
    if (!resendAvailableAt || remaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRemaining(secondsUntil(resendAvailableAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining, resendAvailableAt]);

  const maskedEmail = useMemo(() => email?.trim() || "tu correo", [email]);

  if (verified) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-positive-200 bg-positive-50 p-4 text-positive-700">
        <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
        <div><strong className="block text-sm">Correo verificado</strong><span className="text-xs">{maskedEmail}</span></div>
      </div>
    );
  }

  const handleRequest = async () => {
    if (busy || remaining > 0) return;
    setBusy(true);
    setError("");
    try {
      const nextChallenge = await requestCode();
      setChallenge(nextChallenge);
      setResendAvailableAt(nextChallenge.resendAvailableAt);
      setRemaining(secondsUntil(nextChallenge.resendAvailableAt));
      setPin("");
      toast.success("Codigo enviado. Revisa tu correo.");
    } catch (requestError) {
      const message = getApiError(requestError, "No se pudo enviar el codigo");
      const retryAfter = Number(requestError?.response?.data?.details?.retryAfterSeconds || 0);
      if (retryAfter > 0) {
        setResendAvailableAt(new Date(Date.now() + retryAfter * 1000).toISOString());
        setRemaining(retryAfter);
      }
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!challenge?.challengeId || busy || !/^\d{6}$/.test(pin)) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyCode({ challengeId: challenge.challengeId, pin });
      toast.success("Correo verificado correctamente");
      onVerified?.(result, challenge);
    } catch (verifyError) {
      const message = getApiError(verifyError, "No se pudo verificar el codigo");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-lg border border-rust-200 bg-rust-50 p-4" aria-labelledby="email-verification-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-rust-600"><ShieldCheck size={20} /></span>
        <div className="min-w-0">
          <h3 className="m-0 text-sm font-bold text-ink-950" id="email-verification-title">{title}</h3>
          <p className="mt-1 mb-0 text-xs leading-5 text-slate-600">{description}</p>
          <span className="mt-1 block truncate text-xs font-semibold text-ink-700">{maskedEmail}</span>
        </div>
      </div>

      {challenge ? (
        <form className="grid gap-3" onSubmit={handleVerify}>
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">
            Codigo de 6 digitos
            <input
              className="max-w-60 font-mono text-lg tracking-[0.28em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength="6"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              aria-describedby={error ? "email-verification-error" : undefined}
              required
            />
          </label>
          <div className="flex flex-wrap gap-2 max-[480px]:*:w-full">
            <button type="submit" disabled={busy || pin.length !== 6}>
              {busy ? <RefreshCw className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
              Verificar correo
            </button>
            <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={handleRequest} disabled={busy || remaining > 0}>
              <Mail size={17} /> {remaining > 0 ? `Reenviar en ${remaining}s` : "Reenviar codigo"}
            </button>
          </div>
        </form>
      ) : (
        <button className="w-fit max-[480px]:w-full" type="button" onClick={handleRequest} disabled={busy || !email?.trim()}>
          {busy ? <RefreshCw className="animate-spin" size={17} /> : <Mail size={17} />}
          {busy ? "Enviando..." : "Enviar codigo"}
        </button>
      )}

      {error && <p className="m-0 text-xs leading-5 text-critical-600" id="email-verification-error" role="alert">{error}</p>}
    </section>
  );
}
