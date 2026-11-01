import { db } from "./index.js";
import { importDemoImages } from "./demo/imageImport.js";

try {
  const args = process.argv.slice(2);
  if (!args[0] || args.slice(1).some(a => a !== "--apply") || args.length > 2) throw new Error("Uso: db:demo-images -- DIRECTORIO [--apply]; sin --apply solo vista previa");
  console.log(JSON.stringify(await importDemoImages(args[0], args[1] === "--apply"), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Importación rechazada");
  process.exitCode = 1;
} finally { await db.$client.end(); }
