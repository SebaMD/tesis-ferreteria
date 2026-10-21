// Private disposable cluster only. Does not load .env, run seed or access 5432/5433.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryParent = path.join(backend, "tmp");
mkdirSync(temporaryParent, { recursive: true });
const root = mkdtempSync(path.join(temporaryParent, "fyf-delivery-test-"));
const bin = process.env.PG_TEST_BIN || "C:/Program Files/PostgreSQL/18/bin";
const suites = {
  tariffs: { port: 55446, file: "deliveryTariffs.integration.mjs", variable: "DELIVERY_TEST_DATABASE_URL" },
  promotions: { port: 55445, file: "promotions.integration.mjs", variable: "PROMOTIONS_TEST_DATABASE_URL" },
  email: { port: 55441, file: "emailVerification.integration.mjs", variable: "EMAIL_VERIFICATION_TEST_DATABASE_URL" },
  logistics: { port: 55440, file: "block4b.integration.mjs", variable: "BLOCK4B_TEST_DATABASE_URL" },
};
const suite = suites[process.env.DELIVERY_TEST_SCOPE || "tariffs"];
if (!suite) throw new Error("Unsupported isolated test scope");
const run = (name, args, extra = {}) => execFileSync(name, args, { cwd: backend, stdio: "inherit", windowsHide: true, env: { ...process.env, ...extra } });
let running = false;
try {
  run(path.join(bin, "initdb.exe"), ["-D", path.join(root, "data"), "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C", "--no-sync"]);
  run(path.join(bin, "pg_ctl.exe"), ["-D", path.join(root, "data"), "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${suite.port} -c timezone=UTC`, "-w", "start"]);
  running = true;
  run(process.execPath, [`tests/${suite.file}`], { [suite.variable]: `postgresql://postgres@127.0.0.1:${suite.port}/postgres`, MAIL_ENABLED: "false", WEBPAY_ENVIRONMENT: "integration" });
} finally {
  if (running) run(path.join(bin, "pg_ctl.exe"), ["-D", path.join(root, "data"), "-m", "fast", "-w", "stop"]);
  const resolved = realpathSync(root);
  if (!resolved.startsWith(realpathSync(temporaryParent) + path.sep) || !path.basename(resolved).startsWith("fyf-delivery-test-")) throw new Error("Unsafe cleanup target");
  rmSync(resolved, { recursive: true });
}
