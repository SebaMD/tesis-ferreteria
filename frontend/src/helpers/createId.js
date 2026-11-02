// UUID v4 for draft identities and idempotent commands. Never weaken randomness
// when randomUUID is unavailable on HTTP origins (getRandomValues still works).
export function createId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === "function") return cryptoProvider.randomUUID();
  if (typeof cryptoProvider?.getRandomValues !== "function") {
    throw new Error("Este navegador no dispone de generación segura de identificadores. Actualízalo o utiliza HTTPS.");
  }
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
