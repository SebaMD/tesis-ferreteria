// CUSTOMER_NOTICE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55443/postgres node tests/customerNotice.integration.mjs
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const rootUrl = new URL(process.env.CUSTOMER_NOTICE_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55443",
  "Use the isolated PostgreSQL cluster on port 55443",
);

const suffix = randomBytes(4).toString("hex");
const databaseNames = [`fyf_notice_upgrade_${suffix}`, `fyf_notice_clean_${suffix}`];
const admin = new pg.Client({ connectionString: rootUrl.href });
const previousMigrations = await mkdtemp(path.join(tmpdir(), "fyf-notice-migrations-"));
const uploadsRoot = await mkdtemp(path.join(tmpdir(), "fyf-notice-uploads-"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64");
let server;
let applicationDb;

function databaseUrl(name) {
  const value = new URL(rootUrl);
  value.pathname = `/${name}`;
  return value.href;
}

async function createDatabase(name) {
  await admin.query(`CREATE DATABASE "${name}"`);
}

async function seedRolesAndUsers(pool) {
  await pool.query(`
    INSERT INTO roles(name,description) VALUES
      ('ADMIN','Administrador'),('MANAGER','Gerente'),('CASHIER','Cajero'),
      ('WAREHOUSE','Bodeguero'),('CLIENT','Cliente')
    ON CONFLICT(name) DO NOTHING
  `);
  for (const [role, rut, email] of [
    ["ADMIN", "11111111-1", "notice-admin@example.test"],
    ["MANAGER", "22222222-2", "notice-manager@example.test"],
    ["CASHIER", "33333333-3", "notice-cashier@example.test"],
    ["WAREHOUSE", "44444444-4", "notice-warehouse@example.test"],
    ["CLIENT", "55555555-5", "notice-client@example.test"],
  ]) {
    await pool.query(`
      INSERT INTO users(role_id,rut,names,surnames,correo,email_verified_at,password,status)
      VALUES ((SELECT id FROM roles WHERE name=$1),$2,$1,'Avisos',$3,now(),'hash','ACTIVE')
    `, [role, rut, email]);
  }
}

function payload(overrides = {}) {
  return {
    title: "Aviso de prueba",
    message: "Información operacional de prueba.",
    isActive: true,
    displaySeconds: 7,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const historicalEntries = journal.entries.filter((entry) => entry.idx <= 22);
  await mkdir(path.join(previousMigrations, "meta"));
  await writeFile(
    path.join(previousMigrations, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: historicalEntries }, null, 2),
  );
  for (const entry of historicalEntries) {
    await copyFile(`drizzle/${entry.tag}.sql`, path.join(previousMigrations, `${entry.tag}.sql`));
  }

  await createDatabase(databaseNames[0]);
  const upgradePool = new pg.Pool({ connectionString: databaseUrl(databaseNames[0]) });
  await migrate(drizzle(upgradePool), { migrationsFolder: previousMigrations });
  await seedRolesAndUsers(upgradePool);
  const adminId = (await upgradePool.query("SELECT id FROM users WHERE correo='notice-admin@example.test'")).rows[0].id;
  const existing = (await upgradePool.query(`
    INSERT INTO customer_notice(title,message,is_active,sort_order,display_seconds,created_by_user_id,updated_by_user_id)
    VALUES ('Aviso conservado','Contenido histórico',true,4,9,$1,$1) RETURNING id
  `, [adminId])).rows[0];
  await migrate(drizzle(upgradePool), { migrationsFolder: "drizzle" });
  const preserved = (await upgradePool.query("SELECT * FROM customer_notice WHERE id=$1", [existing.id])).rows[0];
  assert.equal(preserved.title, "Aviso conservado");
  assert.equal(preserved.sort_order, 4);
  assert.equal(preserved.image_path, null);
  const presentation = (await upgradePool.query("SELECT * FROM catalog_presentation WHERE id=1")).rows[0];
  assert.equal(presentation.title, "Catálogo Ferretería FYF");
  assert.match(presentation.main_text, /materiales y herramientas/);
  await upgradePool.end();
  console.log("PASS migration 0022 -> 0023 preserves every notice and seeds the institutional presentation");

  await createDatabase(databaseNames[1]);
  const cleanPool = new pg.Pool({ connectionString: databaseUrl(databaseNames[1]) });
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  await seedRolesAndUsers(cleanPool);
  const users = Object.fromEntries((await cleanPool.query(`
    SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id
  `)).rows.map((row) => [row.role, row]));
  assert.equal((await cleanPool.query("SELECT count(*)::int AS count FROM catalog_presentation")).rows[0].count, 1);
  await cleanPool.end();
  console.log("PASS clean migrations 0000 -> 0023 include the default catalog presentation");

  process.env.DATABASE_URL = databaseUrl(databaseNames[1]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.UPLOADS_ROOT = uploadsRoot;
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = (role) => jwt.sign({ id: users[role].id }, process.env.SESSION_SECRET);
  const request = async (method, route, { role, body, rawBody, contentType } = {}, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(rawBody ? { "Content-Type": contentType } : { "Content-Type": "application/json" }),
        ...(role ? { Authorization: `Bearer ${token(role)}` } : {}),
      },
      ...(rawBody ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
    return result;
  };

  const initialPublic = (await request("GET", "/customer-notice")).data;
  assert.match(initialPublic.presentation.mainText, /materiales y herramientas/);
  assert.deepEqual(initialPublic.notices, []);
  for (const role of ["CASHIER", "WAREHOUSE", "CLIENT"]) {
    await request("POST", "/customer-notice/configuration", { role, body: payload() }, 403);
    await request("PUT", "/customer-notice/configuration/presentation", {
      role,
      body: { title: "Sin permiso", mainText: "No corresponde", secondaryText: "No corresponde" },
    }, 403);
  }
  await request("POST", "/customer-notice/configuration", { body: payload() }, 401);
  for (const displaySeconds of [2, 31]) {
    await request("POST", "/customer-notice/configuration", { role: "ADMIN", body: payload({ displaySeconds }) }, 400);
  }
  await request("POST", "/customer-notice/configuration", { role: "ADMIN", body: payload({ sortOrder: 9 }) }, 400);

  const now = Date.now();
  const finite = await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({
      title: "Vigente primero",
      displaySeconds: 9,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    }),
  }, 201);
  const indefinite = await request("POST", "/customer-notice/configuration", {
    role: "MANAGER",
    body: payload({ title: "Vigente indefinido", displaySeconds: 5 }),
  }, 201);
  const future = await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Futuro", startsAt: new Date(now + 3_600_000).toISOString() }),
  }, 201);
  await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Vencido", endsAt: new Date(now - 60_000).toISOString() }),
  }, 201);
  await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Inactivo", isActive: false }),
  }, 201);

  let publicData = (await request("GET", "/customer-notice")).data;
  assert.deepEqual(publicData.notices.map((notice) => notice.title), ["Vigente primero", "Vigente indefinido"]);
  assert.deepEqual(publicData.notices.map((notice) => notice.displaySeconds), [9, 5]);
  assert.deepEqual(Object.keys(publicData.notices[0]).sort(), ["displaySeconds", "id", "imageUrl", "message", "title"]);
  assert.equal("updatedByUserId" in publicData.presentation, false);

  const configuration = (await request("GET", "/customer-notice/configuration", { role: "MANAGER" })).data;
  assert.equal(configuration.notices.length, 5);
  assert.equal(configuration.presentation.id, 1);
  assert.ok(configuration.notices.every((notice) => "createdByUserId" in notice && "updatedByUserId" in notice));

  await request("PATCH", "/customer-notice/configuration/order", {
    role: "MANAGER",
    body: { noticeIds: [indefinite.data.id, finite.data.id, future.data.id, ...configuration.notices.filter((notice) => ![indefinite.data.id, finite.data.id, future.data.id].includes(notice.id)).map((notice) => notice.id)] },
  });
  publicData = (await request("GET", "/customer-notice")).data;
  assert.deepEqual(publicData.notices.map((notice) => notice.title), ["Vigente indefinido", "Vigente primero"]);
  await request("PATCH", "/customer-notice/configuration/order", { role: "ADMIN", body: { noticeIds: [finite.data.id] } }, 400);

  await request("PUT", "/customer-notice/configuration/presentation", {
    role: "MANAGER",
    body: {
      title: "Catálogo actualizado",
      mainText: "Todo para construir y reparar",
      secondaryText: "Disponibilidad y precios en línea.",
    },
  });
  await request("POST", "/customer-notice/configuration/presentation/image", {
    role: "ADMIN", rawBody: png, contentType: "image/png",
  });
  await request("POST", `/customer-notice/configuration/${indefinite.data.id}/image`, {
    role: "MANAGER", rawBody: png, contentType: "image/png",
  });
  publicData = (await request("GET", "/customer-notice")).data;
  assert.equal(publicData.presentation.title, "Catálogo actualizado");
  assert.match(publicData.presentation.imageUrl, /^\/uploads\/customer-notices\/presentation\//);
  assert.match(publicData.notices[0].imageUrl, new RegExp(`^/uploads/customer-notices/notices/${indefinite.data.id}/`));
  assert.equal("imagePath" in publicData.presentation, false);
  assert.equal("imagePath" in publicData.notices[0], false);

  await request("DELETE", "/customer-notice/configuration/presentation/image", { role: "MANAGER" });
  await request("DELETE", `/customer-notice/configuration/${indefinite.data.id}/image`, { role: "ADMIN" });
  publicData = (await request("GET", "/customer-notice")).data;
  assert.equal(publicData.presentation.imageUrl, null);
  assert.equal(publicData.notices[0].imageUrl, null);

  await request("PUT", `/customer-notice/configuration/${future.data.id}`, {
    role: "MANAGER",
    body: payload({ title: "Futuro ahora inactivo", isActive: false }),
  });
  await request("DELETE", `/customer-notice/configuration/${finite.data.id}`, { role: "MANAGER" });
  assert.deepEqual((await request("GET", "/customer-notice")).data.notices.map((notice) => notice.title), ["Vigente indefinido"]);
  console.log("PASS ADMIN/MANAGER presentation, CRUD, reorder and secure images; other roles denied; public DTO is minimal");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb?.$client) await applicationDb.$client.end();
  await rm(previousMigrations, { recursive: true, force: true });
  await rm(uploadsRoot, { recursive: true, force: true });
  for (const name of databaseNames) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
  }
  await admin.end();
}
