import nodemailer, { type Transporter } from "nodemailer";
import {
  MAIL_ENABLED,
  MAIL_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "../../config/configEnv.js";
import { findActiveWarehouseEmails } from "./notifications.repository.js";

export type ClientOrderMailEvent =
  | "PURCHASE_CONFIRMED"
  | "PREPARATION_STARTED"
  | "READY_FOR_PICKUP"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

export type WarehouseMailEvent =
  | "NEW_ONLINE_ORDER_PAID"
  | "NEW_SALE_DELIVERY"
  | "READY_FOR_DELIVERY";

type MailContent = {
  subject: string;
  text: string;
};

let transporter: Transporter | null = null;
let configurationWarningPrinted = false;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function hasValidMailConfiguration() {
  const credentialsAreComplete = Boolean(SMTP_USER) === Boolean(SMTP_PASS);
  return Boolean(SMTP_HOST && MAIL_FROM && credentialsAreComplete);
}

function warnInvalidConfigurationOnce() {
  if (configurationWarningPrinted) return;
  configurationWarningPrinted = true;
  console.warn(
    "MAIL_ENABLED esta activo, pero faltan variables SMTP o las credenciales estan incompletas.",
  );
}

function getTransporter() {
  if (!MAIL_ENABLED) return null;
  if (!hasValidMailConfiguration()) {
    warnInvalidConfigurationOnce();
    return null;
  }
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS
      ? { user: SMTP_USER, pass: SMTP_PASS }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

async function sendMailBestEffort(to: string, content: MailContent) {
  const currentTransporter = getTransporter();
  if (!currentTransporter || !MAIL_FROM || !to.trim()) return;

  try {
    await currentTransporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: content.subject,
      text: content.text,
    });
  } catch (error) {
    console.error(`No se pudo enviar el correo "${content.subject}": ${errorMessage(error)}`);
  }
}

function clientOrderContent(
  folio: string,
  event: ClientOrderMailEvent,
  trackingUrl?: string,
  recipientType: "CLIENT" | "GUEST" = "CLIENT",
): MailContent {
  const trackingText = trackingUrl
    ? ` Puedes seguir el pedido de forma segura en: ${trackingUrl}`
    : recipientType === "GUEST"
      ? " Conserva el enlace seguro mostrado al finalizar la compra para consultar su estado."
      : " Puedes revisar su estado en Mis pedidos.";
  const content: Record<ClientOrderMailEvent, MailContent> = {
    PURCHASE_CONFIRMED: {
      subject: `${folio}: compra confirmada`,
      text: `El pago de tu pedido ${folio} fue confirmado.${trackingText}`,
    },
    PREPARATION_STARTED: {
      subject: `${folio}: comenzamos a preparar tu pedido`,
      text: `Estamos preparando tu pedido ${folio}.${trackingText}`,
    },
    READY_FOR_PICKUP: {
      subject: `${folio}: pedido listo para retirar`,
      text: `Tu pedido ${folio} esta listo para retirar en FERRETERIA FYF.${trackingText}`,
    },
    READY_FOR_DELIVERY: {
      subject: `${folio}: pedido listo para despacho`,
      text: `Tu pedido ${folio} esta preparado y listo para iniciar su despacho.${trackingText}`,
    },
    OUT_FOR_DELIVERY: {
      subject: `${folio}: pedido en reparto`,
      text: `Tu pedido ${folio} va en camino a la direccion indicada.${trackingText}`,
    },
    DELIVERED: {
      subject: `${folio}: pedido entregado`,
      text: `Tu pedido ${folio} fue entregado. Gracias por comprar en FERRETERIA FYF.${trackingText}`,
    },
  };
  return content[event];
}

function warehouseContent(folio: string, event: WarehouseMailEvent): MailContent {
  const content: Record<WarehouseMailEvent, MailContent> = {
    NEW_ONLINE_ORDER_PAID: {
      subject: `${folio}: nuevo pedido pendiente de preparacion`,
      text: `El pedido online ${folio} fue pagado y esta pendiente de preparacion.`,
    },
    NEW_SALE_DELIVERY: {
      subject: `${folio}: nueva venta en caja con despacho`,
      text: `La venta ${folio} genero una entrega pendiente de preparacion.`,
    },
    READY_FOR_DELIVERY: {
      subject: `${folio}: disponible para reparto`,
      text: `El pedido ${folio} esta preparado y disponible para iniciar reparto.`,
    },
  };
  return content[event];
}

export async function notifyClientOrderBestEffort(input: {
  email: string;
  folio: string;
  event: ClientOrderMailEvent;
  trackingUrl?: string;
  recipientType?: "CLIENT" | "GUEST";
}) {
  if (!MAIL_ENABLED) return;
  await sendMailBestEffort(
    input.email,
    clientOrderContent(input.folio, input.event, input.trackingUrl, input.recipientType),
  );
}

export async function notifyWarehousesBestEffort(input: {
  folio: string;
  event: WarehouseMailEvent;
}) {
  if (!MAIL_ENABLED) return;

  try {
    const emails = await findActiveWarehouseEmails();
    await Promise.allSettled(
      emails.map((email) => sendMailBestEffort(email, warehouseContent(input.folio, input.event))),
    );
  } catch (error) {
    console.error(`No se pudieron obtener destinatarios WAREHOUSE: ${errorMessage(error)}`);
  }
}
