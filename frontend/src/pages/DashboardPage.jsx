import { useAuth } from "../context/AuthContext.jsx";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Inicio</h1>
          <p>Panel minimo para probar el backend de la ferreteria.</p>
        </div>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <span>Usuario</span>
          <strong>
            {user?.names} {user?.surnames}
          </strong>
        </article>
        <article className="summary-card">
          <span>Rol</span>
          <strong>{user?.role}</strong>
        </article>
        <article className="summary-card">
          <span>Correo</span>
          <strong>{user?.correo}</strong>
        </article>
      </div>
    </section>
  );
}
