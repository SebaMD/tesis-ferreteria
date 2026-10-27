// Restore an already migrated ISOLATED schema, without running migrations or seed.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";
const backend=process.cwd(),parent=path.join(backend,"tmp");mkdirSync(parent,{recursive:true});
const root=mkdtempSync(path.join(parent,"fyf-bundle-test-"));
const bin=process.env.PG_TEST_BIN||"C:/Program Files/PostgreSQL/18/bin";
const source="postgresql://postgres@127.0.0.1:55449/fyf_revision_manual";
const run=(exe,args,env={})=>execFileSync(exe,args,{cwd:backend,windowsHide:true,stdio:"inherit",env:{...process.env,...env}});
const sourcePool=new pg.Pool({connectionString:source});let running=false;
try{
  const directory=(await sourcePool.query("show data_directory")).rows[0].data_directory.replaceAll("\\","/");
  if(!/\/fyf-manual-review-[^/]+\/data$/.test(directory))throw new Error("Source is not the isolated manual review cluster");
  const revisions=(await sourcePool.query("select * from drizzle.__drizzle_migrations order by id")).rows;
  if(revisions.length!==31)throw new Error("Expected the existing 31-revision isolated schema");
  const dump=path.join(root,"schema.dump");
  run(path.join(bin,"pg_dump.exe"),["--dbname",source,"--schema-only","--format=custom","--file",dump,"--no-owner","--no-privileges"]);
  run(path.join(bin,"initdb.exe"),["-D",path.join(root,"data"),"-U","postgres","-A","trust","--encoding=UTF8","--locale=C","--no-sync"]);
  run(path.join(bin,"pg_ctl.exe"),["-D",path.join(root,"data"),"-l",path.join(root,"postgres.log"),"-o","-h 127.0.0.1 -p 55447 -c timezone=UTC","-w","start"]);running=true;
  const target="postgresql://postgres@127.0.0.1:55447/postgres";
  run(path.join(bin,"pg_restore.exe"),["--dbname",target,"--no-owner","--no-privileges","--exit-on-error",dump]);
  const targetPool=new pg.Pool({connectionString:target});
  try{for(const r of revisions)await targetPool.query("insert into drizzle.__drizzle_migrations(id,hash,created_at) values($1,$2,$3)",[r.id,r.hash,r.created_at]);}finally{await targetPool.end();}
  run(process.execPath,["tests/productBundles.integration.mjs"],{BUNDLE_TEST_DATABASE_URL:target,BUNDLE_TEST_SCHEMA_READY:"1",MAIL_ENABLED:"false",WEBPAY_ENVIRONMENT:"integration",BUNDLE_VISUAL_TEST:process.env.BUNDLE_VISUAL_TEST||"0",BUNDLE_VISUAL_STOP_FILE:path.join(root,"review.stop")});
}finally{
  await sourcePool.end();
  if(running)run(path.join(bin,"pg_ctl.exe"),["-D",path.join(root,"data"),"-m","fast","-w","stop"]);
  const resolved=realpathSync(root);
  if(!resolved.startsWith(realpathSync(parent)+path.sep)||!path.basename(resolved).startsWith("fyf-bundle-test-"))throw new Error("Unsafe isolated cleanup");
  rmSync(resolved,{recursive:true});
}
