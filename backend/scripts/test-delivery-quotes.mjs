import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const parent=path.join(backend,"tmp");mkdirSync(parent,{recursive:true});
const root=mkdtempSync(path.join(parent,"fyf-quote-test-"));
const bin=process.env.PG_TEST_BIN||"C:/Program Files/PostgreSQL/18/bin";
const run=(exe,args,env={})=>execFileSync(exe,args,{cwd:backend,windowsHide:true,stdio:"inherit",env:{...process.env,...env}});
let running=false;
try{
  run(path.join(bin,"initdb.exe"),["-D",path.join(root,"data"),"-U","postgres","-A","trust","--encoding=UTF8","--locale=C","--no-sync"]);
  run(path.join(bin,"pg_ctl.exe"),["-D",path.join(root,"data"),"-l",path.join(root,"postgres.log"),"-o","-h 127.0.0.1 -p 55448 -c timezone=UTC","-w","start"]);running=true;
  run(process.execPath,["tests/deliveryQuotes.integration.mjs"],{DELIVERY_QUOTES_TEST_DATABASE_URL:"postgresql://postgres@127.0.0.1:55448/postgres",WEBPAY_ENVIRONMENT:"integration",MAIL_ENABLED:"false"});
}finally{
  if(running)run(path.join(bin,"pg_ctl.exe"),["-D",path.join(root,"data"),"-m","fast","-w","stop"]);
  const resolved=realpathSync(root);if(!resolved.startsWith(realpathSync(parent)+path.sep)||!path.basename(resolved).startsWith("fyf-quote-test-"))throw Error("Unsafe cleanup target");
  rmSync(resolved,{recursive:true});
}
