// Creates ONLY a private PostgreSQL cluster under backend/tmp. Never reads .env.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(backend, "tmp", `fyf-seed-audit-${randomBytes(8).toString("hex")}`);
const pgBin = process.env.PG_TEST_BIN || "C:/Program Files/PostgreSQL/18/bin";
const run = (file, args, env = {}) => execFileSync(file, args, { cwd: backend, stdio: "inherit", windowsHide: true, env: { ...process.env, TZ: "UTC", ...env } });
mkdirSync(root, { recursive: true });
let running = false;
function start(port) {
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", path.join(root, "data"), "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c timezone=UTC`, "-w", "start"]);
  running = true;
}
function stop() { if (running) { run(path.join(pgBin, "pg_ctl.exe"), ["-D", path.join(root, "data"), "-m", "fast", "-w", "stop"]); running = false; } }
try {
  run(path.join(pgBin, "initdb.exe"), ["-D", path.join(root, "data"), "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C", "--no-sync"]);
  start(55444);
  const url = "postgresql://postgres@127.0.0.1:55444/postgres";
  const administrationOnly = ["administration", "deletion"].includes(process.env.FAMILY_TEST_SCOPE);
  run(process.execPath, [administrationOnly ? "tests/productFamilyAdministration.integration.mjs" : "tests/productFamilies.integration.mjs"], { FAMILY_TEST_DATABASE_URL: url });
  if (!administrationOnly && process.env.FAMILY_VISUAL_SERVER !== "1" && process.env.FAMILY_TEST_SCOPE !== "core") {
  run(process.execPath, ["tests/seed.integration.mjs"], { SEED_TEST_DATABASE_URL: url });
  run(process.execPath, ["tests/catalogPagination.integration.mjs"], { CATALOG_PAGINATION_TEST_DATABASE_URL: url });
  stop();
  start(55445);
  run(process.execPath, ["tests/promotions.integration.mjs"], { PROMOTIONS_TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:55445/postgres" });
  stop();
  start(55440);
  run(process.execPath, ["tests/block4b.integration.mjs"], { BLOCK4B_TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:55440/postgres", MAIL_ENABLED: "false" });
  stop();
  start(55441);
  // SMTP is an in-process fake loopback server; Webpay is stubbed by the suite.
  run(process.execPath, ["tests/emailVerification.integration.mjs"], { EMAIL_VERIFICATION_TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:55441/postgres" });
  }
} finally {
  stop();
  // Exact newly-created path checked; no project files or pre-existing DB removed.
  const resolved = realpathSync(root);
  if (!resolved.startsWith(path.join(backend, "tmp") + path.sep) || !/^fyf-seed-audit-[a-f0-9]+$/.test(path.basename(resolved))) throw new Error("Unsafe cleanup target");
  rmSync(resolved, { recursive: true });
}
