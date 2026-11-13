import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../index.js";
import { categoriesTable, productsTable, productImagesTable } from "../schema/index.js";
import { demoDescription, demoProducts } from "./catalog.js";
import { academicTargetFromEnvironment, authorizeDemoTarget } from "./seedAuthorization.js";
import { resolveStoredImagePath } from "../../utils/imageFiles.js";
import { acquirePromotionPricingLock } from "../../modules/promotions/promotions.repository.js";
import { imageHash as hash, imageIsAuthorized, readDemoImageManifest, readDemoImageFile } from "./imageManifest.js";

// This command enriches only an initialized, explicitly identified demo. It never seeds.
export async function importDemoImages(root: string, apply = false) {
  if (process.env.SEED_DEMO_DATA !== "true" || process.env.NODE_ENV === "production"
    || process.env.MAIL_ENABLED !== "false" || process.env.WEBPAY_ENVIRONMENT !== "integration") {
    throw new Error("Importación demo requiere opt-in, entorno no productivo, MAIL_ENABLED=false y Webpay integration");
  }
  const { sourceRoot, entries } = await readDemoImageManifest(root);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-disposable-demo-seed'))`);
    const target = (await tx.execute<{ name: string; comment: string | null }>(sql`select current_database() AS "name", shobj_description(oid,'pg_database') AS "comment" from pg_database where datname=current_database()`)).rows[0];
    if (authorizeDemoTarget(target, process.env.DATABASE_URL, undefined, academicTargetFromEnvironment()) !== "loaded") throw new Error("Primero debe inicializarse la demo; no se importó nada");
    await acquirePromotionPricingLock(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const products = await tx.select().from(productsTable).orderBy(productsTable.id).for("update");
    const categories = await tx.select().from(categoriesTable);
    const images = await tx.select().from(productImagesTable);
    const report = [];
    for (const article of demoProducts) {
      const matches = products.filter(p => p.name === article.name && p.brand === article.brand
        && p.unitMeasure === article.unitMeasure && p.description === demoDescription(article)
        && categories.some(c => c.id === p.categoryId && c.name === article.categoryName));
      const entry = entries.find(e => e.productKey === article.key);
      const item = { productKey: article.key, supplierCode: article.supplierCode, brand: article.brand, model: article.model,
        specification: article.specification, productId: matches.length === 1 ? matches[0].id : null,
        source: entry ? { file: entry.file, document: entry.sourceDocument, page: entry.sourcePage, sha256: entry.sha256, url: entry.sourceUrl ?? null } : null,
        authorization: entry?.authorization ?? null, assetKind: entry?.assetKind ?? null, rightsStatus: entry?.rightsStatus ?? "NO_IMAGE", result: "" };
      report.push(item);
      if (matches.length !== 1) { item.result = "IDENTITY_MISMATCH"; continue; }
      const product = matches[0];
      const existing = images.filter(i => i.productId === product.id);
      if (!entry) { item.result = existing.length ? "EXISTING_IMAGE_PRESERVED" : "NO_IMAGE"; continue; }
      if (!imageIsAuthorized(entry)) {
        item.result = existing.length ? "EXISTING_IMAGE_PRESERVED" : "AUTHORIZATION_PENDING"; continue;
      }
      const { buffer, extension } = await readDemoImageFile(sourceRoot, entry, article);
      const imagePath = `products/${product.id}/demo-${entry.sha256}${extension}`;
      if (existing.length) {
        if (existing.length === 1 && existing[0].imagePath === imagePath) {
          const stored = await readFile(resolveStoredImagePath(imagePath));
          if (hash(stored) !== entry.sha256) throw new Error("Archivo asociado ausente o alterado; no se reemplaza");
          item.result = "ALREADY_ASSOCIATED";
        } else item.result = "EXISTING_IMAGE_PRESERVED";
        continue;
      }
      if (!apply) { item.result = "READY"; continue; }
      const destination = resolveStoredImagePath(imagePath);
      await mkdir(path.dirname(destination), { recursive: true });
      const storedRoot = await realpath(resolveStoredImagePath('products'));
      const uploadsRoot = await realpath(path.dirname(resolveStoredImagePath('products')));
      if (!storedRoot.startsWith(uploadsRoot + path.sep)) throw new Error("Directorio products fuera del volumen uploads");
      const storedDirectory = await realpath(path.dirname(destination));
      if (!storedDirectory.startsWith(storedRoot + path.sep)) throw new Error("Destino de imagen fuera de uploads/products");
      try { await writeFile(destination, buffer, { flag: "wx" }); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
        if (hash(await readFile(destination)) !== entry.sha256) throw new Error("Colisión de archivo; no se reemplaza");
      }
      // Content-addressed files are never overwritten/deleted. A DB rollback may
      // leave an unreferenced file; the exact hash is reused safely on retry.
      await tx.insert(productImagesTable).values({ productId: product.id, imagePath, position: 0, isPrimary: true });
      item.result = "ASSOCIATED";
    }
    return { applied: apply, products: report.length, withImage: report.filter(r => ["ASSOCIATED", "ALREADY_ASSOCIATED", "EXISTING_IMAGE_PRESERVED"].includes(r.result)).length,
      results: report };
  });
}
