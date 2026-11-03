// Preparation only: no DB imports, network downloads, seed or application uploads.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { demoImageIdentity } from '../dist/db/demo/imageManifest.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reviewRoot = path.join(root, 'docs/seed-catalog-review');
const digest = value => createHash('sha256').update(value).digest('hex');
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
const saveJson = (filename, value) => writeFile(filename, JSON.stringify(value, null, 2) + '\n');
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const lines = (text, limit) => String(text).split(/\s+/).reduce((out, word) => {
  if (!out.length || out.at(-1).length + word.length + 1 > limit) out.push(word); else out[out.length - 1] += ' ' + word;
  return out;
}, []);
const textLines = (text, x, y, limit, size, weight = 400, color = '#17212f') => lines(text, limit).map((line, i) => `<text x="${x}" y="${y + i * (size + 9)}" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(line)}</text>`).join('');

// Read only the existing data literal; never evaluate TS or import DB services.
export function reviewedFamilies(source) {
  const tree = ts.createSourceFile('families.ts', source, ts.ScriptTarget.Latest, true);
  let literal;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'demoFamilies') literal = node.initializer; ts.forEachChild(node, visit); }
  visit(tree);
  function value(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(prop => {
      if (!ts.isPropertyAssignment(prop)) throw Error('Definición de familias no literal');
      return [prop.name.getText(tree), value(prop.initializer)];
    }));
    throw Error('Formato de familias no compatible: revisar, no inferir');
  }
  if (!literal) throw Error('Falta demoFamilies');
  return value(literal);
}

export function referenceSymbol(name) {
  if (/^(Pintura spray|Lubricante)/.test(name)) return '<rect x="120" y="95" width="120" height="190" rx="18"/><path d="M135 95V65h90v30M155 65V40h50v25M140 155h80M140 230h80"/>';
  if (/^Brocha/.test(name)) return '<path d="M105 60h150v100l-40 30v110h-70V190l-40-30Z M105 135h150M130 60v60M155 60v60M180 60v60M205 60v60M230 60v60"/>';
  if (/^Rodillo/.test(name)) return '<rect x="55" y="55" width="220" height="75" rx="16"/><path d="M275 92h30v80H180v45M155 217h50v90h-50Z"/>';
  if (/^Bandeja/.test(name)) return '<path d="M75 60h210l30 220H45Z M90 85h180v80H90Z M95 195h170M85 225h190M75 255h210"/>';
  if (/^Llana/.test(name)) return '<path d="M50 175 265 120 310 205 95 265Z M125 160v-65l100-25v65 M140 90l70-17"/>';
  if (/^Espátula/.test(name)) return '<path d="M85 55h190l-20 125-55 25v105h-40V205l-55-25Z M103 165h154"/>';
  if (/^Tarugo/.test(name)) return '<path d="M140 45h80v210l-40 55-40-55Z M125 45h110M160 100h40M160 140h40M160 180h40M180 45v225"/>';
  if (/^Clavo/.test(name)) return '<path d="M125 55h110v25H125ZM170 80v190l10 40 10-40V80"/>';
  if (/^Amarras/.test(name)) return '<path d="M80 90h55v55H80ZM135 108h150v20H135M110 145v90c0 80 140 80 140 0v-90"/>';
  if (/^Malla/.test(name)) return '<rect x="50" y="60" width="260" height="240" rx="8"/>' + [95,140,185,230,275].map(x => `<path d="M${x} 60v240"/>`).join('') + [105,150,195,240].map(y => `<path d="M50 ${y}h260"/>`).join('');
  if (/^(Disco|Sierra copa)/.test(name)) return '<circle cx="180" cy="175" r="125"/><circle cx="180" cy="175" r="30"/><path d="M180 50v60M180 240v60M55 175h60M245 175h60M92 87l45 45M223 219l45 45M92 263l45-45M223 132l45-45"/>';
  if (/^(Broca|Set EMTOP)/.test(name)) return '<path d="M150 285V100l30-55 30 55v185ZM150 130l60-30M150 180l60-30M150 230l60-30M150 280l60-30"/>';
  if (/^Alicate/.test(name)) return '<path d="m125 50 20 90 35 35 35-35 20-90M145 140l-45 155M215 140l45 155"/><circle cx="180" cy="175" r="18"/>';
  if (/^(Combo|Martillo)/.test(name)) return '<path d="M165 125v180h45V125M65 50h150l70 45-25 40-65-25H65Z"/>';
  if (/^Llave/.test(name)) return '<path d="m140 55 5 60 35 25 35-25 5-60c65 40 35 100-10 115v110c0 40-60 40-60 0V170c-45-15-75-75-10-115Z"/>';
  if (/^Soplete/.test(name)) return '<path d="M90 220h90v75H90ZM130 220V120h125V85M115 120V85h140M255 75h50v30h-50M180 140h50v55h-50"/>';
  throw Error('Tipo visual no revisado: ' + name);
}

export function referenceCardSvg(article) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><rect width="900" height="900" fill="#f5f6f8"/><rect x="24" y="24" width="852" height="852" rx="28" fill="#fff" stroke="#d6dee8"/><path d="M52 24h796v12H52Z" fill="#d87900"/><g font-family="Arial,sans-serif"><text x="65" y="92" font-size="25" font-weight="700" fill="#a95400">FYF · DEMOSTRACIÓN ACADÉMICA</text><text x="65" y="130" font-size="22" fill="#475569">FICHA GRÁFICA ORIGINAL · REFERENCIAL</text><circle cx="450" cy="340" r="165" fill="#fff4e5"/><g transform="translate(300 180) scale(.84)" fill="none" stroke="#a95400" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${referenceSymbol(article.name)}</g><text x="450" y="535" text-anchor="middle" font-size="22" font-weight="700" fill="#475569">ESQUEMA GENÉRICO · NO ES FOTO DEL MODELO</text>${textLines(article.name,65,590,49,29,700)}${textLines(article.specification,65,710,65,24)}<text x="65" y="812" font-size="21" fill="#475569">Ref. ${xml(article.supplierCode)} · ${xml(article.brand || 'Marca no identificada')}</text><text x="65" y="849" font-size="19" fill="#475569">Datos de la seed. Sin escala; no acredita envase, color ni acabado real.</text></g></svg>`;
}

export async function prepareDemoImageReview(destination = path.join(reviewRoot, 'reference-package')) {
  const catalog = await json(path.join(reviewRoot, 'catalog.json'));
  const groups = (await json(path.join(reviewRoot, 'research-groups.json'))).groups;
  const originals = await json(path.join(reviewRoot, 'extracted-images.json'));
  const families = reviewedFamilies(await readFile(path.join(root,'backend/src/db/demo/families.ts'),'utf8'));
  if (catalog.products.length !== 96 || new Set(catalog.products.map(p=>p.key)).size !== 96) throw Error('Catálogo inesperado');
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
  await mkdir(path.join(destination,'images'), {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const entries = [], report = [];
  const evidence = {
    id:'FYF-ORIGINAL-REFERENCE-CARDS-v1', createdFor:'Quinta etapa de imágenes de la demo académica FYF, solicitud del usuario del 2026-11-02',
    kind:'ORIGINAL_PROJECT_GRAPHICS', scope:'academic-web',
    source:'backend/scripts/prepare-demo-image-review.mjs; native SVG paths and factual labels, no supplier artwork, external downloads, logos or stock photographs',
    generatorSha256:digest(await readFile(fileURLToPath(import.meta.url))),
    limitations:'Generic diagrams, not product photographs, not scale drawings and not manufacturer-endorsed. Brand names identify the seed SKU only. No rights over supplier assets are granted. For academic demo only; own product photos remain necessary for commercial deployment.'
  };
  await saveJson(path.join(destination,'rights-evidence.json'),evidence);
  const evidenceSha256=digest(await readFile(path.join(destination,'rights-evidence.json')));
  try {
    const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1});
    await page.route('**/*',route=>route.abort());
    for(const article of catalog.products) {
      const group=groups.filter(g=>g.codes.includes(article.supplierCode));
      if(group.length!==1)throw Error('Investigación incompleta/duplicada: '+article.key);
      const family=families.filter(f=>f.members.some(m=>m[0]===article.supplierCode));
      if(family.length>1)throw Error('Familia ambigua');
      const svg=referenceCardSvg(article), graphicHash=digest(svg);
      const filename=`${article.supplierCode}-${demoImageIdentity(article).slice(0,12)}.png`;
      const file=path.join(destination,'images',filename);
      await page.setContent(svg); await page.evaluate(()=>document.fonts.ready);
      const buffer=await page.locator('svg').screenshot({type:'png',animations:'disabled'});
      try { await writeFile(file,buffer,{flag:'wx'}); } catch(error) { if(error.code!=='EEXIST'||digest(await readFile(file))!==digest(buffer))throw error; }
      const entry={productKey:article.key,file:'images/'+filename,sha256:digest(buffer),width:900,height:900,
        sourceDocument:article.source.document,sourcePage:article.source.page,assetKind:'ORIGINAL_REFERENCE_CARD',
        identitySha256:demoImageIdentity(article),graphicSourceSha256:graphicHash,
        rightsStatus:'AUTHORIZED',publish:true,
        authorization:{scope:'academic-web',reference:evidence.id+'; rights-evidence.json; original project artwork, not supplier permission',evidenceFile:'rights-evidence.json',evidenceSha256}};
      entries.push(entry);
      const local=originals.find(e=>e.productKey===article.key);
      if(local && digest(await readFile(path.join(reviewRoot,local.file)))!==local.sha256)throw Error('Foto privada alterada: '+article.key);
      report.push({productKey:article.key,name:article.name,brand:article.brand,model:article.model,category:article.categoryName,
        family:family[0]?.name||null,variant:family[0]?Object.fromEntries(family[0].attributes.map((name,i)=>[name,family[0].members.find(m=>m[0]===article.supplierCode)[i+1]])):null,
        specification:article.specification,unitMeasure:article.unitMeasure,source:article.source,
        requiredVisualChecks:[article.specification,group[0].notes],research:group[0],
        supplierImage:local?{...local,status:'PENDING_AUTHORIZATION',currentHashVerified:true}:null,
        externalImage:{originalUrl:group[0].url,imageUrl:null,matchType:group[0].match,visualVerification:'NOT_COMPLETED_NO_DOWNLOAD',licenseEvidence:null,rightsStatus:group[0].url?'PENDING_AUTHORIZATION':'NO_IMAGE'},
        preparedImage:{...entry,matchType:'REFERENTIAL',status:'PREPARED_ORIGINAL_REFERENCE_NOT_PHOTOGRAPH'}});
    }
  } finally {await browser.close();}
  if(new Set(entries.map(e=>e.sha256)).size!==96)throw Error('Gráficas repetidas entre SKU');
  await saveJson(path.join(destination,'extracted-images.json'),entries);
  const summary={reviewedSku:96,originalReferenceCards:entries.length,authorizedSupplierPhotographs:0,privateSupplierPhotographs:originals.length,
    externalProductPagesByMatch:Object.fromEntries(['EXACT_PRODUCT_PAGE','REFERENTIAL','AMBIGUOUS','NO_RESULT'].map(kind=>[kind,report.filter(r=>r.research.match===kind).length])),
    missingExactAuthorizedPhotograph:96,totalImageBytes:(await Promise.all(entries.map(e=>readFile(path.join(destination,e.file))))).reduce((n,b)=>n+b.length,0),
    skuWithPhotographicLead:report.filter(r=>r.supplierImage||r.research.url).length,
    skuWithoutPhotographicLead:report.filter(r=>!r.supplierImage&&!r.research.url).length,
    databaseChecked:false,databaseWrites:0,externalDownloads:0};
  await saveJson(path.join(reviewRoot,'image-review.json'),{checkedAt:'2026-11-02',summary,products:report});
  const esc=value=>String(value??'—').replaceAll('|','\\|').replaceAll('\n',' ');
  await writeFile(path.join(reviewRoot,'image-review.md'),'# Revisión de imágenes: 96 SKU\n\nLas fichas originales son referenciales, NO fotografías exactas. Ninguna foto externa tiene autorización comprobada. Ver JSON para identidad, familia, variante, permisos, hashes y criterios visuales completos.\n\n'+JSON.stringify(summary,null,2)+'\n\n| SKU (clave estable) | Nombre · marca/modelo | Medida/presentación | Familia · variante | Investigación de foto | Fuente original | Permiso de fotografía | Archivo preparado | Observaciones |\n|---|---|---|---|---|---|---|---|---|\n'+report.map(r=>`| ${esc(r.productKey)} | ${esc(r.name)} · ${esc(r.brand)}/${esc(r.model)} | ${esc(r.specification)} | ${esc(r.family)} · ${esc(r.variant?JSON.stringify(r.variant):'Simple')} | ${r.research.match} | ${r.research.url?`[fuente](${r.research.url})`:'Sin resultado fiable'} | ${r.supplierImage||r.research.url?'Pendiente; no publicar foto':'Sin foto'} | [ficha referencial](reference-package/${r.preparedImage.file}) | ${esc(r.research.notes)} |`).join('\n')+'\n');
  const cards=report.map(r=>`<article><img loading="lazy" src="${xml(r.preparedImage.file)}" alt="Ficha gráfica referencial, no fotografía: ${xml(r.name)}"><h2>${xml(r.name)}</h2><p>${xml(r.productKey)}</p></article>`).join('');
  await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>96 fichas referenciales FYF</title><style>body{font-family:Arial,sans-serif;margin:24px;background:#f5f6f8;color:#17212f}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{background:white;padding:12px;border:1px solid #d6dee8;border-radius:12px}img{width:100%;height:auto}h2{font-size:15px}p{overflow-wrap:anywhere;font-size:12px}</style><h1>FYF · 96 fichas referenciales</h1><p>No son fotografías de productos reales. No acreditan envase, color ni escala. Fuentes y permisos de fotos de proveedores permanecen pendientes.</p><main>${cards}</main></html>`);
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if(args.length>1)throw Error('Uso: node scripts/prepare-demo-image-review.mjs [directorio-salida]');
  console.log(JSON.stringify(await prepareDemoImageReview(args[0]?path.resolve(args[0]):undefined),null,2));
}
