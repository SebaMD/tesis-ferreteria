import { CheckCircle2, LogIn, ShoppingBag, UserPlus } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";

export default function CheckoutChoicePage() {
  const { isAuthenticated, user } = useAuth();
  const { items } = useCart();

  if (isAuthenticated && user?.role === "CLIENT") return <Navigate to="/checkout" replace />;
  if (items.length === 0) return <Navigate to="/cart" replace />;

  return (
    <main className="mx-auto grid w-full max-w-220 gap-5 px-6 py-10 max-[720px]:px-3.5">
      <div className="text-center">
        <h1 className="m-0 text-2xl font-bold text-ink-950">¿Cómo quieres continuar?</h1>
        <p className="mt-2 mb-0 text-sm text-slate-500">
          Puedes comprar sin crear una cuenta o ingresar para reutilizar tus datos.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 max-[720px]:grid-cols-1">
        <article className="grid content-start gap-4 rounded-lg border-2 border-rust-500 bg-white p-6 shadow-sm">
          <ShoppingBag className="text-rust-600" size={32} />
          <div>
            <h2 className="m-0 text-xl font-bold text-ink-950">Continuar como invitado</h2>
            <p className="mt-1.5 mb-0 text-sm leading-6 text-slate-500">
              Finaliza la compra sin contraseña ni cuenta. Usaremos tu correo para enviarte el seguimiento.
            </p>
          </div>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/checkout?mode=guest">
            Continuar como invitado
          </Link>
        </article>

        <article className="grid content-start gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="m-0 text-xl font-bold text-ink-950">Usar una cuenta de cliente</h2>
            <ul className="mt-3 mb-0 grid list-none gap-2 p-0 text-sm text-slate-600">
              <li className="flex items-center gap-2"><CheckCircle2 className="text-positive-600" size={17} /> Guardar tu dirección.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="text-positive-600" size={17} /> Consultar todos tus pedidos.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="text-positive-600" size={17} /> Reutilizar tus datos.</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2 max-[430px]:grid-cols-1">
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/login" state={{ from: "/checkout" }}>
              <LogIn size={17} /> Iniciar sesión
            </Link>
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-slate-300 px-4 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100" to="/register" state={{ from: "/checkout" }}>
              <UserPlus size={17} /> Crear cuenta
            </Link>
          </div>
        </article>
      </section>

      <Link className="justify-self-center text-sm font-bold text-rust-600" to="/cart">Volver al carrito</Link>
    </main>
  );
}
