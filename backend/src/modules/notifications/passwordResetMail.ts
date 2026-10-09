import { FRONTEND_URL } from "../../config/configEnv.js";
import type { MailContent } from "./notifications.service.js";
import { escapeMailHtml } from "./purchaseConfirmedMail.js";

export function buildPasswordResetMail(token: string, expiresInMinutes: number): MailContent {
  const url = new URL("/reset-password", FRONTEND_URL);
  url.searchParams.set("token", token);
  const resetUrl = url.toString();
  const safeUrl = escapeMailHtml(resetUrl);

  return {
    subject: "Restablece tu contraseña · Ferretería FYF",
    text: [
      "Ferretería FYF",
      "",
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta.",
      `Abre este enlace dentro de los próximos ${expiresInMinutes} minutos:`,
      resetUrl,
      "",
      "El enlace puede utilizarse una sola vez.",
      "Si no solicitaste este cambio, puedes ignorar este correo.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4f6;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr><td style="padding:20px 24px;background:#9a3412;color:#ffffff;font-size:19px;font-weight:800;">FERRETERÍA FYF</td></tr>
          <tr><td style="padding:26px 24px;">
            <h1 style="margin:0 0 12px;font-size:21px;">Restablece tu contraseña</h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4b5563;">Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
            <p style="margin:0 0 22px;text-align:center;"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:5px;font-weight:700;">Crear nueva contraseña</a></p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Este enlace vence en ${expiresInMinutes} minutos y puede utilizarse una sola vez. Si no solicitaste el cambio, ignora este correo.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
