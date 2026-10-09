import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveApiAssetUrl } from "../src/helpers/apiAssets.js";
import {
  resolveOrderProductAssets,
  resolveProductAssets,
  resolveProductImageAsset,
} from "../src/helpers/productAssets.js";

test("assets de producto respetan proxy local, origen backend y URLs absolutas", () => {
  for (const extension of ["jpg", "png", "webp"]) {
    const relative = `/uploads/products/17/image.${extension}`;
    assert.equal(resolveApiAssetUrl(relative, "/api"), relative);
    assert.equal(
      resolveApiAssetUrl(relative, "http://server.example:1980/api"),
      `http://server.example:1980${relative}`,
    );
  }

  assert.equal(
    resolveApiAssetUrl("https://cdn.example.test/products/image.webp", "http://server.example:1980/api"),
    "https://cdn.example.test/products/image.webp",
  );
  assert.equal(
    resolveApiAssetUrl("/uploads/products/image.webp", "http://server.example:1980/api"),
    "http://server.example:1980/uploads/products/image.webp",
  );
});

test("DTOs de catálogo, administración, favoritos, carrito y pedidos comparten el resolver", () => {
  const apiBaseUrl = "http://server.example:1980/api";
  const product = resolveProductAssets({
    id: 1,
    images: [
      { id: 10, imageUrl: "/uploads/products/1/a.jpg" },
      { id: 11, imageUrl: "https://cdn.example.test/b.png" },
    ],
  }, apiBaseUrl);
  assert.deepEqual(product.images.map((image) => image.imageUrl), [
    "http://server.example:1980/uploads/products/1/a.jpg",
    "https://cdn.example.test/b.png",
  ]);

  const order = resolveOrderProductAssets({
    id: 7,
    items: [{ productImageUrl: "/uploads/products/1/a.jpg" }],
  }, apiBaseUrl);
  assert.equal(order.items[0].productImageUrl, "http://server.example:1980/uploads/products/1/a.jpg");

  const persistedAdminImage = resolveProductImageAsset(
    { id: 12, imageUrl: "/uploads/products/1/persisted.webp" },
    apiBaseUrl,
  );
  assert.equal(
    persistedAdminImage.imageUrl,
    "http://server.example:1980/uploads/products/1/persisted.webp",
  );
});

test("servicios normalizan imágenes antes de entregarlas a componentes", async () => {
  const [catalog, products, favorites, orders, cart, card, gallery, manager] = await Promise.all([
    readFile(new URL("../src/services/catalog.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/products.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/favorites.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/onlineOrders.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/context/CartProvider.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductGallery.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductImagesManager.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /resolveProductListAssets/);
  assert.match(catalog, /resolveProductAssets/);
  assert.match(products, /resolveProductImageAsset/);
  assert.match(favorites, /resolveProductListAssets/);
  assert.match(orders, /resolveOrderProductAssets/);
  assert.match(orders, /resolveOrderListProductAssets/);
  assert.match(cart, /resolveProductAssets\(item\.product\)/);
  assert.match(card, /src=\{primaryImage\.imageUrl\}/);
  assert.match(gallery, /src=\{selectedImage\.imageUrl\}/);
  assert.match(manager, /src=\{image\.imageUrl\}/);
});
