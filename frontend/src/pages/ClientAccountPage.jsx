import { Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import useAuth from "../hooks/useAuth.js";

export default function ClientAccountPage() {
  const { user } = useAuth();

  return (
    <main className="mx-auto grid w-full max-w-220 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <div>
        <h1 className="m-0 text-2xl font-bold text-ink-950">Mi cuenta</h1>
        <p className="mt-1.5 mb-0 text-sm text-slate-500">Información básica de tu cuenta de cliente.</p>
      </div>
      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm max-[620px]:p-4">
        <div className="flex items-center gap-4 border-b border-slate-200 pb-5">
          <span className="grid size-14 place-items-center rounded-full bg-rust-50 text-rust-600"><UserRound size={27} /></span>
          <div>
            <strong className="block text-lg text-ink-950">{user.names} {user.surnames}</strong>
            <span className="text-xs font-bold text-positive-600">Cuenta activa</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 max-[620px]:grid-cols-1">
          <div className="rounded-[5px] bg-slate-50 p-4"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={16} /> RUT</dt><dd className="mt-2 ml-0 font-semibold text-ink-950">{user.rut}</dd></div>
          <div className="rounded-[5px] bg-slate-50 p-4"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><Mail size={16} /> Correo</dt><dd className="mt-2 ml-0 font-semibold text-ink-950">{user.correo}</dd></div>
          <div className="rounded-[5px] bg-slate-50 p-4"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><Phone size={16} /> Teléfono</dt><dd className="mt-2 ml-0 font-semibold text-ink-950">{user.phone || "No registrado"}</dd></div>
        </dl>
        <p className="m-0 text-xs leading-5 text-slate-500">Las direcciones y datos de entrega se solicitarán posteriormente al realizar un pedido, no forman parte de esta etapa.</p>
      </section>
    </main>
  );
}
