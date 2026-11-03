import { checkDemoImagePackage } from "./demo/imageManifest.js";

let closeDatabase: (() => Promise<void>) | undefined;

try {
  const args = process.argv.slice(2);
  if (!args[0] || args.slice(1).some(a => a !== "--apply" && a !== "--check-files") || args.length > 2) throw new Error("Uso: db:demo-images -- DIRECTORIO [--apply|--check-files]; sin --apply solo vista previa");
  if (args[1] === "--check-files") console.log(JSON.stringify(await checkDemoImagePackage(args[0]), null, 2));
  else {
    const { db } = await import("./index.js");
    closeDatabase = () => db.$client.end();
    const { importDemoImages } = await import("./demo/imageImport.js");
    console.log(JSON.stringify(await importDemoImages(args[0], args[1] === "--apply"), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Importación rechazada");
  process.exitCode = 1;
} finally { await closeDatabase?.(); }
