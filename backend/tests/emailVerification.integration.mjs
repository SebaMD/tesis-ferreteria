// EMAIL_VERIFICATION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/postgres node tests/emailVerification.integration.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const rootUrl = new URL(process.env.EMAIL_VERIFICATION_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55441",
  "Use the isolated PostgreSQL cluster on port 55441",
);

function createSmtpServer() {
  const messages = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.write("220 localhost FYF test SMTP\r\n");
    let buffer = "";
    let dataMode = false;
    let message = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (dataMode) {
          if (line === ".") {
            messages.push(message);
            message = "";
            dataMode = false;
            socket.write("250 queued\r\n");
          } else {
            message += `${line}\n`;
          }
          continue;
        }
        if (/^(EHLO|HELO)/i.test(line)) socket.write("250-localhost\r\n250 OK\r\n");
        else if (/^DATA/i.test(line)) { dataMode = true; socket.write("354 end with .\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.write("221 bye\r\n"); socket.end(); }
        else socket.write("250 OK\r\n");
      }
    });
    socket.on("close", () => sockets.delete(socket));
  });
  return {
    messages,
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)),
    port: () => server.address().port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

function pinFrom(message) {
  const match = message.match(/\b(\d{6})\b/);
  assert.ok(match, "The SMTP message must contain a six-digit PIN");
  return match[1];
}

const suffix = randomBytes(4).toString("hex");
const databaseNames = [`fyf_email_upgrade_${suffix}`, `fyf_email_clean_${suffix}`];
const created = [];
const pools = [];
const migrationFolder = await mkdtemp(path.join(tmpdir(), "fyf-email-migrations-"));
const admin = new pg.Client({ connectionString: rootUrl.href });
const smtp = createSmtpServer();
let httpServer;
let applicationDb;

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const previousEntries = journal.entries.filter((entry) => entry.idx <= 18);
  await mkdir(path.join(migrationFolder, "meta"));
  await writeFile(
    path.join(migrationFolder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: previousEntries }),
  );
  for (const entry of previousEntries) {
    await copyFile(`drizzle/${entry.tag}.sql`, path.join(migrationFolder, `${entry.tag}.sql`));
  }

  for (const name of databaseNames) {
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
  }
  const connection = (name) => {
    const value = new URL(rootUrl);
    value.pathname = `/${name}`;
    return value.href;
  };

  const pool = new pg.Pool({ connectionString: connection(databaseNames[0]) });
  pools.push(pool);
  await migrate(drizzle(pool), { migrationsFolder: migrationFolder });
  await pool.query("INSERT INTO roles(name,description) VALUES ('CLIENT','Cliente'),('WAREHOUSE','Bodeguero') ON CONFLICT(name) DO NOTHING");
  const historicalPassword = await bcrypt.hash("Email-Test-2026!", 4);
  const historical = (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES ((SELECT id FROM roles WHERE name='CLIENT'),'12.345.678-5','Cliente','Historico','historical@example.test',$1)
    RETURNING id
  `, [historicalPassword])).rows[0];
  const historicalWorker = (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES ((SELECT id FROM roles WHERE name='WAREHOUSE'),'13333333-9','Bodeguero','Historico','historical-worker@example.test',$1)
    RETURNING id
  `, [historicalPassword])).rows[0];
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  assert.equal((await pool.query("SELECT email_verified_at FROM users WHERE id=$1", [historical.id])).rows[0].email_verified_at, null);
  assert.ok((await pool.query("SELECT email_verified_at FROM users WHERE id=$1", [historicalWorker.id])).rows[0].email_verified_at);
  console.log("PASS migration 0018 -> latest preserves historical CLIENT pending and backfills historical internal users");

  const cleanPool = new pg.Pool({ connectionString: connection(databaseNames[1]) });
  pools.push(cleanPool);
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  assert.equal(
    (await cleanPool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count,
    String(journal.entries.length),
  );
  console.log("PASS clean migrations 0000 -> latest");

  await pool.query(`
    INSERT INTO roles(name,description) VALUES
      ('ADMIN','Administrador'),('MANAGER','Gerente'),('CASHIER','Cajero'),('WAREHOUSE','Bodeguero')
    ON CONFLICT(name) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES ((SELECT id FROM roles WHERE name='ADMIN'),'33333333-3','Admin','Verificacion','admin-email-test@example.test',$1)
  `, [historicalPassword]);
  const categoryId = (await pool.query("INSERT INTO categories(name) VALUES ('Verificacion') RETURNING id")).rows[0].id;
  const productId = (await pool.query(`
    INSERT INTO products(category_id,name,price,unit_measure,current_stock)
    VALUES ($1,'Martillo de verificacion',5990,'unidad',50) RETURNING id
  `, [categoryId])).rows[0].id;

  await smtp.listen();
  process.env.DATABASE_URL = connection(databaseNames[0]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "true";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port());
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.MAIL_FROM = "Ferreteria FYF <no-reply@example.test>";

  const transbankSdk = (await import("transbank-sdk")).default;
  let webpaySequence = 0;
  transbankSdk.WebpayPlus.Transaction.prototype.create = async () => ({
    token: `email-verification-webpay-${++webpaySequence}`,
    url: "https://webpay.example.test/pay",
  });
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}/api`;

  const request = async (method, route, { token, guestSession, body } = {}, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(guestSession ? { "X-Guest-Session": guestSession } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
    return payload;
  };
  const register = async (rut, email) => request("POST", "/auth/register", {
    body: { rut, names: "Cliente", surnames: "Verificacion", correo: email, password: "Email-Test-2026!", phone: "+56912345678" },
  }, 201);
  const checkoutBody = (key, extra = {}) => ({
    checkoutKey: key,
    items: [{ productId, quantity: 1 }],
    deliveryType: "PICKUP",
    deliveryRecipientName: null,
    deliveryPhone: null,
    deliveryAddress: null,
    deliveryCommune: null,
    deliveryReference: null,
    deliveryLatitude: null,
    deliveryLongitude: null,
    saveDeliveryAddress: false,
    ...extra,
  });

  const historicalLogin = await request("POST", "/auth/login", {
    body: { correo: "HISTORICAL@example.test", password: "Email-Test-2026!" },
  });
  await request("POST", "/auth/register", {
    body: {
      rut: "12 345 678 5",
      names: "Cliente",
      surnames: "Duplicado",
      correo: "historical-rut-duplicate@example.test",
      password: "Email-Test-2026!",
      phone: null,
    },
  }, 409);
  const internalLogin = await request("POST", "/auth/login", {
    body: { correo: "admin-email-test@example.test", password: "Email-Test-2026!" },
  });
  assert.equal(internalLogin.data.user.role, "ADMIN");
  const historicalWorkerLogin = await request("POST", "/auth/login", {
    body: { correo: "historical-worker@example.test", password: "Email-Test-2026!" },
  });
  assert.equal(historicalWorkerLogin.data.user.requiresEmailVerification, false);
  await request("GET", "/products", { token: historicalWorkerLogin.data.token });
  assert.equal(historicalLogin.data.user.emailVerified, false);
  await request("POST", "/online-orders/checkout", {
    token: historicalLogin.data.token,
    body: checkoutBody("historical-blocked-001"),
  }, 403);
  const historicalChallenge = await request("POST", "/email-verification/client/request", {
    token: historicalLogin.data.token,
    body: {},
  }, 201);
  const historicalVerified = await request("POST", "/email-verification/client/verify", {
    token: historicalLogin.data.token,
    body: { challengeId: historicalChallenge.data.challengeId, pin: pinFrom(smtp.messages.at(-1)) },
  });
  assert.equal(historicalVerified.data.user.emailVerified, true);
  console.log("PASS historical CLIENT can log in and must verify only before a new checkout");

  const managerRoleId = (await pool.query("SELECT id FROM roles WHERE name='MANAGER'")).rows[0].id;
  const workerMailCountBeforeCreate = smtp.messages.length;
  const workerCreated = await request("POST", "/users", {
    token: internalLogin.data.token,
    body: {
      roleId: managerRoleId,
      rut: "14.444.444-2",
      names: "Gerente Nuevo",
      surnames: "Verificacion",
      correo: "New.Worker@Example.Test",
      password: "Email-Test-2026!",
      phone: null,
      status: "ACTIVE",
    },
  }, 201);
  assert.equal(workerCreated.data.rut, "14444444-2");
  assert.equal(workerCreated.data.emailVerification, undefined);
  assert.equal(smtp.messages.length, workerMailCountBeforeCreate);
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE user_id=$1", [workerCreated.data.id])).rows[0].count, "0");
  assert.equal((await pool.query("SELECT email_verified_at FROM users WHERE id=$1", [workerCreated.data.id])).rows[0].email_verified_at, null);
  const workerLogin = await request("POST", "/auth/login", { body: { identifier: "14 444 444 2", password: "Email-Test-2026!" } });
  assert.equal(workerLogin.data.user.requiresEmailVerification, true);
  assert.equal(workerLogin.data.emailVerification.sent, true);
  const workerPin = pinFrom(smtp.messages.at(-1));
  assert.ok(!JSON.stringify(workerCreated).includes(workerPin));
  assert.ok(!JSON.stringify(workerLogin).includes(workerPin));
  const workerChallenge = workerLogin.data.emailVerification.challengeId;
  const storedWorkerChallenge = (await pool.query("SELECT purpose,email,pin_hash FROM email_verification_challenges WHERE id=$1", [workerChallenge])).rows[0];
  assert.equal(storedWorkerChallenge.purpose, "INTERNAL_USER_REGISTRATION");
  assert.equal(storedWorkerChallenge.email, "new.worker@example.test");
  assert.notEqual(storedWorkerChallenge.pin_hash, workerPin);
  const workerMailCountAfterFirstLogin = smtp.messages.length;
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [workerChallenge]);
  const repeatedWorkerLogin = await request("POST", "/auth/login", { body: { correo: "new.worker@example.test", password: "Email-Test-2026!" } });
  assert.equal(repeatedWorkerLogin.data.emailVerification.challengeId, workerChallenge);
  assert.equal(smtp.messages.length, workerMailCountAfterFirstLogin);
  await request("GET", "/products", { token: workerLogin.data.token }, 403);
  await request("POST", "/email-verification/internal/verify", {
    token: historicalWorkerLogin.data.token,
    body: { challengeId: workerChallenge, pin: workerPin },
  }, 400);
  const existingWorkerChallenge = await request("POST", "/email-verification/internal/request", { token: workerLogin.data.token, body: {} }, 201);
  assert.notEqual(existingWorkerChallenge.data.challengeId, workerChallenge);
  await request("POST", "/email-verification/internal/verify", {
    token: workerLogin.data.token,
    body: { challengeId: workerChallenge, pin: workerPin },
  }, 409);
  const workerResentPin = pinFrom(smtp.messages.at(-1));
  const workerVerified = await request("POST", "/email-verification/internal/verify", {
    token: workerLogin.data.token,
    body: { challengeId: existingWorkerChallenge.data.challengeId, pin: workerResentPin },
  });
  assert.equal(workerVerified.data.user.requiresEmailVerification, false);
  await request("GET", "/products", { token: workerVerified.data.token });
  await request("POST", "/email-verification/internal/verify", {
    token: workerLogin.data.token,
    body: { challengeId: existingWorkerChallenge.data.challengeId, pin: workerResentPin },
  }, 409);
  await request("POST", "/users", {
    token: internalLogin.data.token,
    body: { roleId: managerRoleId, rut: "14444444-2", names: "Duplicado", surnames: "Formato", correo: "duplicate-rut@example.test", password: "Email-Test-2026!", phone: null, status: "ACTIVE" },
  }, 409);
  await request("POST", "/auth/login", { body: { identifier: "14444444-3", password: "Email-Test-2026!" } }, 400);
  console.log("PASS worker first login sends once, reuses active PIN, is backend-gated, RUT-normalized, owner-bound and one-use");

  const cashierRoleId = (await pool.query("SELECT id FROM roles WHERE name='CASHIER'")).rows[0].id;
  await request("POST", "/users", {
    token: internalLogin.data.token,
    body: { roleId: cashierRoleId, rut: "16666666-K", names: "Cajero Nuevo", surnames: "Verificacion", correo: "cashier.verify@example.test", password: "Email-Test-2026!", phone: null, status: "ACTIVE" },
  }, 201);
  const cashierLogin = await request("POST", "/auth/login", { body: { correo: "cashier.verify@example.test", password: "Email-Test-2026!" } });
  assert.equal(cashierLogin.data.user.requiresEmailVerification, true);
  const cashierChallenge = cashierLogin.data.emailVerification.challengeId;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await request("POST", "/email-verification/internal/verify", { token: cashierLogin.data.token, body: { challengeId: cashierChallenge, pin: "999999" } }, 400);
  }
  await request("POST", "/email-verification/internal/verify", { token: cashierLogin.data.token, body: { challengeId: cashierChallenge, pin: "999999" } }, 429);
  await request("POST", "/email-verification/internal/verify", { token: cashierLogin.data.token, body: { challengeId: cashierChallenge, pin: "999999" } }, 429);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [cashierChallenge]);
  const cashierResent = await request("POST", "/email-verification/internal/request", { token: cashierLogin.data.token, body: {} }, 201);
  await request("POST", "/email-verification/internal/verify", { token: cashierLogin.data.token, body: { challengeId: cashierChallenge, pin: pinFrom(smtp.messages.at(-2)) } }, 429);
  const cashierVerified = await request("POST", "/email-verification/internal/verify", { token: cashierLogin.data.token, body: { challengeId: cashierResent.data.challengeId, pin: pinFrom(smtp.messages.at(-1)) } });
  assert.equal(cashierVerified.data.user.requiresEmailVerification, false);

  const warehouseRoleId = (await pool.query("SELECT id FROM roles WHERE name='WAREHOUSE'")).rows[0].id;
  await request("POST", "/users", {
    token: internalLogin.data.token,
    body: { roleId: warehouseRoleId, rut: "17777777-3", names: "Bodeguero Nuevo", surnames: "Verificacion", correo: "warehouse.verify@example.test", password: "Email-Test-2026!", phone: null, status: "ACTIVE" },
  }, 201);
  const warehouseLogin = await request("POST", "/auth/login", { body: { correo: "warehouse.verify@example.test", password: "Email-Test-2026!" } });
  assert.equal(warehouseLogin.data.user.requiresEmailVerification, true);
  const warehouseChallenge = warehouseLogin.data.emailVerification.challengeId;
  const warehousePin = pinFrom(smtp.messages.at(-1));
  await pool.query("UPDATE email_verification_challenges SET created_at=now()-interval '20 minutes', expires_at=now()-interval '1 second' WHERE id=$1", [warehouseChallenge]);
  await request("POST", "/email-verification/internal/verify", { token: warehouseLogin.data.token, body: { challengeId: warehouseChallenge, pin: warehousePin } }, 410);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [warehouseChallenge]);
  const warehouseResent = await request("POST", "/email-verification/internal/request", { token: warehouseLogin.data.token, body: {} }, 201);
  const warehouseVerified = await request("POST", "/email-verification/internal/verify", { token: warehouseLogin.data.token, body: { challengeId: warehouseResent.data.challengeId, pin: pinFrom(smtp.messages.at(-1)) } });
  assert.equal(warehouseVerified.data.user.requiresEmailVerification, false);
  console.log("PASS MANAGER/CASHIER/WAREHOUSE creation, cooldown, five-attempt block, resend and expiry");

  assert.deepEqual((await request("GET", "/customer-notice")).data, []);
  await request("POST", "/customer-notice/configuration", {
    token: historicalWorkerLogin.data.token,
    body: {
      title: "No autorizado",
      message: "No debe guardarse",
      isActive: true,
      sortOrder: 0,
      displaySeconds: 7,
      startsAt: null,
      endsAt: null,
    },
  }, 403);
  const createdNotice = await request("POST", "/customer-notice/configuration", {
    token: workerVerified.data.token,
    body: {
      title: "Horario especial",
      message: "Hoy atenderemos hasta las 17:00.",
      isActive: true,
      sortOrder: 0,
      displaySeconds: 7,
      startsAt: null,
      endsAt: null,
    },
  }, 201);
  const publicNotice = await request("GET", "/customer-notice");
  assert.equal(publicNotice.data.length, 1);
  assert.equal(publicNotice.data[0].title, "Horario especial");
  assert.equal(publicNotice.data[0].message, "Hoy atenderemos hasta las 17:00.");
  assert.deepEqual(Object.keys(publicNotice.data[0]).sort(), ["displaySeconds", "id", "message", "title"]);
  await request("PUT", `/customer-notice/configuration/${createdNotice.data.id}`, {
    token: internalLogin.data.token,
    body: {
      title: "Horario especial",
      message: "Hoy atenderemos hasta las 17:00.",
      isActive: false,
      sortOrder: 0,
      displaySeconds: 7,
      startsAt: null,
      endsAt: null,
    },
  });
  assert.deepEqual((await request("GET", "/customer-notice")).data, []);
  console.log("PASS notices are public only when visible, expose safe DTOs and are editable only by ADMIN/MANAGER");

  const workerEmailChanged = await request("PATCH", `/users/${workerCreated.data.id}`, {
    token: internalLogin.data.token,
    body: { correo: "worker.changed@example.test" },
  });
  assert.equal(workerEmailChanged.data.emailVerification, undefined);
  assert.equal((await pool.query("SELECT email_verified_at FROM users WHERE id=$1", [workerCreated.data.id])).rows[0].email_verified_at, null);
  await request("GET", "/products", { token: workerVerified.data.token }, 403);
  const changedWorkerLogin = await request("POST", "/auth/login", { body: { correo: "worker.changed@example.test", password: "Email-Test-2026!" } });
  assert.equal(changedWorkerLogin.data.emailVerification.sent, true);
  const changedWorkerPin = pinFrom(smtp.messages.at(-1));
  const changedWorkerVerified = await request("POST", "/email-verification/internal/verify", {
    token: changedWorkerLogin.data.token,
    body: { challengeId: changedWorkerLogin.data.emailVerification.challengeId, pin: changedWorkerPin },
  });
  assert.equal(changedWorkerVerified.data.user.correo, "worker.changed@example.test");
  assert.equal(changedWorkerVerified.data.user.requiresEmailVerification, false);

  const pendingEmailWorker = await request("POST", "/users", {
    token: internalLogin.data.token,
    body: {
      roleId: managerRoleId,
      rut: "18888888-7",
      names: "Gerente Pendiente",
      surnames: "Cambio Correo",
      correo: "pending.old@example.test",
      password: "Email-Test-2026!",
      phone: null,
      status: "ACTIVE",
    },
  }, 201);
  const pendingOldLogin = await request("POST", "/auth/login", {
    body: { correo: "pending.old@example.test", password: "Email-Test-2026!" },
  });
  const pendingOldChallenge = pendingOldLogin.data.emailVerification.challengeId;
  const pendingOldPin = pinFrom(smtp.messages.at(-1));
  await request("PATCH", `/users/${pendingEmailWorker.data.id}`, {
    token: internalLogin.data.token,
    body: { correo: "pending.new@example.test" },
  });
  const pendingNewLogin = await request("POST", "/auth/login", {
    body: { correo: "pending.new@example.test", password: "Email-Test-2026!" },
  });
  assert.notEqual(pendingNewLogin.data.emailVerification.challengeId, pendingOldChallenge);
  assert.match(smtp.messages.at(-1), /pending\.new@example\.test/i);
  await request("POST", "/email-verification/internal/verify", {
    token: pendingNewLogin.data.token,
    body: { challengeId: pendingOldChallenge, pin: pendingOldPin },
  }, 409);
  const pendingNewVerified = await request("POST", "/email-verification/internal/verify", {
    token: pendingNewLogin.data.token,
    body: {
      challengeId: pendingNewLogin.data.emailVerification.challengeId,
      pin: pinFrom(smtp.messages.at(-1)),
    },
  });
  assert.equal(pendingNewVerified.data.user.requiresEmailVerification, false);
  console.log("PASS changing an internal email clears verification, backend-gates the old session and verifies only the new address");

  const registered = await register("11222333-9", "New.Client@Example.Test");
  assert.equal(registered.data.user.emailVerified, false);
  assert.equal(registered.data.emailVerification.sent, true);
  const registrationChallenge = registered.data.emailVerification.challengeId;
  const registrationPin = pinFrom(smtp.messages.at(-1));
  assert.ok(!JSON.stringify(registered.data).includes(registrationPin));
  const storedChallenge = (await pool.query("SELECT email,pin_hash FROM email_verification_challenges WHERE id=$1", [registrationChallenge])).rows[0];
  assert.equal(storedChallenge.email, "new.client@example.test");
  assert.equal(storedChallenge.pin_hash.length, 64);
  assert.notEqual(storedChallenge.pin_hash, registrationPin);
  await request("POST", "/email-verification/client/verify", {
    token: historicalVerified.data.token,
    body: { challengeId: registrationChallenge, pin: registrationPin },
  }, 400);
  const orderCountBeforeGate = Number((await pool.query("SELECT count(*) FROM online_orders")).rows[0].count);
  await request("POST", "/online-orders/checkout", {
    token: registered.data.token,
    body: checkoutBody("client-unverified-0001"),
  }, 403);
  assert.equal(Number((await pool.query("SELECT count(*) FROM online_orders")).rows[0].count), orderCountBeforeGate);
  const verified = await request("POST", "/email-verification/client/verify", {
    token: registered.data.token,
    body: { challengeId: registrationChallenge, pin: registrationPin },
  });
  assert.equal(verified.data.user.emailVerified, true);
  const verifiedLogin = await request("POST", "/auth/login", {
    body: { correo: "new.client@example.test", password: "Email-Test-2026!" },
  });
  assert.equal(verifiedLogin.data.user.emailVerified, true);
  const profileUpdated = await request("PATCH", "/users/me/profile", {
    token: verified.data.token,
    body: { phone: "9 8765 4321" },
  });
  assert.equal(profileUpdated.data.user.phone, "+56987654321");
  await request("PATCH", "/users/me/profile", {
    token: verified.data.token,
    body: { phone: "+56987654321", clientId: historical.id },
  }, 400);
  const savedAddress = await request("PUT", "/online-orders/delivery-address", {
    token: profileUpdated.data.token,
    body: {
      recipientName: "Cliente Verificacion",
      phone: "+56987654321",
      address: "Avenida Prueba 123",
      commune: "Santa Juana",
      reference: "Porton azul",
      latitude: -36.606,
      longitude: -72.103,
    },
  });
  assert.equal(savedAddress.data.address, "Avenida Prueba 123");
  assert.equal((await request("GET", "/online-orders/delivery-address", { token: profileUpdated.data.token })).data.reference, "Porton azul");
  assert.equal((await request("GET", "/online-orders/delivery-address", { token: historicalVerified.data.token })).data, null);
  await request("PUT", "/online-orders/delivery-address", {
    token: profileUpdated.data.token,
    body: { ...savedAddress.data, clientId: historical.id },
  }, 400);
  await request("POST", "/email-verification/client/verify", {
    token: verified.data.token,
    body: { challengeId: registrationChallenge, pin: registrationPin },
  }, 409);
  const firstClientCheckout = await request("POST", "/online-orders/checkout", {
    token: profileUpdated.data.token,
    body: checkoutBody("client-verified-0001"),
  }, 201);
  assert.ok(firstClientCheckout.data.orderId);
  await request("DELETE", "/online-orders/delivery-address", { token: profileUpdated.data.token });
  assert.equal((await request("GET", "/online-orders/delivery-address", { token: profileUpdated.data.token })).data, null);
  console.log("PASS new CLIENT is gated until verification and can persist its own phone/address profile without cross-client identifiers");

  const attemptsUser = await register("55666777-2", "attempts@example.test");
  const attemptsPin = pinFrom(smtp.messages.at(-1));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await request("POST", "/email-verification/client/verify", {
      token: attemptsUser.data.token,
      body: { challengeId: attemptsUser.data.emailVerification.challengeId, pin: attemptsPin === "999999" ? "999998" : "999999" },
    }, attempt === 5 ? 429 : 400);
  }
  await request("POST", "/email-verification/client/verify", {
    token: attemptsUser.data.token,
    body: {
      challengeId: attemptsUser.data.emailVerification.challengeId,
      pin: attemptsPin,
    },
  }, 429);
  const attemptsRow = (await pool.query("SELECT failed_attempts,consumed_at FROM email_verification_challenges WHERE id=$1", [attemptsUser.data.emailVerification.challengeId])).rows[0];
  assert.equal(attemptsRow.failed_attempts, 5);
  assert.ok(attemptsRow.consumed_at);
  console.log("PASS exactly five failed attempts persist and block challenge");

  const resendUser = await register("98765432-5", "resend@example.test");
  const oldId = resendUser.data.emailVerification.challengeId;
  const oldPin = pinFrom(smtp.messages.at(-1));
  await request("POST", "/email-verification/client/request", { token: resendUser.data.token, body: {} }, 429);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [oldId]);
  const resent = await request("POST", "/email-verification/client/request", { token: resendUser.data.token, body: {} }, 201);
  assert.notEqual(resent.data.challengeId, oldId);
  await request("POST", "/email-verification/client/verify", { token: resendUser.data.token, body: { challengeId: oldId, pin: oldPin } }, 409);
  console.log("PASS 60-second cooldown and resend invalidate the previous PIN");

  const expiryUser = await register("13579246-2", "expiry@example.test");
  const expiryPin = pinFrom(smtp.messages.at(-1));
  await pool.query("UPDATE email_verification_challenges SET created_at=now()-interval '20 minutes', expires_at=now()-interval '1 second' WHERE id=$1", [expiryUser.data.emailVerification.challengeId]);
  await request("POST", "/email-verification/client/verify", { token: expiryUser.data.token, body: { challengeId: expiryUser.data.emailVerification.challengeId, pin: expiryPin } }, 410);
  console.log("PASS expired PIN rejected");

  const newEmail = "changed.client@example.test";
  const emailChange = await request("POST", "/email-verification/client/email-change/request", { token: verified.data.token, body: { email: `  ${newEmail.toUpperCase()}  ` } }, 201);
  assert.equal((await pool.query("SELECT correo FROM users WHERE id=$1", [registered.data.user.id])).rows[0].correo, "new.client@example.test");
  await request("POST", "/email-verification/client/email-change/verify", { token: verified.data.token, body: { challengeId: emailChange.data.challengeId, pin: "999999" } }, 400);
  assert.equal((await pool.query("SELECT correo FROM users WHERE id=$1", [registered.data.user.id])).rows[0].correo, "new.client@example.test");
  const changed = await request("POST", "/email-verification/client/email-change/verify", { token: verified.data.token, body: { challengeId: emailChange.data.challengeId, pin: pinFrom(smtp.messages.at(-1)) } });
  assert.equal(changed.data.user.correo, newEmail);
  assert.equal(changed.data.user.emailVerified, true);
  await request("POST", "/email-verification/client/email-change/request", { token: changed.data.token, body: { email: "historical@example.test" } }, 409);
  await request("POST", "/email-verification/client/email-change/request", { token: changed.data.token, body: { email: "attacker@example.test", userId: historical.id } }, 400);

  const expiringChange = await request("POST", "/email-verification/client/email-change/request", { token: historicalVerified.data.token, body: { email: "historical-new@example.test" } }, 201);
  await pool.query("UPDATE email_verification_challenges SET created_at=now()-interval '20 minutes', expires_at=now()-interval '1 second' WHERE id=$1", [expiringChange.data.challengeId]);
  await request("POST", "/email-verification/client/email-change/verify", { token: historicalVerified.data.token, body: { challengeId: expiringChange.data.challengeId, pin: pinFrom(smtp.messages.at(-1)) } }, 410);
  assert.equal((await pool.query("SELECT correo FROM users WHERE id=$1", [historical.id])).rows[0].correo, "historical@example.test");
  console.log("PASS email change keeps old address until PIN and returns refreshed authenticated session");

  const guestA = randomBytes(32).toString("base64url");
  const guestB = randomBytes(32).toString("base64url");
  const guestEmail = newEmail;
  const guestRequest = await request("POST", "/email-verification/guest/request", { guestSession: guestA, body: { email: ` ${guestEmail.toUpperCase()} ` } }, 201);
  const guestPin = pinFrom(smtp.messages.at(-1));
  await request("POST", "/email-verification/guest/verify", { guestSession: guestB, body: { challengeId: guestRequest.data.challengeId, pin: guestPin } }, 400);
  const guestVerified = await request("POST", "/email-verification/guest/verify", { guestSession: guestA, body: { challengeId: guestRequest.data.challengeId, pin: guestPin } });
  assert.equal(guestVerified.data.email, guestEmail);
  const guestBase = {
    guestName: "Invitada Segura",
    guestPhone: "+56987654321",
    emailVerificationChallengeId: guestRequest.data.challengeId,
  };
  await request("POST", "/online-orders/guest/checkout", {
    guestSession: guestA,
    body: checkoutBody("guest-email-mismatch-01", { ...guestBase, guestEmail: "other@example.test", guestEmailConfirmation: "other@example.test" }),
  }, 403);
  const guestCheckout = await request("POST", "/online-orders/guest/checkout", {
    guestSession: guestA,
    body: checkoutBody("guest-verified-00001", { ...guestBase, guestEmail, guestEmailConfirmation: guestEmail }),
  }, 201);
  assert.ok(guestCheckout.data.guestAccessToken);
  const repeatedGuestCheckout = await request("POST", "/online-orders/guest/checkout", {
    guestSession: guestA,
    body: checkoutBody("guest-verified-00001", { ...guestBase, guestEmail, guestEmailConfirmation: guestEmail }),
  }, 409);
  assert.equal(
    repeatedGuestCheckout.message,
    "La sesion anterior de Webpay ya no puede reutilizarse. Revisa el seguimiento del pedido.",
  );
  assert.equal((await pool.query("SELECT count(*) FROM online_orders WHERE guest_session_hash IS NOT NULL")).rows[0].count, "1");
  const guestOrderOwner = (await pool.query("SELECT client_id,guest_email FROM online_orders WHERE id=$1", [guestCheckout.data.orderId])).rows[0];
  assert.equal(guestOrderOwner.client_id, null);
  assert.equal(guestOrderOwner.guest_email, newEmail);
  assert.ok((await pool.query("SELECT consumed_at FROM email_verification_challenges WHERE id=$1", [guestRequest.data.challengeId])).rows[0].consumed_at);
  await pool.query("UPDATE online_orders SET status='CANCELLED' WHERE id=$1", [guestCheckout.data.orderId]);
  await pool.query("UPDATE online_payments SET status='FAILED' WHERE order_id=$1", [guestCheckout.data.orderId]);
  await request("POST", "/online-orders/guest/checkout", {
    guestSession: guestA,
    body: checkoutBody("guest-replay-0000001", { ...guestBase, guestEmail, guestEmailConfirmation: guestEmail }),
  }, 403);
  const retry = await fetch(`${base}/online-orders/guest/retry-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Guest-Order-Token": guestCheckout.data.guestAccessToken },
  });
  assert.equal(retry.status, 200, await retry.text());
  console.log("PASS guest PIN is session/email-bound, checkout session reuse and replay are blocked, legitimate retry needs no PIN");

  const concurrentSession = randomBytes(32).toString("base64url");
  const concurrentChallenge = await request("POST", "/email-verification/guest/request", { guestSession: concurrentSession, body: { email: "concurrent@example.test" } }, 201);
  const concurrentPin = pinFrom(smtp.messages.at(-1));
  const concurrentVerify = () => fetch(`${base}/email-verification/guest/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Guest-Session": concurrentSession },
    body: JSON.stringify({ challengeId: concurrentChallenge.data.challengeId, pin: concurrentPin }),
  });
  const concurrentStatuses = (await Promise.all([concurrentVerify(), concurrentVerify()])).map((response) => response.status).sort();
  assert.deepEqual(concurrentStatuses, [200, 409]);

  const resendSession = randomBytes(32).toString("base64url");
  const initialResend = await request("POST", "/email-verification/guest/request", { guestSession: resendSession, body: { email: "concurrent-resend@example.test" } }, 201);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=$2 WHERE id=$1", [initialResend.data.challengeId, new Date(Date.now() - 61_000)]);
  const resendCall = () => fetch(`${base}/email-verification/guest/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Guest-Session": resendSession },
    body: JSON.stringify({ email: "concurrent-resend@example.test" }),
  });
  const resendStatuses = (await Promise.all([resendCall(), resendCall()])).map((response) => response.status).sort();
  assert.deepEqual(resendStatuses, [201, 429]);
  console.log("PASS concurrent verify and resend requests serialize safely");

  const rateSession = randomBytes(32).toString("base64url");
  for (let send = 0; send < 5; send += 1) {
    const sent = await request("POST", "/email-verification/guest/request", { guestSession: rateSession, body: { email: "rate@example.test" } }, 201);
    await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [sent.data.challengeId]);
  }
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE email='rate@example.test' AND last_sent_at >= now()-interval '1 hour'")).rows[0].count, "5");
  const verificationRepository = await import("../dist/modules/emailVerification/emailVerification.repository.js");
  const guestAccess = await import("../dist/modules/onlineOrders/guestOrderAccess.js");
  const repositoryCount = await applicationDb.transaction((tx) => verificationRepository.countRecentVerificationSends(
    tx,
    { type: "GUEST", guestSessionHash: guestAccess.hashGuestSessionId(rateSession) },
    "rate@example.test",
    new Date(Date.now() - 60 * 60_000),
  ));
  assert.equal(repositoryCount, 5);
  await request("POST", "/email-verification/guest/request", { guestSession: rateSession, body: { email: "rate@example.test" } }, 429);
  console.log("PASS persistent limit of five sends per rolling hour");

  const failedSession = randomBytes(32).toString("base64url");
  await smtp.close();
  await request("POST", "/email-verification/guest/request", { guestSession: failedSession, body: { email: "smtp-failure@example.test" } }, 503);
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE email='smtp-failure@example.test'")).rows[0].count, "0");
  const failedRegistration = await register("22222222-2", "register-smtp-failure@example.test");
  assert.equal(failedRegistration.data.emailVerification.sent, false);
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE email='register-smtp-failure@example.test'")).rows[0].count, "0");
  const failedWorker = await request("POST", "/users", {
    token: internalLogin.data.token,
    body: {
      roleId: managerRoleId,
      rut: "15555555-6",
      names: "Gerente SMTP",
      surnames: "Temporal",
      correo: "worker-smtp-failure@example.test",
      password: "Email-Test-2026!",
      phone: null,
      status: "ACTIVE",
    },
  }, 201);
  assert.equal(failedWorker.data.emailVerification, undefined);
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE email='worker-smtp-failure@example.test'")).rows[0].count, "0");
  const failedWorkerLogin = await request("POST", "/auth/login", {
    body: { correo: "worker-smtp-failure@example.test", password: "Email-Test-2026!" },
  });
  assert.equal(failedWorkerLogin.data.user.requiresEmailVerification, true);
  assert.equal(failedWorkerLogin.data.emailVerification.sent, false);
  assert.equal((await pool.query("SELECT count(*) FROM email_verification_challenges WHERE email='worker-smtp-failure@example.test'")).rows[0].count, "0");
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=$2 WHERE user_id=$1 AND purpose='CLIENT_EMAIL_CHANGE'", [registered.data.user.id, new Date(Date.now() - 61_000)]);
  await request("POST", "/email-verification/client/email-change/request", { token: changed.data.token, body: { email: "change-smtp-failure@example.test" } }, 503);
  assert.equal((await pool.query("SELECT correo FROM users WHERE id=$1", [registered.data.user.id])).rows[0].correo, newEmail);
  console.log("PASS SMTP failure returns error and leaves no active/false-sent challenge");
} finally {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  try { await smtp.close(); } catch { /* already closed */ }
  for (const pool of pools) await pool.end();
  for (const name of created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await rm(migrationFolder, { recursive: true, force: true });
}
