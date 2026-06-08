import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getApiError } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [correo, setCorreo] = useState("admin@gmail.com");
  const [password, setPassword] = useState("@dmin.2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ correo, password });
      navigate("/dashboard");
    } catch (err) {
      setError(getApiError(err, "No se pudo iniciar sesion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <h1>Ferreteria</h1>
        <p>Ingreso para pruebas del backend</p>

        {error && <div className="alert error">{error}</div>}

        <label>
          Correo
          <input value={correo} onChange={(event) => setCorreo(event.target.value)} placeholder="admin@gmail.com" />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="@dmin.2026"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Iniciar sesion"}
        </button>
      </form>
    </main>
  );
}
