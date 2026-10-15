import { Mail, MapPin, MessageCircle, Phone, ShoppingCart } from "lucide-react";
import { useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { getStoreContactDetails, RETURNS_INFORMATION } from "../helpers/storeInformation.js";
import { panelClass } from "../helpers/uiClasses.js";

const CONTACT_ICONS = { phone: Phone, whatsapp: MessageCircle, email: Mail, address: MapPin };

export default function ReturnsInformationPage() {
  const contacts = getStoreContactDetails();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-5 px-6 py-8 max-[720px]:px-4">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="m-0 text-2xl font-bold text-ink-950 max-[520px]:text-xl">Cambios y devoluciones</h1>
          <Link className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 text-sm font-bold text-rust-600 no-underline max-[720px]:hidden" to="/catalog">
            <ShoppingCart size={17} aria-hidden="true" /> Volver al catálogo
          </Link>
        </div>
        <p className="m-0 text-sm leading-6 text-slate-600">Información para distinguir tus derechos legales de las opciones comerciales de la ferretería.</p>
      </header>
      {RETURNS_INFORMATION.map(section => <section className={panelClass} key={section.title}>
        <h2 className="m-0 text-lg font-bold text-ink-950">{section.title}</h2>
        {section.paragraphs.map(text => <p className="m-0 text-sm leading-6 text-slate-600" key={text}>{text}</p>)}
      </section>)}
      {contacts.length > 0 && <section className={panelClass} aria-label="Contacto y ubicación">
        <h2 className="m-0 text-lg font-bold text-ink-950">Contacto y ubicación</h2>
        <dl className="m-0 grid gap-3 min-[620px]:grid-cols-2">{contacts.map(contact => {
          const Icon = CONTACT_ICONS[contact.kind];
          return <div className="grid min-w-0 content-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3" key={contact.kind}>
            <dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><Icon size={16} aria-hidden="true" />{contact.label}</dt>
            <dd className="m-0 grid min-w-0 gap-2 text-sm text-ink-950">
              <span className="break-words">{contact.text}</span>
              <a className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-slate-300 bg-white px-3 text-xs font-bold text-ink-700 no-underline hover:bg-slate-100" href={contact.href} target={contact.external ? "_blank" : undefined} rel={contact.external ? "noopener noreferrer" : undefined}>{contact.action}</a>
              {contact.kind === "address" && <span className="text-xs leading-5 text-slate-500">La búsqueda usa esta dirección de referencia y no identifica necesariamente la entrada exacta del local.</span>}
            </dd>
          </div>;
        })}</dl>
      </section>}
      <p className="m-0 text-xs leading-5 text-slate-500">Información legal de referencia: <a href="https://www.sernac.cl/portal/604/w3-article-89178.html" target="_blank" rel="noreferrer" className="text-rust-600 underline">SERNAC: garantía legal y retracto en comercio electrónico</a> y <a href="https://www.sernac.cl/portal/618/articles-84009_archivo_01.pdf" target="_blank" rel="noreferrer" className="text-rust-600 underline">dictamen sobre plazos y ejercicio del retracto</a>. La revisión de una solicitud concreta corresponde a la atención de la ferretería, respetando los derechos legales aplicables.</p>
    </main>
  );
}
