import { mkdir, writeFile } from "node:fs/promises";
import { DEMO_CATALOG_VERSION, DEMO_DISCLAIMER, demoProducts } from "../dist/db/demo/catalog.js";

const destination = new URL("../../docs/seed-catalog-review/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL("catalog.json", destination), JSON.stringify({
  version: DEMO_CATALOG_VERSION,
  disclaimer: DEMO_DISCLAIMER,
  note: "demoInitialStock es previo a las ventas ficticias; ningún precio o stock proviene del proveedor",
  products: demoProducts,
}, null, 2) + "\n");
console.log(`Exportados ${demoProducts.length} artículos para revisión, sin conectar a PostgreSQL.`);
