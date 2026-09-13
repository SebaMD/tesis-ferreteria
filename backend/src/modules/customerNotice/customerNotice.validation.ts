type NoticeInput = { title: string; message: string; active: boolean };
type Result = { success: true; value: NoticeInput } | { success: false; error: string };

export function validateCustomerNotice(body: unknown): Result {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Debe ingresar los datos del aviso" };
  }
  const input = body as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["title", "message", "active"].includes(key))) {
    return { success: false, error: "El aviso contiene campos no permitidos" };
  }
  if (typeof input.title !== "string" || input.title.trim().length > 120) {
    return { success: false, error: "El titulo no puede superar 120 caracteres" };
  }
  if (typeof input.message !== "string" || input.message.trim().length > 1000) {
    return { success: false, error: "El mensaje no puede superar 1000 caracteres" };
  }
  if (typeof input.active !== "boolean") {
    return { success: false, error: "El estado del aviso no es valido" };
  }
  const title = input.title.trim().replace(/\s+/g, " ");
  const message = input.message.trim();
  if (input.active && (!title || !message)) {
    return { success: false, error: "Un aviso activo necesita titulo y mensaje" };
  }
  return { success: true, value: { title, message, active: input.active } };
}
