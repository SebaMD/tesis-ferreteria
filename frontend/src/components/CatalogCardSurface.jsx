export default function CatalogCardSurface({ children }) {
  return <article className="group relative grid min-h-full min-w-0 grid-rows-[220px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_2px_12px_rgba(16,21,31,0.05)] transition hover:-translate-y-0.5 hover:border-rust-200 hover:shadow-[0_8px_24px_rgba(16,21,31,0.09)] max-[600px]:grid-rows-[140px_1fr] max-[380px]:grid-rows-[124px_1fr]">{children}</article>;
}
