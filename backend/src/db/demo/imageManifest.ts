import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { demoProducts } from "./catalog.js";
import { validateImageBuffer } from "../../utils/imageFiles.js";

export type DemoImageEntry = {
  productKey: string; file: string; sha256: string; sourceDocument: string; sourcePage: number;
  rightsStatus: string; publish: boolean; sourceUrl?: string;
  assetKind?: string; identitySha256?: string;
  authorization?: { reference: string; scope: string; evidenceFile?: string; evidenceSha256?: string };
};
type Article = typeof demoProducts[number];
export const imageHash = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");
export function demoImageIdentity(article: Article) {
  return imageHash(JSON.stringify([article.key, article.name, article.brand, article.model,
    article.specification, article.unitMeasure, article.source.document, article.source.page]));
}
export function imageIsAuthorized(entry: DemoImageEntry) {
  return entry.publish === true && entry.rightsStatus === "AUTHORIZED" && entry.authorization?.scope === "academic-web"
    && typeof entry.authorization.reference === "string" && entry.authorization.reference.trim().length >= 8;
}
export async function readDemoImageManifest(root: string) {
  const sourceRoot = await realpath(root);
  const entries: DemoImageEntry[] = JSON.parse(await readFile(path.join(sourceRoot, "extracted-images.json"), "utf8"));
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error("Manifiesto inválido");
  const seen = new Set<string>();
  const originalHashes = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.productKey !== "string" || seen.has(entry.productKey)) throw new Error("Clave de imagen inexistente o duplicada");
    seen.add(entry.productKey);
    const article = demoProducts.find(p => p.key === entry.productKey);
    if (!article) throw new Error("Imagen ajena al catálogo demo");
    if (entry.identitySha256 !== undefined && entry.identitySha256 !== demoImageIdentity(article)) throw new Error(`Identidad/medida de imagen incompatible: ${article.key}`);
    if (entry.assetKind === "ORIGINAL_REFERENCE_CARD" && !entry.identitySha256) throw new Error("Ficha referencial sin identidad de SKU");
    if (entry.assetKind === "ORIGINAL_REFERENCE_CARD") {
      if (originalHashes.has(entry.sha256)) throw new Error("Ficha referencial repetida entre SKU distintos");
      originalHashes.add(entry.sha256);
    }
  }
  return { sourceRoot, entries };
}
export async function readDemoImageFile(sourceRoot: string, entry: DemoImageEntry, article: Article) {
  if (entry.sourceDocument !== article.source.document || entry.sourcePage !== article.source.page
    || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.file !== "string"
    || entry.file.includes("\\") || path.isAbsolute(entry.file) || entry.file.split("/").some(p => !p || p === ".." || p === ".")) throw new Error(`Procedencia o ruta inválida: ${article.key}`);
  const source = await realpath(path.join(sourceRoot, entry.file));
  const relative = path.relative(sourceRoot, source);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Imagen fuera del paquete aprobado");
  const buffer = await readFile(source);
  if (imageHash(buffer) !== entry.sha256) throw new Error(`Hash de imagen incorrecto: ${article.key}`);
  const { extension } = await validateImageBuffer(buffer);
  if (entry.assetKind === "ORIGINAL_REFERENCE_CARD") {
    const evidencePath = await realpath(path.join(sourceRoot, "rights-evidence.json"));
    const evidenceRelative = path.relative(sourceRoot, evidencePath);
    if (evidenceRelative.startsWith("..") || path.isAbsolute(evidenceRelative)) throw new Error("Evidencia fuera del paquete aprobado");
    if (entry.authorization?.evidenceFile !== "rights-evidence.json" || !entry.authorization.evidenceSha256
      || imageHash(await readFile(evidencePath)) !== entry.authorization.evidenceSha256) throw new Error("Evidencia de autoría original ausente o alterada");
  }
  return { buffer, extension };
}

// File-only preflight. Does not import the DB client, open a socket or write files.
export async function checkDemoImagePackage(root: string) {
  const { sourceRoot, entries } = await readDemoImageManifest(root);
  const results = [];
  for (const article of demoProducts) {
    const entry = entries.find(e => e.productKey === article.key);
    if (!entry) { results.push({ productKey: article.key, result: "NO_IMAGE" }); continue; }
    const { buffer } = await readDemoImageFile(sourceRoot, entry, article);
    results.push({ productKey: article.key, result: imageIsAuthorized(entry) ? "READY_PACKAGE_ONLY" : "AUTHORIZATION_PENDING",
      file: entry.file, sha256: entry.sha256, bytes: buffer.length, assetKind: entry.assetKind ?? "SUPPLIER_IMAGE",
      authorization: entry.authorization ?? null });
  }
  return { applied: false, databaseChecked: false, filesWritten: 0, products: results.length,
    ready: results.filter(r => r.result === "READY_PACKAGE_ONLY").length, results };
}
