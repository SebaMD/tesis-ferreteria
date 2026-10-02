import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { getProductPromotionPricing } from "../src/helpers/promotionPricing.js";

test("preview porcentual conserva precio base y usa precio efectivo del servidor", () => {
  const product = {
    price: "10000",
    promotionalPrice: 8000,
    promotion: { type: "PERCENTAGE_DISCOUNT", label: "-20%", percentage: 20 },
  };
  assert.deepEqual(getProductPromotionPricing(product, 3), {
    baseUnitPrice: 10000,
    promotionalUnitPrice: 8000,
    baseSubtotal: 30000,
    discountAmount: 6000,
    finalSubtotal: 24000,
    freeUnits: 0,
    promotion: product.promotion,
  });
});

test("preview 2x1 calcula pares por SKU y no inventa precio unitario rebajado", () => {
  const product = { price: 5000, promotionalPrice: null, promotion: { type: "BUY_2_PAY_1", label: "2x1" } };
  assert.equal(getProductPromotionPricing(product, 1).finalSubtotal, 5000);
  assert.equal(getProductPromotionPricing(product, 2).finalSubtotal, 5000);
  assert.equal(getProductPromotionPricing(product, 3).finalSubtotal, 10000);
  assert.deepEqual(getProductPromotionPricing(product, 4), {
    baseUnitPrice: 5000,
    promotionalUnitPrice: null,
    baseSubtotal: 20000,
    discountAmount: 10000,
    finalSubtotal: 10000,
    freeUnits: 2,
    promotion: product.promotion,
  });
});

test("un producto solo presencial ignora promociones ecommerce aunque el cliente conserve datos antiguos", () => {
  const product = {
    price: "10000",
    promotionalPrice: 8000,
    promotion: { type: "PERCENTAGE_DISCOUNT", label: "-20%", percentage: 20 },
    inStoreOnly: true,
  };

  assert.deepEqual(getProductPromotionPricing(product, 2), {
    baseUnitPrice: 10000,
    promotionalUnitPrice: null,
    baseSubtotal: 20000,
    discountAmount: 0,
    finalSubtotal: 20000,
    freeUnits: 0,
    promotion: null,
  });
});

test("catalogo y administracion mantienen contratos de ofertas y roles", async () => {
  const [catalogFilters, catalogPage, promotionPage, targetPicker, modal, app, roles] = await Promise.all([
    readFile(new URL("../src/components/CatalogFilters.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/CatalogPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PromotionsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/PromotionTargetPicker.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/helpers/roles.js", import.meta.url), "utf8"),
  ]);
  assert.match(catalogFilters, /Descuentos %/);
  assert.match(catalogFilters, /Promociones 2x1/);
  assert.match(catalogPage, /promotionTypes/);
  assert.match(promotionPage, /PERCENTAGE_DISCOUNT/);
  assert.match(promotionPage, /BUY_2_PAY_1/);
  assert.match(promotionPage, /Nueva promoción/);
  assert.match(promotionPage, /max-\[620px\]:w-full max-\[620px\]:justify-center/);
  assert.match(promotionPage, /max-\[620px\]:grid-cols-3/);
  assert.match(promotionPage, /status-badge--inactive/);
  assert.match(promotionPage, /border-critical-600 bg-white text-critical-600 hover:bg-critical-50/);
  assert.match(targetPicker, /Buscar categoría\.\.\./);
  assert.match(targetPicker, /Productos incluidos por/);
  assert.match(targetPicker, /Quitar categoría/);
  assert.doesNotMatch(targetPicker, /promotion_excluded_products/);
  assert.match(modal, /dialogs\[dialogs\.length - 1\] !== dialogRef\.current/);
  assert.match(app, /path="\/promotions"/);
  assert.match(roles, /promotions:\s*\["ADMIN",\s*"MANAGER"\]/);
});

test("solo presencial bloquea compra online, conserva favoritos y normaliza filtros de categoria", async () => {
  const [
    productCard,
    purchaseControls,
    cartProvider,
    cartPage,
    checkoutPage,
    productsPage,
    salesPage,
    logisticsScanPage,
    reactivationPage,
  ] = await Promise.all([
    readFile(new URL("../src/components/ProductCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductPurchaseControls.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/context/CartProvider.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ClientCartPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/CheckoutPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProductsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/SalesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/LogisticsScanPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ClientReactivationPage.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(productCard, /Solo presencial/);
  assert.match(productCard, /FavoriteButton product=\{product\}/);
  assert.match(purchaseControls, /if \(product\.inStoreOnly\)/);
  assert.match(purchaseControls, /Disponible solo en tienda/);
  assert.match(cartProvider, /if \(product\?\.inStoreOnly\)/);
  assert.match(cartPage, /Solo presencial · quítalo para continuar/);
  assert.match(checkoutPage, /!liveProduct\.inStoreOnly/);
  assert.match(productsPage, /checked=\{Boolean\(form\.inStoreOnly\)\}/);
  assert.match(productsPage, /setCategoryFilter\(String\(value\)\)/);
  assert.match(salesPage, /setCatalogCategoryFilter\(String\(value\)\)/);
  assert.match(logisticsScanPage, /únicamente al bodeguero/);
  assert.doesNotMatch(logisticsScanPage, /únicamente al WAREHOUSE/);
  assert.doesNotMatch(reactivationPage, /cuentas CLIENT/);
});
