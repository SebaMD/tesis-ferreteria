// CLIENT_ACCOUNT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/postgres node tests/clientAccountLifecycle.integration.mjs
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

const rootUrl = new URL(process.env.CLIENT_ACCOUNT_TEST_DATABASE_URL || "http://missing");
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
          } else message += `${line}\n`;
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
const databaseNames = [`fyf_client_account_upgrade_${suffix}`, `fyf_client_account_clean_${suffix}`];
const created = [];
const pools = [];
const migrationFolder = await mkdtemp(path.join(tmpdir(), "fyf-client-account-migrations-"));
const admin = new pg.Client({ connectionString: rootUrl.href });
const smtp = createSmtpServer();
let httpServer;
let applicationDb;

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const previousEntries = journal.entries.filter((entry) => entry.idx <= 24);
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
  await pool.query("INSERT INTO roles(name,description) VALUES ('CLIENT','Cliente') ON CONFLICT(name) DO NOTHING");
  const historical = (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES ((SELECT id FROM roles WHERE name='CLIENT'),'10120345-K','Cliente','Historico','historical.lifecycle@example.test','hash')
    RETURNING id
  `)).rows[0];
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const migratedHistorical = (await pool.query(
    "SELECT auth_version,self_deactivated_at FROM users WHERE id=$1",
    [historical.id],
  )).rows[0];
  assert.equal(migratedHistorical.auth_version, 1);
  assert.equal(migratedHistorical.self_deactivated_at, null);
  console.log("PASS incremental migration 0024 -> 0025 preserves users and initializes session version");

  const cleanPool = new pg.Pool({ connectionString: connection(databaseNames[1]) });
  pools.push(cleanPool);
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  assert.equal(
    (await cleanPool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count,
    String(journal.entries.length),
  );
  console.log("PASS clean migrations 0000 -> 0025");

  await pool.query(`
    INSERT INTO roles(name,description) VALUES
      ('ADMIN','Administrador'),('CASHIER','Cajero'),('MANAGER','Gerente'),('WAREHOUSE','Bodeguero')
    ON CONFLICT(name) DO NOTHING
  `);
  const password = "Lifecycle-2026!";
  const passwordHash = await bcrypt.hash(password, 4);
  const insertUser = async (role, rut, email, status = "ACTIVE", selfDeactivatedAt = null) => (
    await pool.query(`
      INSERT INTO users(role_id,rut,names,surnames,correo,email_verified_at,password,status,self_deactivated_at)
      VALUES ((SELECT id FROM roles WHERE name=$1),$2,'Cuenta','Prueba',$3,now(),$4,$5,$6)
      RETURNING id
    `, [role, rut, email, passwordHash, status, selfDeactivatedAt])
  ).rows[0];
  const client = await insertUser("CLIENT", "11111111-1", "client.lifecycle@example.test");
  const adminUser = await insertUser("ADMIN", "22222222-2", "admin.lifecycle@example.test");
  const cashier = await insertUser("CASHIER", "33333333-3", "cashier.lifecycle@example.test");

  for (const [index, status] of [
    "PENDING_PAYMENT",
    "PAYMENT_REVIEW",
    "PAID",
    "PREPARING",
    "READY_FOR_PICKUP",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
  ].entries()) {
    await pool.query(`
      INSERT INTO online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at)
      VALUES ($1,$2,$3,1000,'PICKUP',now()+interval '1 hour')
    `, [client.id, `lifecycle-block-${index}`, status]);
  }
  const terminalOrders = [];
  for (const [index, status] of ["DELIVERED", "CANCELLED", "EXPIRED", "PAYMENT_FAILED"].entries()) {
    const row = (await pool.query(`
      INSERT INTO online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at)
      VALUES ($1,$2,$3,1000,'PICKUP',now()-interval '1 hour') RETURNING id,status
    `, [client.id, `lifecycle-terminal-${index}`, status])).rows[0];
    terminalOrders.push(row);
  }

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

  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}/api`;
  const request = async (method, route, { token, body } = {}, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
    return payload;
  };
  const login = (identifier, loginPassword = password, expected = 200) => request("POST", "/auth/login", {
    body: { identifier, password: loginPassword },
  }, expected);

  const clientLogin = await login("client.lifecycle@example.test");
  const adminLogin = await login("admin.lifecycle@example.test");
  const cashierLogin = await login("cashier.lifecycle@example.test");
  const beforeWrongPassword = (await pool.query(
    "SELECT status,self_deactivated_at,auth_version FROM users WHERE id=$1",
    [client.id],
  )).rows[0];
  const wrongPassword = await request("POST", "/users/me/deactivate", {
    token: clientLogin.data.token,
    body: { password: "Incorrecta-2026!" },
  }, 400);
  assert.equal(wrongPassword.message, "Contraseña incorrecta.");
  const afterWrongPassword = (await pool.query(
    "SELECT status,self_deactivated_at,auth_version FROM users WHERE id=$1",
    [client.id],
  )).rows[0];
  assert.deepEqual(afterWrongPassword, beforeWrongPassword);
  await request("GET", "/favorites", { token: clientLogin.data.token });
  await request("GET", "/favorites", { token: "invalid-token" }, 401);
  await request("POST", "/users/me/deactivate", {
    token: cashierLogin.data.token,
    body: { password },
  }, 403);
  await request("POST", "/users/me/deactivate", {
    token: clientLogin.data.token,
    body: { password },
  }, 409);

  await pool.query(`UPDATE online_orders SET status='DELIVERED' WHERE client_id=$1`, [client.id]);
  await request("POST", "/users/me/deactivate", {
    token: clientLogin.data.token,
    body: { password },
  });
  const deactivated = (await pool.query(
    "SELECT status,self_deactivated_at,auth_version FROM users WHERE id=$1",
    [client.id],
  )).rows[0];
  assert.equal(deactivated.status, "INACTIVE");
  assert.ok(deactivated.self_deactivated_at);
  assert.equal(deactivated.auth_version, 2);
  assert.deepEqual(
    (await pool.query("SELECT status FROM online_orders WHERE client_id=$1 ORDER BY id", [client.id])).rows.map((row) => row.status),
    Array(11).fill("DELIVERED"),
  );
  await request("GET", "/favorites", { token: clientLogin.data.token }, 401);
  const inactiveLogin = await login("client.lifecycle@example.test", password, 403);
  assert.equal(inactiveLogin.code, "CLIENT_SELF_DEACTIVATED");
  console.log("PASS password, role and all active commerce states gate self-deactivation; terminal history is preserved");

  await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "client.lifecycle@example.test", password: "Incorrecta-2026!" },
  }, 401);
  const challenge = await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "client.lifecycle@example.test", password },
  }, 201);
  assert.match(challenge.data.emailMasked, /^cl\*+@example\.test$/);
  const firstPin = pinFrom(smtp.messages.at(-1));
  await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "client.lifecycle@example.test", password },
  }, 429);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await request("POST", "/auth/client-reactivation/confirm", {
      body: { identifier: "client.lifecycle@example.test", password, challengeId: challenge.data.challengeId, pin: "999999" },
    }, 400);
  }
  await request("POST", "/auth/client-reactivation/confirm", {
    body: { identifier: "client.lifecycle@example.test", password, challengeId: challenge.data.challengeId, pin: "999999" },
  }, 429);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [challenge.data.challengeId]);
  const expiredChallenge = await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "client.lifecycle@example.test", password },
  }, 201);
  const expiredPin = pinFrom(smtp.messages.at(-1));
  await pool.query("UPDATE email_verification_challenges SET created_at=now()-interval '20 minutes', expires_at=now()-interval '1 second' WHERE id=$1", [expiredChallenge.data.challengeId]);
  await request("POST", "/auth/client-reactivation/confirm", {
    body: { identifier: "client.lifecycle@example.test", password, challengeId: expiredChallenge.data.challengeId, pin: expiredPin },
  }, 410);
  await pool.query("UPDATE email_verification_challenges SET last_sent_at=now()-interval '61 seconds' WHERE id=$1", [expiredChallenge.data.challengeId]);
  const validChallenge = await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "client.lifecycle@example.test", password },
  }, 201);
  const validPin = pinFrom(smtp.messages.at(-1));
  await request("POST", "/auth/client-reactivation/confirm", {
    body: { identifier: "client.lifecycle@example.test", password, challengeId: validChallenge.data.challengeId, pin: validPin },
  });
  await request("POST", "/auth/client-reactivation/confirm", {
    body: { identifier: "client.lifecycle@example.test", password, challengeId: validChallenge.data.challengeId, pin: validPin },
  }, 403);
  await request("GET", "/favorites", { token: clientLogin.data.token }, 401);
  const reactivatedLogin = await login("client.lifecycle@example.test");
  await request("GET", "/favorites", { token: reactivatedLogin.data.token });
  const reactivated = (await pool.query(
    "SELECT status,self_deactivated_at,auth_version,email_verified_at FROM users WHERE id=$1",
    [client.id],
  )).rows[0];
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(reactivated.self_deactivated_at, null);
  assert.equal(reactivated.auth_version, 3);
  assert.ok(reactivated.email_verified_at);
  assert.notEqual(firstPin, validPin);
  console.log("PASS cooldown, attempts, expiry, one-use PIN and auth_version prevent old JWT revival");

  const paymentClient = await insertUser("CLIENT", "44444444-4", "payment.lifecycle@example.test");
  const paymentOrder = (await pool.query(`
    INSERT INTO online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at)
    VALUES ($1,'payment-state-block','DELIVERED',1000,'PICKUP',now()-interval '1 hour') RETURNING id
  `, [paymentClient.id])).rows[0];
  await pool.query(`
    INSERT INTO online_payments(order_id,buy_order,session_id,amount,status)
    VALUES ($1,'LIFECYCLEPAYMENT1','lifecycle-payment-session',1000,'PROCESSING')
  `, [paymentOrder.id]);
  const paymentClientLogin = await login("payment.lifecycle@example.test");
  await request("POST", "/users/me/deactivate", {
    token: paymentClientLogin.data.token,
    body: { password },
  }, 409);
  await pool.query("UPDATE online_payments SET status='FAILED' WHERE order_id=$1", [paymentOrder.id]);
  await request("POST", "/users/me/deactivate", {
    token: paymentClientLogin.data.token,
    body: { password },
  });
  console.log("PASS CREATED/PROCESSING Webpay state blocks deactivation independently of terminal order state");

  const adminManaged = await insertUser("CLIENT", "55555555-5", "admin-managed.lifecycle@example.test", "INACTIVE", new Date());
  const beforeAdminVersion = (await pool.query("SELECT auth_version FROM users WHERE id=$1", [adminManaged.id])).rows[0].auth_version;
  await request("PATCH", `/users/${adminManaged.id}`, {
    token: adminLogin.data.token,
    body: { status: "ACTIVE" },
  });
  const manuallyReactivated = (await pool.query(
    "SELECT status,self_deactivated_at,auth_version FROM users WHERE id=$1",
    [adminManaged.id],
  )).rows[0];
  assert.equal(manuallyReactivated.status, "ACTIVE");
  assert.equal(manuallyReactivated.self_deactivated_at, null);
  assert.equal(manuallyReactivated.auth_version, beforeAdminVersion + 1);
  await request("PATCH", `/users/${adminManaged.id}`, {
    token: adminLogin.data.token,
    body: { status: "INACTIVE" },
  });
  const adminInactivated = (await pool.query(
    "SELECT self_deactivated_at,auth_version FROM users WHERE id=$1",
    [adminManaged.id],
  )).rows[0];
  assert.equal(adminInactivated.self_deactivated_at, null);
  await request("POST", "/auth/client-reactivation/request", {
    body: { identifier: "admin-managed.lifecycle@example.test", password },
  }, 403);
  console.log("PASS ADMIN status changes clear voluntary marker, rotate sessions and cannot be self-reversed");

  const resetTokenBefore = reactivatedLogin.data.token;
  await request("POST", "/auth/password-reset/request", {
    body: { email: "client.lifecycle@example.test" },
  }, 202);
  const resetMessage = smtp.messages.at(-1);
  const decodedResetMessage = resetMessage.replace(/=\n/g, "").replace(/=3D/gi, "=");
  const resetSecret = decodedResetMessage.match(/[?&]token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(resetSecret, "The password reset email must contain the one-use token");
  const newPassword = "Lifecycle-New-2026!";
  await request("POST", "/auth/password-reset/confirm", {
    body: { token: resetSecret, password: newPassword },
  });
  await request("GET", "/favorites", { token: resetTokenBefore }, 401);
  await login("client.lifecycle@example.test", password, 401);
  await login("client.lifecycle@example.test", newPassword);
  console.log("PASS password reset rotates auth_version and invalidates prior sessions");
} finally {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  try { await smtp.close(); } catch { /* already closed */ }
  for (const pool of pools) await pool.end();
  for (const name of created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await rm(migrationFolder, { recursive: true, force: true });
}
