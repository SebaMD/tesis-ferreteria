import { Link } from "react-router-dom";
import { getStoreContactDetails, RETURNS_INFORMATION } from "../helpers/storeInformation.js";
import { panelClass } from "../helpers/uiClasses.js";

export default function ReturnsInformationPage() {
  const contacts = getStoreContactDetails();
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-5 px-6 py-8 max-[720px]:px-4">
      <header>
        <Link className="text-sm font-semibold text-rust-600" to="/catalog">Volver al catálogo</Link>
        <h1 className="mb-2 text-2xl font-bold text-ink-950">Cambios y devoluciones</h1>
        <p className="m-0 text-sm leading-6 text-slate-600">Información para distinguir tus derechos legales de las opciones comerciales de la ferretería.</p>
      </header>
      {RETURNS_INFORMATION.map(section => <section className={panelClass} key={section.title}>
        <h2 className="m-0 text-lg font-bold text-ink-950">{section.title}</h2>
        {section.paragraphs.map(text => <p className="m-0 text-sm leading-6 text-slate-600" key={text}>{text}</p>)}
      </section>)}
      {contacts.length > 0 && <section className={panelClass} aria-label="Contacto de FYF">
        <h2 className="m-0 text-lg font-bold text-ink-950">Contacto de FYF</h2>
        <dl className="grid gap-3">{contacts.map(contact => <div key={contact.label}>
          <dt className="text-xs font-bold text-slate-500">{contact.label}</dt>
          <dd className="mt-1 ml-0 break-words text-sm text-ink-950">{contact.href ? <a className="font-semibold text-rust-600" href={contact.href}>{contact.text}</a> : contact.text}</dd>
        </div>)}</dl>
      </section>}
      <p className="m-0 text-xs leading-5 text-slate-500">Información legal de referencia: <a href="https://www.sernac.cl/portal/604/w3-article-89178.html" target="_blank" rel="noreferrer" className="text-rust-600 underline">SERNAC: garantía legal y retracto en comercio electrónico</a> y <a href="https://www.sernac.cl/portal/618/articles-84009_archivo_01.pdf" target="_blank" rel="noreferrer" className="text-rust-600 underline">dictamen sobre plazos y ejercicio del retracto</a>. La revisión de una solicitud concreta corresponde a la atención de la ferretería, respetando los derechos legales aplicables.</p>
    </main>
  );
}
