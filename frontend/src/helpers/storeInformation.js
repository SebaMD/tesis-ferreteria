// Publicar cada dato solo cuando FYF lo autorice. Teléfonos con código de país.
// Para confirmar la dirección, verificar también que la búsqueda de Maps corresponda al local.
export const FYF_CONTACT = Object.freeze({
  phone: null,
  whatsapp: null,
  email: null,
  address: "Cañete & Pedro Aguirre Cerda, Santa Juana, Bío Bío, Chile",
  confirmed: Object.freeze({ phone: false, whatsapp: false, email: false, address: false }),
});

export const RETURNS_INFORMATION = [
  {
    title: "Garantía legal",
    paragraphs: [
      "Si un producto nuevo presenta una falla cubierta por la garantía legal, puedes elegir su cambio, la reparación gratuita o la devolución de lo pagado. Para compras online, el plazo legal es de seis meses desde la recepción del producto.",
      "Estos derechos no dependen de la aceptación de un cambio voluntario ni de una evaluación comercial discrecional.",
    ],
  },
  {
    title: "Retracto en compras online",
    paragraphs: [
      "En los casos previstos por la ley, puedes desistir de una compra online dentro del plazo general de diez días corridos desde que recibes el producto, sin necesidad de que presente una falla.",
      "Si el proveedor no envía la confirmación escrita del contrato, el plazo para ejercer el retracto se extiende a noventa días corridos desde la recepción del producto.",
      "Puedes comunicar tu decisión de ejercer el retracto por los mismos medios que utilizaste para celebrar el contrato, sin necesidad de expresar un motivo. No se exige acudir al local para comunicar el retracto de una compra online.",
      "Las condiciones y excepciones son las establecidas por la normativa vigente. Esta página no establece exclusiones comerciales adicionales.",
    ],
  },
  {
    title: "Cambios voluntarios por preferencia",
    paragraphs: [
      "Los cambios por gusto o preferencia, distintos de la garantía legal y del retracto aplicable, quedan sujetos a la política comercial y a la evaluación de la ferretería. No se fijan aquí plazos ni condiciones comerciales que FYF no haya confirmado.",
      "Esa evaluación no limita los derechos legales que correspondan al comprador.",
    ],
  },
  {
    title: "Cómo solicitar atención",
    paragraphs: [
      "FYF atenderá las consultas de cambios y devoluciones en el local, por WhatsApp o por teléfono. Al solicitar atención, identifica la compra, el producto y la cantidad involucrada, y explica la situación.",
      "La atención se coordina con la ferretería. Esta página no inicia una devolución ni realiza un reembolso automático, y no limita los medios legales para ejercer el retracto.",
    ],
  },
];

export function getStoreContactDetails(contact = FYF_CONTACT) {
  const details = [];
  const phone = value => typeof value === "string" && /^\+?\d{8,15}$/.test(value.trim()) ? value.trim() : null;
  const telephone = phone(contact.phone), whatsapp = phone(contact.whatsapp);
  if (contact.confirmed?.phone === true && telephone) details.push({ kind: "phone", label: "Teléfono", text: telephone, href: `tel:${telephone}`, action: "Llamar" });
  if (contact.confirmed?.whatsapp === true && whatsapp) details.push({ kind: "whatsapp", label: "WhatsApp", text: whatsapp, href: `https://wa.me/${whatsapp.replace(/^\+/, "")}`, action: "WhatsApp", external: true });
  const email = typeof contact.email === "string" ? contact.email.trim() : "";
  if (contact.confirmed?.email === true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) details.push({ kind: "email", label: "Correo", text: email, href: `mailto:${email}`, action: "Enviar correo" });
  if (contact.confirmed?.address === true && typeof contact.address === "string" && contact.address.trim()) {
    const address = contact.address.trim();
    const query = new URLSearchParams({ api: "1", query: address });
    details.push({ kind: "address", label: "Dirección de referencia", text: address, href: `https://www.google.com/maps/search/?${query}`, action: "Abrir en Google Maps", external: true });
  }
  return details;
}
