// PRODUCT_IMAGES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55444/postgres node tests/productImages.integration.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const rootUrl = new URL(process.env.PRODUCT_IMAGES_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55444",
  "Use the isolated PostgreSQL cluster on port 55444",
);

const suffix = randomBytes(4).toString("hex");
const databaseName = `fyf_product_images_${suffix}`;
const uploadsRoot = await mkdtemp(path.join(tmpdir(), "fyf-product-images-"));
const admin = new pg.Client({ connectionString: rootUrl.href });
let adminConnected = false;
let applicationDb;
let server;

const fixtures = [
  {
    mimeType: "image/png",
    extension: ".png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64"),
  },
  {
    mimeType: "image/jpeg",
    extension: ".jpg",
    buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"),
  },
  {
    mimeType: "image/webp",
    extension: ".webp",
    buffer: Buffer.from("UklGRkoAAABXRUJQVlA4ID4AAADwAQCdASoBAAEAAUAmJQBOgCHwAP7+tQZQAAAA", "base64"),
  },
];

function databaseUrl(name) {
  const value = new URL(rootUrl);
  value.pathname = `/${name}`;
  return value.href;
}

async function countStoredFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const pool = new pg.Pool({ connectionString: databaseUrl(databaseName) });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query(`
    INSERT INTO roles(name,description) VALUES ('ADMIN','Administrador') ON CONFLICT(name) DO NOTHING;
    INSERT INTO users(role_id,rut,names,surnames,correo,email_verified_at,password,status,auth_version)
    VALUES ((SELECT id FROM roles WHERE name='ADMIN'),'11111111-1','Admin','Imagen','product-image-admin@example.test',now(),'hash','ACTIVE',1);
    INSERT INTO categories(name,description) VALUES ('Pruebas de imagen','Categoría aislada');
    INSERT INTO products(category_id,name,price,unit_measure,current_stock,minimum_stock,status)
    VALUES ((SELECT id FROM categories WHERE name='Pruebas de imagen'),'Producto imagen',1000,'unidad',5,1,true);
  `);
  const adminId = (await pool.query("SELECT id FROM users WHERE correo='product-image-admin@example.test'")).rows[0].id;
  const productId = (await pool.query("SELECT id FROM products WHERE name='Producto imagen'")).rows[0].id;
  await pool.end();

  process.env.DATABASE_URL = databaseUrl(databaseName);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.UPLOADS_ROOT = uploadsRoot;
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const apiBase = `${origin}/api`;
  const token = jwt.sign({ id: adminId, authVersion: 1 }, process.env.SESSION_SECRET);
  const uploaded = [];

  for (const fixture of fixtures) {
    const response = await fetch(`${apiBase}/products/${productId}/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": fixture.mimeType,
      },
      body: fixture.buffer,
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.match(body.data.imageUrl, new RegExp(`^/uploads/products/${productId}/.+\\${fixture.extension}$`));

    const assetResponse = await fetch(new URL(body.data.imageUrl, origin));
    assert.equal(assetResponse.status, 200, `GET ${body.data.imageUrl}`);
    assert.equal(assetResponse.headers.get("content-type"), fixture.mimeType);
    assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), fixture.buffer);
    uploaded.push({ ...fixture, response: body.data });
  }

  const rows = (await applicationDb.$client.query(
    "SELECT image_path,position,is_primary FROM product_images WHERE product_id=$1 ORDER BY position,id",
    [productId],
  )).rows;
  assert.equal(rows.length, fixtures.length);
  assert.deepEqual(rows.map((row) => row.position), [0, 1, 2]);
  assert.deepEqual(rows.map((row) => row.is_primary), [true, false, false]);
  for (const [index, row] of rows.entries()) {
    assert.match(row.image_path, new RegExp(`^products[\\\\/]${productId}[\\\\/].+\\${fixtures[index].extension}$`));
    assert.deepEqual(await readFile(path.join(uploadsRoot, row.image_path)), fixtures[index].buffer);
  }

  const rejectedUploads = [
    { mimeType: "image/png", buffer: Buffer.from("esto no es una imagen PNG"), status: 400 },
    { mimeType: "image/jpeg", buffer: Buffer.from("esto no es una imagen JPEG"), status: 400 },
    { mimeType: "image/jpeg", buffer: fixtures[0].buffer, status: 400 },
    { mimeType: "image/png", buffer: Buffer.alloc(0), status: 400 },
    { mimeType: "image/gif", buffer: Buffer.from("GIF89a"), status: 400 },
    { mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1), status: 413 },
  ];

  for (const rejected of rejectedUploads) {
    const response = await fetch(`${apiBase}/products/${productId}/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": rejected.mimeType,
      },
      body: rejected.buffer,
    });
    assert.equal(response.status, rejected.status, await response.text());
    assert.equal((await applicationDb.$client.query(
      "SELECT count(*)::int AS count FROM product_images WHERE product_id=$1",
      [productId],
    )).rows[0].count, fixtures.length);
    assert.equal(await countStoredFiles(uploadsRoot), fixtures.length);
  }

  for (const route of [`/products/${productId}`, `/catalog/products/${productId}`]) {
    const response = await fetch(`${apiBase}${route}`, {
      headers: route.startsWith("/products") ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json();
    assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`);
    assert.deepEqual(body.data.images.map((image) => image.imageUrl), uploaded.map((image) => image.response.imageUrl));
    assert.equal(body.data.images[0].isPrimary, true);
  }

  console.log("PASS product images validate bytes, reject invalid uploads without residue, and serve JPEG/PNG/WebP through DTOs");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb?.$client) await applicationDb.$client.end();
  await rm(uploadsRoot, { recursive: true, force: true });
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).catch(() => undefined);
  }
  await admin.end().catch(() => undefined);
}
