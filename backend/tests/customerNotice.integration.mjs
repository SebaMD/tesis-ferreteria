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
    sortOrder: 0,
    displaySeconds: 7,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const historicalEntries = journal.entries.filter((entry) => entry.idx <= 21);
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
  const adminId = (await upgradePool.query("SELECT id FROM users WHERE correo='notice-admin@example.test'")) .rows[0].id;
  await upgradePool.query(`
    INSERT INTO customer_notice(id,title,message,active,updated_by_user_id)
    VALUES (1,'Aviso conservado','Contenido histórico',true,$1)
  `, [adminId]);
  await migrate(drizzle(upgradePool), { migrationsFolder: "drizzle" });
  const preserved = (await upgradePool.query("SELECT * FROM customer_notice WHERE id=1")).rows[0];
  assert.equal(preserved.title, "Aviso conservado");
  assert.equal(preserved.is_active, true);
  assert.equal(preserved.created_by_user_id, adminId);
  assert.equal(preserved.updated_by_user_id, adminId);
  assert.equal(preserved.display_seconds, 7);
  const generated = (await upgradePool.query(`
    INSERT INTO customer_notice(title,message) VALUES ('Segundo','Conserva secuencia') RETURNING id
  `)).rows[0];
  assert.ok(generated.id > 1);
  await upgradePool.end();
  console.log("PASS migration 0021 -> 0022 preserves singleton data, traceability and identity sequence");

  await createDatabase(databaseNames[1]);
  const cleanPool = new pg.Pool({ connectionString: databaseUrl(databaseNames[1]) });
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  await seedRolesAndUsers(cleanPool);
  const users = Object.fromEntries((await cleanPool.query(`
    SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id
  `)).rows.map((row) => [row.role, row]));
  await cleanPool.end();
  console.log("PASS clean migrations 0000 -> 0022");

  process.env.DATABASE_URL = databaseUrl(databaseNames[1]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = (role) => jwt.sign({ id: users[role].id }, process.env.SESSION_SECRET);
  const request = async (method, route, { role, body } = {}, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(role ? { Authorization: `Bearer ${token(role)}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
    return result;
  };

  assert.deepEqual((await request("GET", "/customer-notice")).data, []);
  for (const role of ["CASHIER", "WAREHOUSE", "CLIENT"]) {
    await request("POST", "/customer-notice/configuration", { role, body: payload() }, 403);
  }
  await request("POST", "/customer-notice/configuration", { body: payload() }, 401);
  for (const displaySeconds of [2, 31]) {
    await request("POST", "/customer-notice/configuration", {
      role: "ADMIN",
      body: payload({ displaySeconds }),
    }, 400);
  }

  const now = Date.now();
  const finite = await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({
      title: "Vigente primero",
      sortOrder: 10,
      displaySeconds: 9,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    }),
  }, 201);
  const indefinite = await request("POST", "/customer-notice/configuration", {
    role: "MANAGER",
    body: payload({ title: "Vigente indefinido", sortOrder: 20, displaySeconds: 5 }),
  }, 201);
  const future = await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Futuro", sortOrder: 0, startsAt: new Date(now + 3_600_000).toISOString() }),
  }, 201);
  await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Vencido", sortOrder: 1, endsAt: new Date(now - 60_000).toISOString() }),
  }, 201);
  await request("POST", "/customer-notice/configuration", {
    role: "ADMIN",
    body: payload({ title: "Inactivo", isActive: false, sortOrder: 2 }),
  }, 201);

  const publicNotices = (await request("GET", "/customer-notice")).data;
  assert.deepEqual(publicNotices.map((notice) => notice.title), ["Vigente primero", "Vigente indefinido"]);
  assert.deepEqual(publicNotices.map((notice) => notice.displaySeconds), [9, 5]);
  assert.deepEqual(Object.keys(publicNotices[0]).sort(), ["displaySeconds", "id", "message", "title"]);

  const configuration = (await request("GET", "/customer-notice/configuration", { role: "MANAGER" })).data;
  assert.equal(configuration.length, 5);
  assert.ok(configuration.every((notice) => "createdByUserId" in notice && "updatedByUserId" in notice));
  assert.equal(configuration.find((notice) => notice.id === indefinite.data.id).endsAt, null);

  await request("PUT", `/customer-notice/configuration/${future.data.id}`, {
    role: "MANAGER",
    body: payload({ title: "Futuro ahora inactivo", isActive: false, sortOrder: 0 }),
  });
  await request("DELETE", `/customer-notice/configuration/${finite.data.id}`, { role: "MANAGER" });
  assert.deepEqual((await request("GET", "/customer-notice")).data.map((notice) => notice.title), ["Vigente indefinido"]);
  console.log("PASS ADMIN/MANAGER CRUD; other roles denied; public active/date filtering, indefinite validity, stable order and minimal DTO");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb?.$client) await applicationDb.$client.end();
  await rm(previousMigrations, { recursive: true, force: true });
  for (const name of databaseNames) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
  }
  await admin.end();
}
