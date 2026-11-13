// Supplier references only. Every price, stock level and availability setting below
// is fictional development data, NOT an offer or inventory statement by FYF.
export const DEMO_CATALOG_VERSION = "supplier-reference-demo-2026-10-v1";
export const DEMO_DISCLAIMER = "DEMOSTRACIÓN: precio, existencias y disponibilidad ficticios; no representan datos comerciales reales de Comercializadora FYF SpA.";

type Source = { document: string; page: number; printedPage?: number };
type Article = {
  name: string;
  brand: string | null;
  model: string | null;
  supplierCode: string;
  specification: string;
  demoPrice: number;
  unitMeasure: string;
  source: Source;
};
type Row = readonly [name: string, brand: string | null, model: string | null,
  supplierCode: string, demoPrice: number, specification: string, unitMeasure?: string];
const cadena = (page: number): Source => ({ document: "CATALOGO COM. CADENA.pdf", page, printedPage: page - 8 });
const lys = (page: number): Source => ({ document: "CATALOGO LYS 2025.pdf", page });
const quote = (page: number): Source => ({ document: "Cotizacion_COT-2026-0934.pdf", page });
const articles = (source: Source, rows: readonly Row[]): Article[] => rows.map(
  ([name, brand, model, supplierCode, demoPrice, specification, unitMeasure = "unidad"]) =>
    ({ name, brand, model, supplierCode, demoPrice, specification, unitMeasure, source }),
);

export const demoCategories = [
  {
    name: "Pinturas y recubrimientos",
    products: articles(cadena(143), [
      ["Pintura spray Rex uso general 400 ml blanco brillante", "Rex", null, "920", 4590, "400 ml; blanco brillante"],
      ["Pintura spray Rex uso general 400 ml blanco mate", "Rex", null, "1134", 4690, "400 ml; blanco mate"],
      ["Pintura spray Rex uso general 400 ml negro brillante", "Rex", null, "925", 4590, "400 ml; negro brillante"],
      ["Pintura spray Rex uso general 400 ml negro mate", "Rex", null, "926", 4690, "400 ml; negro mate"],
      ["Pintura spray Rex uso general 400 ml rojo", "Rex", null, "929", 4790, "400 ml; rojo"],
      ["Pintura spray Rex uso general 400 ml azul", "Rex", null, "916", 4790, "400 ml; azul"],
      ["Pintura spray Rex uso general 400 ml amarillo", "Rex", null, "1012", 4790, "400 ml; amarillo"],
      ["Pintura spray Rex uso general 400 ml verde", "Rex", null, "927", 4790, "400 ml; verde"],
      ["Pintura spray Rex uso general 400 ml azul oscuro", "Rex", null, "918", 4890, "400 ml; azul oscuro"],
      ["Pintura spray Rex uso general 400 ml beige", "Rex", null, "919", 4890, "400 ml; beige"],
      ["Pintura spray Rex fluorescente 400 ml amarillo", "Rex", null, "940", 5990, "400 ml; amarillo fluorescente"],
      ["Pintura spray Rex fluorescente 400 ml verde", "Rex", null, "1022", 5990, "400 ml; verde fluorescente"],
    ]),
  },
  {
    name: "Brochas, rodillos y accesorios de pintura",
    products: [
      ...articles(cadena(172), [
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 1 pulgada", "Lizcal", "BP5810", "981", 2490, "Espesor 5/8 pulgada; ancho 1 pulgada"],
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 1 1/2 pulgadas", "Lizcal", "BP5815", "982", 2990, "Espesor 5/8 pulgada; ancho 1 1/2 pulgadas"],
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 2 pulgadas", "Lizcal", "BP5820", "983", 3490, "Espesor 5/8 pulgada; ancho 2 pulgadas"],
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 2 1/2 pulgadas", "Lizcal", "BP5825", "984", 3990, "Espesor 5/8 pulgada; ancho 2 1/2 pulgadas"],
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 3 pulgadas", "Lizcal", "BP5830", "985", 4490, "Espesor 5/8 pulgada; ancho 3 pulgadas"],
        ["Brocha Lizcal profesional 5/8 pulgada, ancho 4 pulgadas", "Lizcal", "BP5840", "986", 5490, "Espesor 5/8 pulgada; ancho 4 pulgadas"],
        ["Bandeja para pintura Lizcal", "Lizcal", null, "710", 3490, "Bandeja; dimensiones no especificadas en la fuente"],
      ]),
      ...articles(lys(59), [
        ["Brocha EMTOP 1 pulgada EPBH01702", "EMTOP", "EPBH01702", "EPBH01702", 1990, "Ancho 1 pulgada; referencia de catálogo EPBH01702"],
        ["Brocha EMTOP 1 1/2 pulgadas EPBH15702", "EMTOP", "EPBH15702", "EPBH15702", 2490, "Ancho 1 1/2 pulgadas; referencia de catálogo EPBH15702"],
        ["Brocha EMTOP 2 pulgadas EPBH02702", "EMTOP", "EPBH02702", "EPBH02702", 2990, "Ancho 2 pulgadas; referencia de catálogo EPBH02702"],
        ["Brocha EMTOP 2 1/2 pulgadas EPBH25702", "EMTOP", "EPBH25702", "EPBH25702", 3490, "Ancho 2 1/2 pulgadas; referencia de catálogo EPBH25702"],
      ]),
      ...articles(cadena(170), [
        ["Rodillo Lizcal fibra 6 mm de 7 cm", "Lizcal", "5072", "1398", 2990, "Fibra 6 mm; ancho 7 cm"],
        ["Rodillo Lizcal fibra 6 mm de 12 cm", "Lizcal", "5122", "970", 3490, "Fibra 6 mm; ancho 12 cm"],
        ["Rodillo Lizcal fibra 6 mm de 18 cm", "Lizcal", "5182", "971", 3990, "Fibra 6 mm; ancho 18 cm"],
        ["Rodillo Lizcal fibra 6 mm de 23 cm", "Lizcal", "5252", "1303", 4490, "Fibra 6 mm; ancho 23 cm"],
      ]),
      ...articles(cadena(169), [
        ["Rodillo Lizcal 100% lana de 12 cm", "Lizcal", "5127", "1535", 5990, "100% lana; ancho 12 cm"],
        ["Rodillo Lizcal 100% lana de 18 cm", "Lizcal", "5187", "1536", 6990, "100% lana; ancho 18 cm"],
        ["Rodillo Lizcal 100% lana de 23 cm", "Lizcal", "5247", "1726", 7990, "100% lana; ancho 23 cm"],
      ]),
      ...articles(cadena(174), [
        ["Llana plástica lisa Lizcal 508LL", "Lizcal", "508LL", "1543", 3990, "Llana plástica lisa"],
        ["Llana plástica dentada Lizcal 508LD", "Lizcal", "508LD", "2018", 4290, "Llana plástica dentada"],
        ["Espátula plástica lisa Lizcal 2 pulgadas", "Lizcal", "508L2", "1363", 1290, "Ancho 2 pulgadas"],
        ["Espátula plástica lisa Lizcal 3 pulgadas", "Lizcal", "508L3", "1364", 1590, "Ancho 3 pulgadas"],
      ]),
    ],
  },
  {
    name: "Clavos y fijaciones",
    products: articles(cadena(151), [
      ["Tarugo tipo Fischer 5 mm, bolsa 1000 unidades", null, null, "651", 6990, "5 mm; bolsa de 1000 unidades", "bolsa"],
      ["Tarugo tipo Fischer 6 mm, bolsa 1000 unidades", null, null, "448", 7490, "6 mm; bolsa de 1000 unidades", "bolsa"],
      ["Tarugo tipo Fischer 8 mm, bolsa 1000 unidades", null, null, "449", 8990, "8 mm; bolsa de 1000 unidades", "bolsa"],
      ["Tarugo tipo Fischer 10 mm, bolsa 1000 unidades", null, null, "557", 10990, "10 mm; bolsa de 1000 unidades", "bolsa"],
      ["Tarugo de golpe 6 x 60 mm, ciento", null, null, "1324", 6490, "6 x 60 mm; presentación de 100 unidades", "paquete"],
      ["Tarugo de golpe 6 x 80 mm, ciento", null, null, "468", 7490, "6 x 80 mm; presentación de 100 unidades", "paquete"],
      ["Tarugo de golpe 8 x 80 mm, ciento", null, null, "469", 8490, "8 x 80 mm; presentación de 100 unidades", "paquete"],
      ["Tarugo de golpe 8 x 100 mm, ciento", null, null, "470", 9490, "8 x 100 mm; presentación de 100 unidades", "paquete"],
      ["Clavo concreto pólvora 3,7 x 1 1/2 pulgadas, caja 100 unidades", null, null, "872", 8990, "Medida rotulada 3,7 x 1 1/2 pulgadas; caja de 100 unidades", "caja"],
      ["Clavo concreto pólvora 3,7 x 2 pulgadas, caja 100 unidades", null, null, "596", 9990, "Medida rotulada 3,7 x 2 pulgadas; caja de 100 unidades", "caja"],
      ["Clavo concreto pólvora 3,7 x 2 1/2 pulgadas, caja 100 unidades", null, null, "1112", 10990, "Medida rotulada 3,7 x 2 1/2 pulgadas; caja de 100 unidades", "caja"],
      ["Amarras plásticas UYUS blancas 4,8 x 200 mm, ciento", "UYUS", null, "666", 3490, "Blancas; 4,8 x 200 mm; 100 unidades", "paquete"],
      ["Amarras plásticas UYUS blancas 4,8 x 300 mm, ciento", "UYUS", null, "667", 4490, "Blancas; 4,8 x 300 mm; 100 unidades", "paquete"],
      ["Amarras plásticas UYUS blancas 4,8 x 400 mm, ciento", "UYUS", null, "668", 5490, "Blancas; 4,8 x 400 mm; 100 unidades", "paquete"],
    ]),
  },
  {
    name: "Mallas y cercos",
    products: articles(cadena(161), [
      ["Malla Rashel negra 80% sombra 5 x 4,20 m", null, null, "1876", 14990, "Negra; 80% sombra; paño completo 5 x 4,20 m"],
      ["Malla Rashel negra 80% sombra 10 x 4,20 m", null, null, "1879", 24990, "Negra; 80% sombra; paño completo 10 x 4,20 m"],
      ["Malla Rashel negra 80% sombra 4,20 x 100 m", null, null, "644", 129990, "Negra; 80% sombra; rollo completo 4,20 x 100 m", "rollo"],
      ["Malla Rashel verde/blanco 80% sombra 5 x 4,20 m", null, null, "1877", 15990, "Verde/blanco; 80% sombra; paño completo 5 x 4,20 m"],
      ["Malla Rashel verde/blanco 80% sombra 10 x 4,20 m", null, null, "1878", 25990, "Verde/blanco; 80% sombra; paño completo 10 x 4,20 m"],
      ["Malla Rashel verde/blanco 80% sombra 4,20 x 100 m", null, null, "1395", 139990, "Verde/blanco; 80% sombra; rollo completo 4,20 x 100 m", "rollo"],
      ["Malla Rashel azul/blanco 80% sombra 5 x 4,20 m", null, null, "1874", 15990, "Azul/blanco; 80% sombra; paño completo 5 x 4,20 m"],
      ["Malla Rashel azul/blanco 80% sombra 10 x 4,20 m", null, null, "1875", 25990, "Azul/blanco; 80% sombra; paño completo 10 x 4,20 m"],
      ["Malla Rashel azul/blanco 80% sombra 4,20 x 100 m", null, null, "1341", 139990, "Azul/blanco; 80% sombra; rollo completo 4,20 x 100 m", "rollo"],
      ["Malla mosquitera verde 1,20 x 30 m", null, null, "1239", 34990, "Verde; rollo completo 1,20 x 30 m", "rollo"],
    ]),
  },
  {
    name: "Abrasivos, corte y perforación",
    products: [
      ...articles(quote(2), [
        ["Disco lija flap Ferretools 115 grano 40", "Ferretools", "F3641", "5401431", 1990, "Referencia de diámetro 115; grano 40"],
        ["Disco lija flap Ferretools 115 grano 60", "Ferretools", "F3642", "5401432", 1990, "Referencia de diámetro 115; grano 60"],
        ["Disco lija flap Ferretools 115 grano 80", "Ferretools", "F3643", "5401433", 1990, "Referencia de diámetro 115; grano 80"],
        ["Disco lija flap Ferretools 115 grano 100", "Ferretools", "F3644", "5401434", 1990, "Referencia de diámetro 115; grano 100"],
        ["Disco diamantado pulir UYUS 115 mm doble DDP115D", "UYUS", "DDP115D", "5074100", 16990, "Diámetro 115 mm; doble"],
        ["Disco diamantado UYUS 180 mm seco DDU180", "UYUS", "DDU180", "5034028", 11990, "Diámetro 180 mm; corte seco"],
        ["Disco sierra UYUS 7 1/4 pulgadas 24 dientes", "UYUS", "DMD724", "5022017", 10990, "7 1/4 pulgadas; 24 dientes"],
        ["Disco escofina Ferretools plano 100 mm", "Ferretools", "F3217", "5401984", 7990, "Diámetro 100 mm; plano"],
        ["Disco escofina Ferretools trapecio 100 mm", "Ferretools", "F3218", "5401985", 7990, "Diámetro 100 mm; perfil trapecio"],
      ]),
      ...articles(quote(1), [
        ["Broca paleta plana UYUS 1 1/4 pulgadas BCP114", "UYUS", "BCP114", "5003027", 2490, "1 1/4 pulgadas"],
      ]),
      ...articles(quote(3), [
        ["Sierra copa madera UYUS set 8 piezas SEO008", "UYUS", "SEO008", "5022013", 12990, "Set de 8 piezas", "set"],
        ["Sierra copa puerta Ferretools set 3 piezas F3252", "Ferretools", "F3252", "5409322", 5990, "Set de 3 piezas para puerta", "set"],
      ]),
      ...articles(lys(34), [
        ["Set EMTOP 6 brocas para metal ETDBB11065", "EMTOP", "ETDBB11065", "ETDBB11065", 4990, "Set de 6 brocas para metal", "set"],
        ["Set EMTOP 5 brocas para madera EWDBB15055", "EMTOP", "EWDBB15055", "EWDBB15055", 4990, "Set de 5 brocas para madera", "set"],
      ]),
    ],
  },
  {
    name: "Herramientas manuales",
    products: [
      ...articles(lys(27), [
        ["Alicate universal EMTOP 6 pulgadas EPLRC0611", "EMTOP", "EPLRC0611", "EPLRC0611", 5990, "6 pulgadas"],
        ["Alicate universal EMTOP 8 pulgadas EPLRC0811", "EMTOP", "EPLRC0811", "EPLRC0811", 6990, "8 pulgadas"],
        ["Alicate cortante EMTOP 6 pulgadas EPLRD0611", "EMTOP", "EPLRD0611", "EPLRD0611", 5990, "6 pulgadas"],
        ["Alicate de puntas EMTOP 6 pulgadas EPLRL0611", "EMTOP", "EPLRL0611", "EPLRL0611", 5990, "6 pulgadas"],
      ]),
      ...articles(lys(30), [
        ["Combo EMTOP 1000 g EHAMSH1000", "EMTOP", "EHAMSH1000", "EHAMSH1000", 9990, "1000 g; venta por herramienta completa"],
        ["Combo EMTOP 1500 g EHAMSH1500", "EMTOP", "EHAMSH1500", "EHAMSH1500", 12990, "1500 g; venta por herramienta completa"],
        ["Combo EMTOP 10 libras EHAMSL10", "EMTOP", "EHAMSL10", "EHAMSL10", 29990, "10 libras; venta por herramienta completa"],
      ]),
      ...articles(lys(31), [
        ["Martillo EMTOP 8 oz EHAMCH0801", "EMTOP", "EHAMCH0801", "EHAMCH0801", 5990, "8 oz; venta por herramienta completa"],
        ["Martillo EMTOP 16 oz EHAMCH1601", "EMTOP", "EHAMCH1601", "EHAMCH1601", 7990, "16 oz; venta por herramienta completa"],
        ["Martillo EMTOP 20 oz EHAMCH2001", "EMTOP", "EHAMCH2001", "EHAMCH2001", 8990, "20 oz; venta por herramienta completa"],
      ]),
      ...articles(cadena(104), [
        ["Martillo Truper mango fibra 16 oz", "Truper", null, "1210", 10990, "Mango fibra; 16 oz"],
        ["Martillo Truper mango fibra 20 oz", "Truper", null, "1671", 12990, "Mango fibra; 20 oz"],
      ]),
      ...articles(quote(3), [
        ["Martillo Ferrawy mango madera 29 mm MAM29FY", "Ferrawy", "MAM29FY", "5017044", 6990, "Mango madera; 29 mm"],
        ["Llave punta corona 10 mm CR-Van FP9410", null, "FP9410", "5015026", 1990, "10 mm; CR-Van según descripción; marca no identificada"],
      ]),
    ],
  },
  {
    name: "Sopletes y accesorios",
    products: [
      ...articles(quote(1), [
        ["Soplete gas butano UYUS 40 mm SPG02U", "UYUS", "SPG02U", "5407513", 18990, "40 mm; gas butano"],
        ["Soplete gas butano UYUS SPG01U", "UYUS", "SPG01U", "5406378", 8990, "Gas butano; modelo SPG01U"],
      ]),
      ...articles(cadena(87), [
        ["Soplete gas butano Yanes con piezo Prof. 2001K", "Yanes", "Prof. 2001K", "3193", 14990, "Gas butano; encendido piezo"],
        ["Soplete profesional Providus PV700 360 grados", "Providus", "PV700", "1347", 34990, "Rotación 360 grados; sistema antiflama; referencia para gas de 330 g"],
        ["Soplete Truper encendido electrónico", "Truper", null, "2258", 24990, "Encendido electrónico; modelo no especificado"],
      ]),
    ],
  },
  {
    name: "Lubricantes y mantención",
    products: [
      ...articles(quote(3), [
        ["Lubricante spray Toro Negro 400 ml TN0192", "Toro Negro", "TN0192", "5401135", 4990, "Envase 400 ml; tipo W40 según fuente"],
      ]),
      ...articles(cadena(135), [
        ["Lubricante Truper WT-400 110 ml", "Truper", "WT-400", "33", 3990, "Envase 110 ml"],
        ["Lubricante Truper WT-400 400 ml", "Truper", "WT-400", "35", 6990, "Envase 400 ml"],
        ["Lubricante Rex 40 de 150 ml", "Rex", "40", "1072", 3990, "Envase 150 ml"],
        ["Lubricante Rex 40 de 400 ml", "Rex", "40", "2504", 5990, "Envase 400 ml"],
      ]),
    ],
  },
] as const;

export function articleKey(article: Article) {
  return `${article.source.document}:${article.supplierCode}`;
}

const noStock = new Set(["1134", "1364", "557", "1341", "5401434", "EHAMCH2001"]);
const inactive = new Set(["EPBH25702", "EPLRL0611"]);
const inStoreOnly = new Set(["644", "1395", "1341", "5407513", "5406378", "3193", "1347", "2258"]);

export const demoProducts = demoCategories.flatMap((category) => category.products.map((article, index) => ({
  ...article,
  key: articleKey(article),
  categoryName: category.name,
  // These are independently chosen synthetic fixtures, never supplier quantities.
  demoInitialStock: noStock.has(article.supplierCode) ? 0 : 80 + (index % 4) * 10,
  demoMinimumStock: 5,
  demoStatus: !inactive.has(article.supplierCode),
  demoInStoreOnly: inStoreOnly.has(article.supplierCode),
  barcode: null,
})));

export function demoDescription(article: (typeof demoProducts)[number]) {
  return `${DEMO_DISCLAIMER} ${article.specification}. Modelo/referencia: ${article.model ?? "no informado"}. `
    + `Código de proveedor/catálogo (NO código de barras): ${article.supplierCode}. `
    + `Fuente: ${article.source.document}, página PDF ${article.source.page}`
    + (article.source.printedPage ? ` (impresa ${article.source.printedPage})` : "") + ".";
}
