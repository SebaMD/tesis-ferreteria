import type { MailContent } from "./notifications.service.js";

export function buildEmailVerificationMail(pin: string, expiresInMinutes: number): MailContent {
  return {
    subject: "Verifica tu correo · Ferreteria FYF",
    text: [
      "Ferreteria FYF",
      "",
      `Tu codigo de verificacion es: ${pin}`,
      `El codigo vence en ${expiresInMinutes} minutos.`,
      "Si no solicitaste este codigo, puedes ignorar este mensaje.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
          <div style="background:#9a3412;color:#fff;padding:18px 22px;font-size:18px;font-weight:700">FERRETERIA FYF</div>
          <div style="padding:24px 22px">
            <h1 style="font-size:20px;margin:0 0 12px">Verifica tu correo</h1>
            <p style="margin:0 0 18px">Ingresa este codigo para confirmar que tienes acceso al correo:</p>
            <div style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:14px">${pin}</div>
            <p style="margin:18px 0 0;font-size:14px;color:#64748b">El codigo vence en ${expiresInMinutes} minutos. Si no lo solicitaste, puedes ignorar este mensaje.</p>
          </div>
        </div>
      </div>
    `,
  };
}
