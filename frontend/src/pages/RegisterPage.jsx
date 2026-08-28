import { Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import BrandLogo from "../components/BrandLogo.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import useAuth from "../hooks/useAuth.js";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, registerClient, user } = useAuth();
  const [form, setForm] = useState({
    rut: "",
    names: "",
    surnames: "",
    correo: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requestedPath = typeof location.state?.from === "string"
    && location.state.from.startsWith("/")
    && !location.state.from.startsWith("//")
    ? location.state.from
    : null;

  if (isAuthenticated) {
    return <Navigate to={user?.role === "CLIENT" ? requestedPath || "/catalog" : "/dashboard"} replace />;
  }

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!PASSWORD_REGEX.test(form.password)) {
      toast.error("La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    try {
      setLoading(true);
      await registerClient({
        rut: form.rut,
        names: form.names,
        surnames: form.surnames,
        correo: form.correo,
        phone: form.phone.trim() || null,
        password: form.password,
      });
      toast.success("Cuenta creada exitosamente");
      navigate(requestedPath || "/catalog");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo crear la cuenta"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f8f9] px-4 py-8">
      <LoadingOverlay active={loading} fullScreen />
      <div className="mx-auto grid w-full max-w-180 gap-6">
        <Link className="mx-auto flex items-center gap-2 text-ink-950 no-underline" to="/catalog">
          <BrandLogo className="size-13" />
          <strong>FERRETERIA FYF</strong>
        </Link>

        <form className="grid gap-5 rounded-lg border border-slate-200 bg-white p-7 shadow-[0_12px_36px_rgba(16,21,31,0.08)] max-[620px]:p-5" onSubmit={handleSubmit}>
          <div>
            <h1 className="m-0 text-2xl font-bold text-ink-950">Crear cuenta</h1>
            <p className="mt-1.5 mb-0 text-sm text-slate-500">Regístrate para comprar y consultar tus pedidos.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
            <label>
              Nombres
              <span className="relative block">
                <UserRound className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pl-9.75" value={form.names} onChange={(event) => updateField("names", event.target.value)} autoComplete="given-name" required />
              </span>
            </label>
            <label>
              Apellidos
              <input value={form.surnames} onChange={(event) => updateField("surnames", event.target.value)} autoComplete="family-name" required />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
            <label>
              RUT
              <input value={form.rut} onChange={(event) => updateField("rut", event.target.value)} placeholder="12345678-9" autoComplete="off" required />
            </label>
            <label>
              Teléfono (opcional)
              <span className="relative block">
                <Phone className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pl-9.75" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="+56912345678" autoComplete="tel" />
              </span>
            </label>
          </div>

          <label>
            Correo electrónico
            <span className="relative block">
              <Mail className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
              <input className="pl-9.75" type="email" value={form.correo} onChange={(event) => updateField("correo", event.target.value)} autoComplete="email" required />
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
            <label>
              Contraseña
              <span className="relative block">
                <LockKeyhole className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pr-12 pl-9.75" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => updateField("password", event.target.value)} autoComplete="new-password" required />
                <button
                  className="absolute top-1/2 right-1.5 grid size-9 min-h-0 -translate-y-1/2 place-items-center border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100 hover:text-ink-950"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label>
              Confirmar contraseña
              <span className="relative block">
                <LockKeyhole className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={17} />
                <input className="pr-12 pl-9.75" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} autoComplete="new-password" required />
                <button
                  className="absolute top-1/2 right-1.5 grid size-9 min-h-0 -translate-y-1/2 place-items-center border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100 hover:text-ink-950"
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
          </div>

          <p className="m-0 rounded-[5px] bg-rust-50 px-3 py-2 text-xs text-rust-700">
            La contraseña debe incluir una mayúscula, un número y un carácter especial.
          </p>

          <button className="w-full" type="submit" disabled={loading}>Crear cuenta</button>
          <p className="m-0 text-center text-sm text-slate-500">
            ¿Ya tienes una cuenta? <Link className="font-bold text-rust-600" to="/login" state={requestedPath ? { from: requestedPath } : undefined}>Inicia sesión</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
