import { and, eq, sql } from "drizzle-orm";
import type { DbTransaction } from "../index.js";
import { categoriesTable, productFamiliesTable, productsTable } from "../schema/index.js";
import { assignVariant, getFamily, saveFamily, type FamilyBody } from "../../modules/productFamilies/productFamilies.service.js";
import { demoDescription, demoProducts } from "./catalog.js";

type Definition = { name: string; attributes: string[]; members: Array<[string, ...string[]]> };
// Codes are matched to the reviewed source manifest, NEVER to barcodes or product IDs.
export const demoFamilies: Definition[] = [
  { name: "Pintura spray Rex uso general 400 ml", attributes: ["Color / acabado"], members: [
    ["920", "Blanco brillante"], ["1134", "Blanco mate"], ["925", "Negro brillante"], ["926", "Negro mate"],
    ["929", "Rojo"], ["916", "Azul"], ["1012", "Amarillo"], ["927", "Verde"], ["918", "Azul oscuro"], ["919", "Beige"]] },
  { name: "Pintura spray Rex fluorescente 400 ml", attributes: ["Color"], members: [["940", "Amarillo"], ["1022", "Verde"]] },
  { name: "Brocha Lizcal profesional 5/8 pulgada", attributes: ["Ancho"], members: [["981", "1 pulgada"], ["982", "1 1/2 pulgadas"], ["983", "2 pulgadas"], ["984", "2 1/2 pulgadas"], ["985", "3 pulgadas"], ["986", "4 pulgadas"]] },
  { name: "Brocha EMTOP línea EPBH 702", attributes: ["Ancho"], members: [["EPBH01702", "1 pulgada"], ["EPBH15702", "1 1/2 pulgadas"], ["EPBH02702", "2 pulgadas"], ["EPBH25702", "2 1/2 pulgadas"]] },
  { name: "Rodillo Lizcal fibra 6 mm", attributes: ["Ancho"], members: [["1398", "7 cm"], ["970", "12 cm"], ["971", "18 cm"], ["1303", "23 cm"]] },
  { name: "Rodillo Lizcal 100% lana", attributes: ["Ancho"], members: [["1535", "12 cm"], ["1536", "18 cm"], ["1726", "23 cm"]] },
  { name: "Espátula plástica lisa Lizcal", attributes: ["Ancho"], members: [["1363", "2 pulgadas"], ["1364", "3 pulgadas"]] },
  { name: "Tarugo tipo Fischer, bolsa 1000 unidades", attributes: ["Diámetro"], members: [["651", "5 mm"], ["448", "6 mm"], ["449", "8 mm"], ["557", "10 mm"]] },
  { name: "Tarugo de golpe, ciento", attributes: ["Medida"], members: [["1324", "6 x 60 mm"], ["468", "6 x 80 mm"], ["469", "8 x 80 mm"], ["470", "8 x 100 mm"]] },
  { name: "Clavo concreto pólvora, caja 100 unidades", attributes: ["Medida"], members: [["872", "3,7 x 1 1/2 pulgadas"], ["596", "3,7 x 2 pulgadas"], ["1112", "3,7 x 2 1/2 pulgadas"]] },
  { name: "Amarras plásticas UYUS blancas, ciento", attributes: ["Medida"], members: [["666", "4,8 x 200 mm"], ["667", "4,8 x 300 mm"], ["668", "4,8 x 400 mm"]] },
  { name: "Malla Rashel 80% sombra", attributes: ["Color", "Dimensiones"], members: [
    ["1876", "Negra", "5 x 4,20 m"], ["1879", "Negra", "10 x 4,20 m"], ["644", "Negra", "4,20 x 100 m"],
    ["1877", "Verde/blanco", "5 x 4,20 m"], ["1878", "Verde/blanco", "10 x 4,20 m"], ["1395", "Verde/blanco", "4,20 x 100 m"],
    ["1874", "Azul/blanco", "5 x 4,20 m"], ["1875", "Azul/blanco", "10 x 4,20 m"], ["1341", "Azul/blanco", "4,20 x 100 m"]] },
  { name: "Disco lija flap Ferretools 115", attributes: ["Grano"], members: [["5401431", "40"], ["5401432", "60"], ["5401433", "80"], ["5401434", "100"]] },
  { name: "Alicate universal EMTOP línea EPLRC", attributes: ["Medida"], members: [["EPLRC0611", "6 pulgadas"], ["EPLRC0811", "8 pulgadas"]] },
  { name: "Combo EMTOP línea EHAMSH", attributes: ["Peso"], members: [["EHAMSH1000", "1000 g"], ["EHAMSH1500", "1500 g"]] },
  { name: "Martillo EMTOP línea EHAMCH", attributes: ["Peso"], members: [["EHAMCH0801", "8 oz"], ["EHAMCH1601", "16 oz"], ["EHAMCH2001", "20 oz"]] },
  { name: "Martillo Truper mango fibra", attributes: ["Peso"], members: [["1210", "16 oz"], ["1671", "20 oz"]] },
  { name: "Lubricante Truper WT-400", attributes: ["Presentación"], members: [["33", "110 ml"], ["35", "400 ml"]] },
  { name: "Lubricante Rex 40", attributes: ["Presentación"], members: [["1072", "150 ml"], ["2504", "400 ml"]] },
];

export async function associateDemoFamilies(tx: DbTransaction, adminId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
  const counts = { families: 0, variants: 0 };
  for (const definition of demoFamilies) {
    const articles = definition.members.map(([code]) => {
      const matches = demoProducts.filter((p) => p.supplierCode === code);
      if (matches.length !== 1) throw new Error(`Referencia ambigua o inexistente: ${code}`);
      return matches[0];
    });
    const first = articles[0];
    const [category] = await tx.select().from(categoriesTable).where(eq(categoriesTable.name, first.categoryName));
    if (!category) throw new Error(`Falta categoría de referencia: ${first.categoryName}`);
    if (articles.some((p) => p.categoryName !== first.categoryName || p.brand !== first.brand)) throw new Error("Familia incompatible en el manifiesto");
    const body: FamilyBody = { name: definition.name, categoryId: category.id, brand: first.brand,
      description: "Familia del catálogo de referencia de demostración. Precios y existencias ficticios; cada opción es un producto independiente.",
      attributes: definition.attributes.map((name, i) => ({ name, options: [...new Set(definition.members.map((m) => m[i + 1]))].map((label) => ({ label })) })) };
    const [existing] = await tx.select().from(productFamiliesTable).where(and(eq(productFamiliesTable.categoryId, category.id), eq(productFamiliesTable.name, body.name)));
    const familyId = existing?.id ?? await saveFamily(body, undefined, tx);
    const family = await getFamily(familyId, tx);
    if (family.brand !== first.brand || family.attributes.length !== body.attributes.length
      || family.attributes.some((a, i) => a.name !== body.attributes[i].name
        || a.options.map((o) => o.label).join("|") !== body.attributes[i].options.map((o) => o.label).join("|"))) {
      throw new Error(`Definición existente incompatible: ${body.name}; no se modificó`);
    }
    for (const [index, article] of articles.entries()) {
      const matches = await tx.select().from(productsTable).where(and(eq(productsTable.categoryId, category.id), eq(productsTable.name, article.name)));
      const product = matches[0];
      if (matches.length !== 1 || product.brand !== article.brand || product.unitMeasure !== article.unitMeasure || product.description !== demoDescription(article)) {
        throw new Error(`No se pudo identificar con seguridad el producto de referencia ${article.key}`);
      }
      if (product.familyId !== null && product.familyId !== familyId) throw new Error(`Producto #${product.id} ya asociado a otra familia`);
      const options = family.attributes.map((a, i) => a.options.find((o) => o.label === definition.members[index][i + 1])!.id);
      await assignVariant(tx, product.id, familyId, options, adminId,
        `Asociación revisada supplier-reference-demo-2026-10-v1: ${article.key}, página ${article.source.page}; conserva identidad e historial`);
      counts.variants++;
    }
    counts.families++;
  }
  return counts;
}
