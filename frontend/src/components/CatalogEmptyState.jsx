import { Link } from "react-router-dom";

export default function CatalogEmptyState({ icon: Icon, title, children }) {
  return <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
    <div className="grid justify-items-center gap-3">
      <Icon size={46} className="text-slate-400" aria-hidden="true" />
      <strong className="text-lg text-ink-950">{title}</strong>
      <p className="m-0 max-w-130 text-sm leading-6 text-slate-500">{children}</p>
      <Link className="font-bold text-rust-600 hover:text-rust-700" to="/catalog">Explorar catálogo</Link>
    </div>
  </section>;
}
