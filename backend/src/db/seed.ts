import { and, eq, inArray } from "drizzle-orm";
import { applyInventoryMovement } from "../modules/inventory/inventory.service.js";
import { db } from "./index.js";
import {
  categoriesTable,
  productsTable,
  rolesTable,
  usersTable,
} from "./schema/index.js";

type ProductSeed = readonly [
  name: string,
  price: number,
  unitMeasure: string,
  initialStock: number,
  minimumStock: number,
];

type CategorySeed = {
  name: string;
  description: string;
  products: ProductSeed[];
};

const catalog: CategorySeed[] = [
  {
    name: "Herramientas manuales",
    description: "Herramientas para trabajos de construcción, reparación y mantención.",
    products: [
      ["Martillo carpintero 16 oz", 8990, "unidad", 24, 8],
      ["Combo acero 4 lb", 16990, "unidad", 10, 4],
      ["Alicate universal 8 pulgadas", 7990, "unidad", 18, 6],
      ["Destornillador Phillips PH2", 3990, "unidad", 30, 10],
      ["Destornillador paleta 6 mm", 3990, "unidad", 28, 10],
      ["Llave ajustable 10 pulgadas", 10990, "unidad", 14, 5],
      ["Serrucho carpintero 20 pulgadas", 9990, "unidad", 9, 5],
      ["Huincha de medir 5 metros", 5990, "unidad", 25, 8],
      ["Nivel aluminio 40 cm", 11990, "unidad", 4, 5],
      ["Cuchillo cartonero reforzado", 3490, "unidad", 32, 10],
    ],
  },
  {
    name: "Tornillería y fijaciones",
    description: "Tornillos, pernos, clavos y fijaciones para distintos materiales.",
    products: [
      ["Tornillo drywall 6x1 pulgada", 5990, "caja", 20, 6],
      ["Tornillo madera 8x2 pulgadas", 7490, "caja", 16, 6],
      ["Tornillo autoperforante 10x3/4", 6990, "caja", 18, 6],
      ["Clavo corriente 2 pulgadas", 2490, "kg", 35, 12],
      ["Clavo corriente 3 pulgadas", 2490, "kg", 29, 10],
      ["Perno hexagonal 1/4x2 pulgadas", 390, "unidad", 80, 25],
      ["Tarugo nylon 6 mm", 2990, "paquete", 22, 8],
      ["Tarugo nylon 8 mm", 3490, "paquete", 7, 8],
      ["Golilla plana 1/4 pulgada", 1990, "paquete", 26, 10],
      ["Abrazadera metálica 1/2 pulgada", 450, "unidad", 60, 20],
    ],
  },
  {
    name: "Electricidad",
    description: "Materiales y accesorios para instalaciones eléctricas domiciliarias.",
    products: [
      ["Cable eléctrico 1.5 mm²", 590, "metro", 250, 60],
      ["Cable eléctrico 2.5 mm²", 890, "metro", 180, 50],
      ["Enchufe volante 10A", 2490, "unidad", 24, 8],
      ["Interruptor simple embutido", 3990, "unidad", 20, 8],
      ["Enchufe doble embutido", 5490, "unidad", 17, 7],
      ["Automático monopolar 10A", 6990, "unidad", 12, 5],
      ["Huincha aisladora negra", 1490, "rollo", 40, 12],
      ["Extensión eléctrica 5 metros", 12990, "unidad", 6, 6],
      ["Ampolleta LED 12W luz fría", 2990, "unidad", 35, 12],
      ["Tubo conduit PVC 20 mm", 1990, "barra", 45, 15],
    ],
  },
  {
    name: "Plomería",
    description: "Tuberías, conexiones y accesorios para agua y desagüe.",
    products: [
      ["Tubo PVC sanitario 40 mm", 6490, "barra", 25, 8],
      ["Tubo PVC sanitario 50 mm", 7990, "barra", 20, 7],
      ["Codo PVC sanitario 40 mm", 990, "unidad", 45, 15],
      ["Tee PVC sanitario 40 mm", 1490, "unidad", 30, 10],
      ["Llave de paso bola 1/2 pulgada", 5990, "unidad", 15, 6],
      ["Flexible agua 1/2 pulgada 40 cm", 3490, "unidad", 22, 8],
      ["Sifón lavaplatos universal", 6990, "unidad", 9, 5],
      ["Cinta teflón 12 mm", 790, "rollo", 50, 15],
      ["Adhesivo PVC 240 cc", 5990, "unidad", 5, 6],
      ["Válvula estanque WC universal", 8990, "unidad", 11, 4],
    ],
  },
  {
    name: "Pinturas y solventes",
    description: "Pinturas, barnices, diluyentes y accesorios para terminaciones.",
    products: [
      ["Látex interior blanco", 24990, "galón", 18, 6],
      ["Esmalte sintético blanco", 11990, "litro", 14, 5],
      ["Anticorrosivo rojo", 10990, "litro", 12, 5],
      ["Barniz marino brillante", 13990, "litro", 9, 4],
      ["Diluyente sintético", 5990, "litro", 20, 7],
      ["Brocha profesional 2 pulgadas", 3990, "unidad", 30, 10],
      ["Rodillo chiporro 18 cm", 4990, "unidad", 22, 8],
      ["Bandeja plástica para pintura", 3490, "unidad", 16, 6],
      ["Cinta enmascarar 24 mm", 1990, "rollo", 8, 8],
      ["Lija madera grano 120", 590, "unidad", 70, 20],
    ],
  },
  {
    name: "Seguridad industrial",
    description: "Elementos de protección personal para trabajos y faenas.",
    products: [
      ["Guante cabritilla reforzado", 4990, "par", 25, 8],
      ["Guante nitrilo recubierto", 2990, "par", 35, 12],
      ["Lente seguridad transparente", 2490, "unidad", 28, 10],
      ["Casco seguridad amarillo", 6990, "unidad", 16, 6],
      ["Protector auditivo tipo copa", 12990, "unidad", 8, 4],
      ["Mascarilla polvo KN95", 7990, "caja", 20, 7],
      ["Chaleco reflectante naranja", 4990, "unidad", 15, 5],
      ["Zapato seguridad talla 42", 34990, "par", 4, 4],
      ["Arnés seguridad 3 argollas", 49990, "unidad", 7, 3],
      ["Rodillera trabajo reforzada", 9990, "par", 10, 4],
    ],
  },
  {
    name: "Materiales de construcción",
    description: "Materiales básicos para construcción, reparación y obra gruesa.",
    products: [
      ["Cemento uso general 25 kg", 6990, "saco", 45, 15],
      ["Mortero pega 25 kg", 7990, "saco", 32, 12],
      ["Yeso construcción 25 kg", 6490, "saco", 18, 7],
      ["Arena fina ensacada 25 kg", 3990, "saco", 30, 10],
      ["Gravilla ensacada 25 kg", 4490, "saco", 26, 10],
      ["Plancha yeso cartón 10 mm", 11990, "plancha", 20, 8],
      ["Plancha OSB 9.5 mm", 18990, "plancha", 15, 6],
      ["Perfil canal galvanizado 3 m", 3490, "barra", 40, 12],
      ["Malla hexagonal 1 metro", 2990, "metro", 6, 8],
      ["Alambre galvanizado N°14", 4990, "kg", 20, 7],
    ],
  },
  {
    name: "Jardinería",
    description: "Herramientas y accesorios para jardín, riego y exteriores.",
    products: [
      ["Pala punta huevo mango largo", 14990, "unidad", 12, 5],
      ["Rastrillo jardín 14 dientes", 12990, "unidad", 10, 4],
      ["Tijera podar profesional", 9990, "unidad", 15, 5],
      ["Manguera jardín 1/2 pulgada", 990, "metro", 120, 30],
      ["Pistola riego 7 funciones", 6990, "unidad", 18, 6],
      ["Conector rápido manguera", 2490, "unidad", 28, 10],
      ["Regadera plástica 10 litros", 8990, "unidad", 9, 4],
      ["Guante jardín nitrilo", 2990, "par", 22, 8],
      ["Carretilla 90 litros", 69990, "unidad", 3, 3],
      ["Aspersor circular plástico", 5990, "unidad", 14, 5],
    ],
  },
  {
    name: "Adhesivos y sellantes",
    description: "Adhesivos, siliconas y selladores para montaje y reparación.",
    products: [
      ["Silicona transparente 300 ml", 4990, "unidad", 28, 10],
      ["Silicona blanca 300 ml", 4990, "unidad", 24, 8],
      ["Sellador acrílico pintable", 3990, "unidad", 18, 6],
      ["Adhesivo montaje 300 ml", 6490, "unidad", 14, 5],
      ["Pegamento contacto 240 cc", 5990, "unidad", 12, 5],
      ["Adhesivo epóxico 20 gramos", 4490, "set", 20, 7],
      ["Cola fría madera 1 kg", 6990, "kg", 10, 4],
      ["Espuma expansiva 500 ml", 8990, "unidad", 5, 6],
      ["Pistola calafatera metálica", 6990, "unidad", 15, 5],
      ["Cinta doble contacto 19 mm", 3490, "rollo", 25, 8],
    ],
  },
  {
    name: "Ferretería general",
    description: "Accesorios y artículos de uso general para el hogar y taller.",
    products: [
      ["Candado bronce 40 mm", 7990, "unidad", 20, 7],
      ["Bisagra acero 3 pulgadas", 1490, "unidad", 45, 15],
      ["Cerradura sobreponer exterior", 18990, "unidad", 8, 4],
      ["Picaporte zincado 4 pulgadas", 2990, "unidad", 22, 8],
      ["Cadena galvanizada 4 mm", 2490, "metro", 35, 10],
      ["Cuerda polipropileno 8 mm", 890, "metro", 80, 20],
      ["Escuadra metálica 4 pulgadas", 1290, "unidad", 40, 12],
      ["Rueda giratoria 50 mm", 3990, "unidad", 18, 6],
      ["Pila alcalina AA", 4990, "paquete", 30, 10],
      ["Linterna LED recargable", 14990, "unidad", 5, 5],
    ],
  },
];

async function findAdminUserId() {
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(and(eq(rolesTable.name, "ADMIN"), eq(usersTable.status, "ACTIVE")))
    .limit(1);

  return admin?.id;
}

async function seedProductsAndInventory() {
  const adminUserId = await findAdminUserId();

  if (!adminUserId) {
    throw new Error("No existe un usuario ADMIN activo. Inicia el backend una vez antes de ejecutar el seed.");
  }

  const categoryNames = catalog.map((category) => category.name);

  const result = await db.transaction(async (tx) => {
    await tx
      .insert(categoriesTable)
      .values(catalog.map((category) => ({
        name: category.name,
        description: category.description,
        status: true,
      })))
      .onConflictDoNothing({ target: categoriesTable.name });

    const categories = await tx
      .select({ id: categoriesTable.id, name: categoriesTable.name })
      .from(categoriesTable)
      .where(inArray(categoriesTable.name, categoryNames));

    const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
    const categoryIds = categories.map((category) => category.id);
    const existingProducts = await tx
      .select({ categoryId: productsTable.categoryId, name: productsTable.name })
      .from(productsTable)
      .where(inArray(productsTable.categoryId, categoryIds));
    const existingProductKeys = new Set(
      existingProducts.map((product) => `${product.categoryId}:${product.name.trim().toLocaleLowerCase("es")}`),
    );

    let createdProducts = 0;
    let createdMovements = 0;
    let skippedProducts = 0;
    let movementIndex = 0;

    for (const category of catalog) {
      const categoryId = categoryIdByName.get(category.name);

      if (!categoryId) {
        throw new Error(`No se pudo obtener la categoría ${category.name}`);
      }

      for (const [name, price, unitMeasure, initialStock, minimumStock] of category.products) {
        const productKey = `${categoryId}:${name.trim().toLocaleLowerCase("es")}`;

        if (existingProductKeys.has(productKey)) {
          skippedProducts += 1;
          continue;
        }

        const [product] = await tx
          .insert(productsTable)
          .values({
            categoryId,
            name,
            description: `${name} para uso en ${category.name.toLocaleLowerCase("es")}.`,
            price: String(price),
            unitMeasure,
            currentStock: 0,
            minimumStock,
            status: true,
          })
          .returning({ id: productsTable.id });

        const movementDate = new Date(Date.now() - (catalog.length * 10 - movementIndex) * 60 * 60 * 1000);

        await applyInventoryMovement(tx, {
          productId: product.id,
          userId: adminUserId,
          movementType: "ENTRY",
          quantity: initialStock,
          reason: "Carga inicial de productos e inventario",
          date: movementDate,
        });

        existingProductKeys.add(productKey);
        createdProducts += 1;
        createdMovements += 1;
        movementIndex += 1;
      }
    }

    return { createdProducts, createdMovements, skippedProducts };
  });

  console.log("Seed de productos e inventario completado:");
  console.log(`- Productos creados: ${result.createdProducts}`);
  console.log(`- Movimientos ENTRY creados: ${result.createdMovements}`);
  console.log(`- Productos existentes omitidos: ${result.skippedProducts}`);
}

try {
  await seedProductsAndInventory();
  await db.$client.end();
} catch (error) {
  console.error("Error al ejecutar el seed:", error);
  await db.$client.end();
  process.exitCode = 1;
}
