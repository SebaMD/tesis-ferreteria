import { DEMO_CATALOG_VERSION } from "./catalog.js";

export const DEMO_DATABASE_MARKER = `FYF_DISPOSABLE_DEMO:${DEMO_CATALOG_VERSION}`;
export const LOCAL_ONCE_PREFIX = "FYF_LOCAL_DEMO_ONCE:";
export const ACADEMIC_ONCE_PREFIX = "FYF_ACADEMIC_DEMO_ONCE:";
export function academicTargetFromEnvironment() {
  return { name: process.env.SEED_ACADEMIC_DATABASE, host: process.env.SEED_ACADEMIC_HOST, port: process.env.SEED_ACADEMIC_PORT };
}

// Authorization only: this module NEVER deletes data, schemas or databases.
// The local exception needs a matching, ephemeral capability already placed in
// the exact database by the separately human-authorized reset operation.
export function authorizeDemoTarget(target: { name: string; comment: string | null },
  databaseUrl: string | undefined, oneTimeToken: string | undefined,
  academic?: { name?: string; host?: string; port?: string }): "new" | "loaded" {
  if (academic?.name || academic?.host || academic?.port) {
    const url = new URL(databaseUrl ?? "http://invalid");
    if (!academic.name || !academic.host || !academic.port || !/^[a-zA-Z0-9_]+$/.test(academic.name)
      || !["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== academic.host
      || (url.port || "5432") !== academic.port || decodeURIComponent(url.pathname.slice(1)) !== academic.name
      || target.name !== academic.name || url.search || url.hash) throw new Error("Identidad universitaria no coincide con la conexión explícita");
    if (target.comment === DEMO_DATABASE_MARKER) return "loaded";
    if (oneTimeToken && /^[a-f0-9]{64}$/.test(oneTimeToken) && target.comment === ACADEMIC_ONCE_PREFIX + oneTimeToken) return "new";
    throw new Error("La base universitaria requiere autorización efímera coincidente; no se reemplazan datos ni comentarios");
  }
  const disposable = /^fyf_(?:seed_)?demo_[a-z0-9_]+$/.test(target.name);
  let exactLocal = false;
  try {
    const url = new URL(databaseUrl ?? "");
    exactLocal = target.name === "ferreteria" && url.protocol === "postgresql:"
      && url.hostname === "localhost" && url.port === "5433" && url.pathname === "/ferreteria"
      && !url.search && !url.hash;
  } catch { /* An invalid URL never authorizes the local exception. */ }
  if (!disposable && !exactLocal) throw new Error("Destino rechazado: no es una base demo ni la conexión local expresamente autorizada");
  if (target.comment === DEMO_DATABASE_MARKER) return "loaded";
  if (exactLocal) {
    if (oneTimeToken && /^[a-f0-9]{64}$/.test(oneTimeToken)
      && target.comment === `${LOCAL_ONCE_PREFIX}${oneTimeToken}`) return "new";
    throw new Error("La carga local requiere autorización efímera de un solo uso; no se reinicia ni modifica la base");
  }
  if (target.comment) throw new Error("La base ya tiene otra identificación; no se reemplaza");
  return "new";
}
