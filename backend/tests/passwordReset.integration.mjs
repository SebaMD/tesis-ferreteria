// PASSWORD_RESET_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55442/postgres node tests/passwordReset.integration.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const rootUrl = new URL(process.env.PASSWORD_RESET_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55442",
  "Use the isolated PostgreSQL cluster on port 55442",
);

function createSmtpServer() {
  const messages = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.write("220 localhost FYF reset test SMTP\r\n");
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

function resetTokenFrom(message) {
  const normalized = String(message).replace(/=\r?\n/g, "");
  const match = normalized.match(/token(?:=3D|=)([A-Za-z0-9_-]{43})/);
  assert.ok(match, "SMTP message must contain a password reset token");
  return match[1];
}

const suffix = randomBytes(4).toString("hex");
const databaseNames = [`fyf_reset_upgrade_${suffix}`, `fyf_reset_clean_${suffix}`];
const createdDatabases = [];
const pools = [];
const migrationFolder = await mkdtemp(path.join(tmpdir(), "fyf-reset-migrations-"));
const admin = new pg.Client({ connectionString: rootUrl.href });
const smtp = createSmtpServer();
let httpServer;
let applicationDb;

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const previousEntries = journal.entries.filter((entry) => entry.idx <= 19);
  await mkdir(path.join(migrationFolder, "meta"));
  await writeFile(path.join(migrationFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previousEntries }));
  for (const entry of previousEntries) {
    await copyFile(`drizzle/${entry.tag}.sql`, path.join(migrationFolder, `${entry.tag}.sql`));
  }

  for (const name of databaseNames) {
    await admin.query(`CREATE DATABASE "${name}"`);
    createdDatabases.push(name);
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
  const oldPassword = "Clave-Antigua-2026!";
  const passwordHash = await bcrypt.hash(oldPassword, 4);
  const users = [
    ["12345678-9", "Cliente", "Reset", "reset@example.test"],
    ["11222333-9", "Cliente", "Concurrente", "concurrent@example.test"],
    ["55666777-2", "Cliente", "Limite", "rate@example.test"],
    ["98765432-5", "Cliente", "Smtp", "smtp@example.test"],
  ];
  for (const [rut, names, surnames, correo] of users) {
    await pool.query(`INSERT INTO users(role_id,rut,names,surnames,correo,password)
      VALUES ((SELECT id FROM roles WHERE name='CLIENT'),$1,$2,$3,$4,$5)`, [rut, names, surnames, correo, passwordHash]);
  }
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  assert.equal((await pool.query("SELECT to_regclass('public.password_reset_tokens') AS table_name")).rows[0].table_name, "password_reset_tokens");
  assert.equal((await pool.query("SELECT count(*) FROM users")).rows[0].count, "4");
  console.log("PASS incremental migration 0019 -> 0020 preserves existing users");

  const cleanPool = new pg.Pool({ connectionString: connection(databaseNames[1]) });
  pools.push(cleanPool);
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  assert.equal(
    (await cleanPool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count,
    String(journal.entries.length),
  );
  console.log("PASS clean migrations 0000 -> 0020");

  await smtp.listen();
  process.env.DATABASE_URL = connection(databaseNames[0]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "true";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port());
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.MAIL_FROM = "Ferreteria FYF <no-reply@example.test>";
  process.env.FRONTEND_URL = "https://fyf.example.test";

  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}/api`;
  const request = async (method, route, body, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
    return payload;
  };

  const unknown = await request("POST", "/auth/password-reset/request", { email: "missing@example.test" }, 202);
  const known = await request("POST", "/auth/password-reset/request", { email: " RESET@EXAMPLE.TEST " }, 202);
  assert.equal(unknown.message, known.message);
  assert.equal(smtp.messages.length, 1);
  const token = resetTokenFrom(smtp.messages[0]);
  assert.ok(!JSON.stringify(known).includes(token));
  const stored = (await pool.query("SELECT token_hash,sent_at,consumed_at FROM password_reset_tokens")).rows[0];
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(stored.token_hash, token);
  assert.ok(stored.sent_at);
  assert.equal(stored.consumed_at, null);
  console.log("PASS generic non-enumerating request, normalized email, opaque token and hash-only storage");

  await request("POST", "/auth/password-reset/confirm", { token: randomBytes(32).toString("base64url"), password: "Nueva-Clave-2026!" }, 400);
  await request("POST", "/auth/password-reset/confirm", { token, password: "Nueva-Clave-2026!" });
  await request("POST", "/auth/password-reset/confirm", { token, password: "Otra-Clave-2026!" }, 400);
  await request("POST", "/auth/login", { correo: "reset@example.test", password: oldPassword }, 401);
  await request("POST", "/auth/login", { correo: "reset@example.test", password: "Nueva-Clave-2026!" });
  console.log("PASS reset changes password, old login fails, new login succeeds and replay is rejected");

  await pool.query("UPDATE password_reset_tokens SET created_at=now()-interval '10 minutes'");
  await request("POST", "/auth/password-reset/request", { email: "reset@example.test" }, 202);
  const expiredToken = resetTokenFrom(smtp.messages.at(-1));
  await pool.query("UPDATE password_reset_tokens SET created_at=now()-interval '40 minutes', expires_at=now()-interval '1 second' WHERE token_hash=$1", [createHash("sha256").update(expiredToken).digest("hex")]);
  await request("POST", "/auth/password-reset/confirm", { token: expiredToken, password: "Expirada-2026!" }, 400);
  console.log("PASS expired reset link is rejected");

  await request("POST", "/auth/password-reset/request", { email: "concurrent@example.test" }, 202);
  const concurrentToken = resetTokenFrom(smtp.messages.at(-1));
  const confirmConcurrent = () => fetch(`${base}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: concurrentToken, password: "Concurrente-2026!" }),
  });
  const concurrentStatuses = (await Promise.all([confirmConcurrent(), confirmConcurrent()])).map((response) => response.status).sort();
  assert.deepEqual(concurrentStatuses, [200, 400]);
  console.log("PASS concurrent reset consumes the token exactly once");

  const rateUserId = (await pool.query("SELECT id FROM users WHERE correo='rate@example.test'")).rows[0].id;
  for (let index = 0; index < 3; index += 1) {
    await request("POST", "/auth/password-reset/request", { email: "rate@example.test" }, 202);
    await pool.query("UPDATE password_reset_tokens SET created_at=now()-interval '2 minutes' WHERE user_id=$1 AND created_at=(SELECT max(created_at) FROM password_reset_tokens WHERE user_id=$1)", [rateUserId]);
  }
  const beforeSuppressed = smtp.messages.length;
  await request("POST", "/auth/password-reset/request", { email: "rate@example.test" }, 202);
  assert.equal(smtp.messages.length, beforeSuppressed);
  assert.equal((await pool.query("SELECT count(*) FROM password_reset_tokens WHERE user_id=$1", [rateUserId])).rows[0].count, "3");
  console.log("PASS persistent 60-second cooldown and maximum three requests per rolling hour remain non-enumerating");

  await smtp.close();
  await request("POST", "/auth/password-reset/request", { email: "smtp@example.test" }, 202);
  const failedDelivery = (await pool.query("SELECT sent_at,consumed_at FROM password_reset_tokens WHERE user_id=(SELECT id FROM users WHERE correo='smtp@example.test')")).rows[0];
  assert.equal(failedDelivery.sent_at, null);
  assert.ok(failedDelivery.consumed_at);
  console.log("PASS SMTP failure returns the same generic response and leaves no usable reset token");
} finally {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  try { await smtp.close(); } catch { /* already closed */ }
  for (const pool of pools) await pool.end();
  for (const name of createdDatabases) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await rm(migrationFolder, { recursive: true, force: true });
}
