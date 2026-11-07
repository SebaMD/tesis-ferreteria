type Identifiers = { token?: string; buyOrder: string; sessionId: string };
export type WebpayReturn =
  | { kind: "authorization"; token: string }
  | ({ kind: "cancelled" | "expired" | "error" } & Identifiers)
  | { kind: "invalid" };

// GET/POST vary by API version/environment, not by financial outcome.
export function classifyWebpayReturn(body: unknown, query: unknown): WebpayReturn {
  const limits: Record<string, number> = { token_ws: 64, TBK_TOKEN: 64, TBK_ID_SESION: 61, TBK_ORDEN_COMPRA: 26 };
  const values: Record<string, string> = {};
  for (const source of [body, query]) {
    if (source === undefined || source === null) continue;
    if (typeof source !== "object" || Array.isArray(source)) return { kind: "invalid" };
    for (const [key, value] of Object.entries(source)) {
      if (!Object.hasOwn(limits, key) || typeof value !== "string" || !value || value !== value.trim()
        || value.length > limits[key] || /[\u0000-\u001f\u007f]/.test(value)
        || (values[key] !== undefined && values[key] !== value)) return { kind: "invalid" };
      values[key] = value;
    }
  }
  const token = values.token_ws, aborted = values.TBK_TOKEN;
  const buyOrder = values.TBK_ORDEN_COMPRA, sessionId = values.TBK_ID_SESION;
  if (token && !aborted && !buyOrder && !sessionId) return { kind: "authorization", token };
  if (!buyOrder || !sessionId) return { kind: "invalid" };
  if (token && aborted && token === aborted) return { kind: "error", token, buyOrder, sessionId };
  if (token) return { kind: "invalid" };
  if (aborted) return { kind: "cancelled", token: aborted, buyOrder, sessionId };
  return { kind: "expired", buyOrder, sessionId };
}
