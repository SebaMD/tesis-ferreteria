// Separate, review-only image package. Never imports DB, replaces cards or publishes.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const reviewRoot=fileURLToPath(new URL('../../docs/seed-catalog-review/',import.meta.url));
export const destination=path.join(reviewRoot,'realistic-package');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const saveJson=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function physicalSubject(p) {
  const n=p.name,s=p.specification;
  if(n.startsWith('Pintura spray'))return `One unbranded 400 ml paint aerosol can, realistic metal cylinder with working spray nozzle and cap. Color/finish variant: ${s}. Use the corresponding cap color and show a small painted swatch as part of the product presentation, not a different paint color. Plain neutral packaging, no Rex marks. Fluorescent versions visibly high-visibility, not ordinary dull paint. No extra cans.`;
  if(n.startsWith('Brocha'))return `One flat paint brush of exactly this width: ${s}. Straight bristle edge, realistic separate bristles, a securely crimped steel ferrule and ${p.brand==='Lizcal'?'plain polished wooden handle; thickness of brush 5/8 inch':'unbranded molded plastic handle'}. Width must visibly match the requested variant, not a round artist brush. No brand styling.`;
  if(n.startsWith('Bandeja'))return 'One simple unbranded molded plastic paint tray with a deep paint reservoir and sloping ribbed roller-loading ramp. No rollers or kit accessories. Size and color not asserted as exact because original SKU lacks dimensions.';
  if(n.startsWith('Rodillo'))return `One complete hand paint roller with bent metal frame and molded neutral handle. ${s}. ${n.includes('100% lana')?'Natural wool cover, realistic dense wool fibers, not smooth foam.':'Short synthetic nap precisely 6 mm; not long-pile wool, not foam.'} Roller working width must match this SKU; proportion it against a roughly hand-length grip, not another width.`;
  if(n.startsWith('Llana'))return `One molded PLASTIC plastering trowel/float with a flat rectangular base and raised comfortable integral handle. ${n.includes('dentada')?'Clearly NOTCHED perimeter with regular rectangular teeth.':'SMOOTH straight base edges, no teeth.'} No steel blade or wooden handle. Generic design, dimensions not invented.`;
  if(n.startsWith('Espátula'))return `One flexible PLASTIC putty knife / paint scraper, ${s}, molded pale ivory polypropylene blade and integral short handle with hanging hole. Smooth straight blade edge. Blade width must be physically plausible relative to hand-size grip. No metal blade, no trowel, no serrations.`;
  if(n.startsWith('Tarugo tipo'))return `A generic expansion wall plug of nominal diameter ${s.split(';')[0]}, gray plastic sleeve with expansion slots and ribs. Show one sleeve in front of a plain transparent bag of matching sleeves, corresponding to a 1000-piece sales presentation. Do not show a Fischer brand logo or claim it is an original Fischer product. No screw unless part of sleeve silhouette. This is not a drywall butterfly anchor.`;
  if(n.startsWith('Tarugo de golpe'))return `A generic nail-in hammer fixing: nylon expansion sleeve and preassembled steel drive screw/nail. Exact nominal diameter x length and sales presentation: ${s}. Show one complete fixing and one plain clear bag of matching fixings. Not an ordinary bare screw or loose wooden dowel. Respect diameter-to-length ratio; no brand packaging.`;
  if(n.startsWith('Clavo'))return `A slim hardened-steel powder-actuated concrete drive pin, requested length ${n.match(/3,7 x (.+) pulgadas/)?.[1]} inches. Flat head and pointed tip, a small plain box of identical pins as 100-piece presentation. NOT a roofing nail, cartridge, screw or ordinary long wood nail. Source notation is ${s}; diameter notation needs manual checking, do not interpret 3.7 as inches of diameter. Neutral unbranded packaging.`;
  if(n.startsWith('Amarras'))return `WHITE nylon cable ties with a rectangular ratchet-lock head and finely ridged flexible strap. Exact nominal width x length: ${s}. Show one open tie, one loosely looped tie and a plain transparent 100-tie bundle. Long slender proportions for this length; not black, not metal, no brand marks.`;
  if(n.startsWith('Malla'))return `${n.includes('mosquitera')?'Fine green mosquito/insect screening mesh in a full 1.20 x 30 m roll, small tight mesh, not shade cloth.':`Dense knitted Raschel shade cloth, 80% shading (not rigid square welded wire). ${s}. ${s.includes('rollo completo')?'A complete long roll with its fabric end partly unrolled, not a small cut panel.':'A neatly folded complete cut sheet with one corner spread out to show fabric and edges, not a 100 m roll.'} ${s.includes('Verde/blanco')?'Clearly green and white alternating fabric bands.':s.includes('Azul/blanco')?'Clearly blue and white alternating fabric bands.':'Black fabric.'}`} No grommets, clips or accessories that the SKU does not specify. Exact stated dimensions are nominal; not a scale drawing.`;
  if(n.startsWith('Disco lija'))return `One abrasive FLAP sanding disc for an angle grinder, nominal diameter 115 and grit ${s.match(/grano (\d+)/)?.[1]}. Overlapping radial abrasive cloth flaps on a backing, central arbor hole. Distinguish grit texture: lower grit visibly coarser; higher grit finer. Not a saw blade, not a solid diamond cutting disc. Neutral markings only, no invented manufacturer label.`;
  if(n.includes('diamantado pulir'))return 'One 115 mm DOUBLE-ROW diamond grinding CUP wheel with raised segmented double rings, central arbor opening, physically three-dimensional cup dish. Not a flat cutting blade. No brand print.';
  if(n.includes('diamantado'))return 'One 180 mm dry-cut diamond saw disc, steel core with separated segmented diamond cutting rim and central arbor opening. No carbide wood-cutting teeth, no grinder cup. Generic neutral metal finish, no trademark.';
  if(n.startsWith('Disco sierra'))return 'One 7 1/4 inch circular WOOD saw blade with exactly 24 distinct carbide-tipped teeth, central arbor hole. Teeth must be countable; no 40T blade and no masonry diamond disc. Generic unbranded steel.';
  if(n.startsWith('Disco escofina'))return `One 100 mm wood/plastic carving rasp disc for angle grinder, with coarse punched raised rasp teeth, central opening. ${n.includes('trapecio')?'Trapezoid/conical raised profile, visibly not a flat wheel.':'Flat disc profile, visibly not a conical cup.'} No circular saw teeth, no diamond segments, no abrasive flap strips.`;
  if(n.startsWith('Broca paleta'))return 'One 1 1/4 inch wood spade drill bit, a flat paddle-shaped cutting head with central pointed spur, sharpened side lips and straight hexagonal shank. No masonry twist bit. Blade width 31.75 mm nominal, not a narrow 1/4-inch bit. Plain unbranded steel.';
  if(n.startsWith('Sierra copa madera'))return 'An unbranded 8-piece wood hole-saw kit laid out clearly on white: exactly five cylindrical toothed cup saws plus one arbor/pilot assembly, one hex key and one support plate (eight pieces total). Steel teeth and open cup interiors, no eight loose saw cups, no twist-drill set. No claims about unspecified cup diameters.';
  if(n.startsWith('Sierra copa puerta'))return 'An unbranded three-piece door lock installation cutting set: one approximately 54 mm toothed hole-saw cup, one pilot drill guide and one approximately 22 mm wood spade bit. Exactly three separate components. No large multi-size hole-saw case.';
  if(n.startsWith('Set EMTOP'))return n.includes('metal')?'Exactly six separate HSS twist drill bits for METAL in a plain clear blister/tray: graduated 2,3,4,5,6,8 mm sizes. Six bits, conical split points and metal-cutting helical flutes; no brad-point wood bits. No logo, no invented model text.':'Exactly five separate brad-point WOOD drill bits in a plain clear blister/tray, graduated sizes, sharp central spurs and wood-cutting lips. Five bits, not six metal bits. Do not print unspecified size values or brand logos.';
  if(n.startsWith('Alicate'))return `One ${n.includes('universal')?'combination pliers with blunt serrated jaws and wire cutting section near pivot':n.includes('cortante')?'diagonal side-cutting pliers with short beveled opposing cutters, no long jaws':'long-nose pliers with narrow tapered serrated pointed jaws'}. ${s}. Realistic steel pivot and neutral dark insulated-looking grips, but no electrical voltage certification claim. Full tool visible; no logo or imitation EMTOP trade dress. Match requested overall nominal length.`;
  if(n.startsWith('Combo'))return `One stoning/sledge hammer, ${s}. ${n.includes('10 libras')?'Long fiberglass handle appropriate to a 10 lb heavy sledge; large rectangular double-faced steel head.':'Short one-handed fiberglass handle; compact rectangular double-faced steel head whose size fits '+s+'.'} No claw, no ball peen, not a rubber mallet. Neutral handle, no brand logo.`;
  if(n.startsWith('Martillo'))return `One claw carpenter hammer, ${s}. ${n.includes('madera')?'Plain polished wooden handle; 29 mm striking face nominal.':'Fiberglass handle with neutral rubber grip; '+s+'.'} Realistic forged-steel head, one striking face and one nail-pulling split claw. Not a sledge, ball peen or rubber hammer. Exact commercial claw angle/handle molding unverified: generic design, no brand imprint.`;
  if(n.startsWith('Llave'))return 'One 10 mm combination wrench: open jaw at one end, closed offset 12-point ring at the other, polished chrome vanadium steel. Same 10 mm size both ends. Not an adjustable wrench, pliers or socket. No logo or unverified lettering.';
  if(n.startsWith('Soplete'))return `One handheld butane torch head/tool, ${s}. ${n.includes('con piezo')||n.includes('electrónico')?'Visible piezo trigger/ignition and gas control knob.':'Visible gas control knob and metal burner nozzle.'} ${n.includes('40 mm')?'Nozzle nominal 40 mm.':''} ${n.includes('360')?'Articulated metal burner suitable for orienting through a full turn; generic professional torch, not a small kitchen pen torch.':''} Do not invent manufacturer shell, connector, certifications or fuel-cylinder compatibility. No attached gas bottle (not included by SKU), no visible flame, no logo.`;
  if(n.startsWith('Lubricante'))return `One unbranded maintenance lubricant container holding nominal ${s.match(/\d+\s*ml/)?.[0]}. A realistically proportioned aerosol can with spray actuator and removable neutral cap, plain metallic packaging with restrained neutral design. Different capacity requires appropriate physical proportions, not the same can relabeled. No Rex/Truper/Toro Negro logo, no WD-40 branding or blue-yellow trade dress, no invented safety claims.`;
  throw Error('Unsupported product: '+n);
}
export async function buildPlan(){
  const report=await readJson(path.join(reviewRoot,'image-review.json'));
  return report.products.map(p=>({productKey:p.productKey,supplierCode:p.productKey.split(':').at(-1),name:p.name,
    identitySha256:p.preparedImage.identitySha256,referenceCard:p.preparedImage.file,
    prompt:`Use case: product-mockup. Asset: one square catalog illustration of the PHYSICAL ARTICLE, not a text card or infographic. Subject: ${physicalSubject(p)}\nStyle: realistic original high-detail 3D/studio illustration, convincing material texture and anatomy, white seamless background, soft contact shadow, entire object(s) inside frame with generous margins, 70-80% image occupancy, three-quarter view suitable for a hardware store. Not manufacturer photography; commercial identity cannot be certified. No brand name, logo, product code, price, arbitrary measurements text or fake packaging print. Only small bottom caption exactly "Ilustración referencial". No decorative extra tools, people or props. Render this SKU separately; do not collage different variants.`,
    requiredManualChecks:[p.specification,p.research.notes,'No acredita diseño exacto de marca/modelo ni medidas físicas por una imagen sin escala.'],
    sourceResearch:p.research,sourceSpecification:p.specification}));
}
export function validateGenerationRecords(records, plan) {
  const keys = new Set(plan.map(p => p.productKey));
  const seenKeys = new Set();
  const seenFiles = new Set();
  for (const record of records) {
    if (!keys.has(record.productKey) || seenKeys.has(record.productKey)) throw Error('Unknown or duplicate generation SKU');
    if (!/^exec-[a-z0-9-]+\.png$/i.test(record.generatedFile) || seenFiles.has(record.generatedFile)) throw Error('Invalid or shared generated image');
    if (typeof record.prompt !== 'string' || !record.prompt.trim()) throw Error('Missing generation prompt');
    seenKeys.add(record.productKey);
    seenFiles.add(record.generatedFile);
  }
}

export function visualCautions(p) {
  const notes = ['Revisar aspecto y proporciones contra el artículo real antes de aprobar. No acredita el diseño exacto de la marca ni una medida física sin escala.'];
  if (p.name.startsWith('Soplete')) notes.push('REVISIÓN PRIORITARIA: carcasa, boquilla, encendido y conector comerciales no verificados. El diseño es genérico, no una reproducción del modelo indicado.');
  if (p.name.startsWith('Clavo')) notes.push('REVISIÓN PRIORITARIA: se representa un clavo/pin genérico. Confirmar tipo de fijación a pólvora, cabeza/arandela y notación 3,7 antes de utilizar.');
  if (p.name.startsWith('Malla')) notes.push('El tejido ilustrado no certifica 80% de sombra ni dimensiones. Confirmar densidad, patrón de color y presentación paño/rollo.');
  if (p.name.startsWith('Brocha')) notes.push('El ancho nominal orienta el encargo; debe comprobarse la proporción final. Color del mango y virola no certificados por fabricante.');
  if (p.name.startsWith('Pintura')) notes.push('Tono y acabado ilustrativos: no son una carta de color del fabricante. Comparar especialmente verde normal/fluorescente y mate/brillante.');
  if (p.name.startsWith('Disco')) notes.push('Confirmar geometría, orificio y perfil. Si corresponde, contar 24 dientes. El aspecto no certifica grano abrasivo ni diámetro.');
  if (p.name.includes('set') || p.name.startsWith('Set')) notes.push('REVISIÓN PRIORITARIA: contar piezas y comprobar forma de puntas, montaje y accesorios; un encargo no garantiza su reproducción exacta.');
  if (p.supplierCode === '33') notes.push('REVISIÓN PRIORITARIA: conflicto previo de modelo WT-400/WT-110 y capacidad 110 ml; envase genérico sin afirmación de identidad comercial exacta.');
  return notes;
}
export async function assemble(sourceDirectory){
  const plan=await buildPlan(),records=await readJson(path.join(destination,'generation-records.json'));
  for(const file of (await readdir(destination)).filter(f=>/^generation-batch-\d+\.json$/.test(f)).sort())records.push(...await readJson(path.join(destination,file)));
  validateGenerationRecords(records, plan);
  const previous=await readJson(path.join(reviewRoot,'image-review.json'));
  await mkdir(path.join(destination,'images'),{recursive:true});
  const result=[];
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage();
  try {
  for(const p of plan){
    const record=records.find(r=>r.productKey===p.productKey);
    if(!record){result.push({...p,status:'CARD_ONLY_NO_REALISTIC_IMAGE',file:null});continue;}
    if(!/^exec-[a-z0-9-]+\.png$/i.test(record.generatedFile))throw Error('Unexpected generated filename');
    const original=await readFile(path.join(sourceDirectory,record.generatedFile));
    // Format/size optimization only: preserve full composition, no crop or repaint.
    const encoded=await page.evaluate(async base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const factor=Math.min(1,960/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return{url:canvas.toDataURL('image/webp',.88),width:canvas.width,height:canvas.height};},original.toString('base64'));
    const buffer=Buffer.from(encoded.url.split(',')[1],'base64');
    const file=`images/${p.supplierCode}-${hash(buffer).slice(0,12)}.webp`;
    try{await writeFile(path.join(destination,file),buffer,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||hash(await readFile(path.join(destination,file)))!==hash(buffer))throw e;}
    result.push({...p,requiredManualChecks:[...p.requiredManualChecks,...visualCautions(p)],prompt:record.prompt,file,sha256:hash(buffer),originalSha256:hash(original),bytes:buffer.length,width:encoded.width,height:encoded.height,generationTool:'BUILT_IN_IMAGE_GEN',generatedFile:record.generatedFile,
      assetKind:'REALISTIC_REFERENCE_ILLUSTRATION',rightsStatus:'ORIGINAL_GENERATED_NOT_SUPPLIER_PHOTOGRAPH',publish:false,
      status:'PREPARED_REQUIRES_VISUAL_REVIEW',visualReview:record.visualReview??'PENDING',note:'No aprobada como fotografía exacta, no publicada ni asociada en BD.'});
  }
  } finally {await browser.close();}
  const summary={sku:plan.length,preparedRealistic:result.filter(r=>r.file).length,cardOnly:result.filter(r=>!r.file).length,
    manualReviewRequired:result.filter(r=>r.file).length,authorizedSupplierPhotos:0,published:0,databaseAssociations:0};
  await saveJson(path.join(destination,'review.json'),{summary,products:result});
  await saveJson(path.join(destination,'extracted-images.json'),result.filter(r=>r.file).map(r=>{const article=previous.products.find(p=>p.productKey===r.productKey);return{
    productKey:r.productKey,file:r.file,sha256:r.sha256,identitySha256:r.identitySha256,sourceDocument:article.source.document,sourcePage:article.source.page,
    assetKind:r.assetKind,rightsStatus:'PENDING_VISUAL_REVIEW',publish:false,association:'Individual illustration by SKU; never exact manufacturer photo. See review.json and generation-records.json.'};}));
  await saveJson(path.join(destination,'provenance.json'),{kind:'AI_GENERATED_ORIGINAL_ILLUSTRATIONS',tool:'built-in image_gen',scope:'academic demonstration review only',
    referenceCardsPreserved:true,supplierAssetsUsed:false,thirdPartyPublicationRightsGranted:false,
    note:'Generated objects omit brand logos and are not claims of exact physical commercial identity. No external photos were downloaded or licensed. User must review before any association/publication.'});
  const cards=result.map(p=>`<article data-sku="${escapeHtml(p.productKey)}"><h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.sourceSpecification)}</p><div class="comparison"><figure><img loading="lazy" src="../reference-package/${escapeHtml(p.referenceCard)}" alt="Ficha de respaldo: ${escapeHtml(p.name)}"><figcaption>Ficha original conservada</figcaption></figure><figure>${p.file?`<img loading="lazy" src="${escapeHtml(p.file)}" alt="Ilustración realista referencial, no foto exacta: ${escapeHtml(p.name)}">`:'<div class="pending">Imagen realista pendiente</div>'}<figcaption>Ilustración referencial · pendiente de revisión</figcaption></figure></div><details><summary>Identidad y verificaciones pendientes</summary><p>${escapeHtml(p.productKey)}</p><ul>${p.requiredManualChecks.map(n=>`<li>${escapeHtml(n)}</li>`).join('')}</ul></details></article>`).join('');
  await writeFile(path.join(destination,'index.html'),`<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FYF · comparación de imágenes</title>
<style>
*{box-sizing:border-box}body{font:16px Arial,sans-serif;margin:24px;background:#f5f6f8;color:#17212f}
header{max-width:1100px;margin:auto auto 24px}main{display:grid;gap:24px;max-width:1300px;margin:auto}
article{background:white;padding:18px;border:1px solid #d5dce5;border-radius:12px;min-width:0}article[hidden]{display:none}
h2{font-size:19px;margin:0 0 12px}p,li{line-height:1.5;overflow-wrap:anywhere}
.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}
img,.pending{width:100%;aspect-ratio:1;object-fit:contain;background:white;border:1px solid #eee}
figcaption{padding:8px;font-weight:bold;color:#9e5000;font-size:14px}details{margin-top:12px}
.pending{display:grid;place-items:center;color:#64748b}summary{cursor:pointer;min-height:44px;padding:12px 0}
input{display:block;width:100%;margin:8px 0;padding:12px;border:1px solid #64748b;border-radius:6px;font:inherit;background:transparent;color:inherit}
:focus-visible{outline:3px solid #dc7900;outline-offset:3px}
@media(max-width:500px){body{margin:12px}article{padding:12px}.comparison{gap:8px}figcaption{font-size:12px;padding:6px}}
@media(prefers-color-scheme:dark){body{background:#151c26;color:#f1f5f9}article{background:#202a37;border-color:#526175}figcaption{color:#ffba66}}
</style>
<header><h1>FYF · fichas y objetos realistas</h1>
<p>${summary.preparedRealistic} imágenes realistas preparadas · ${summary.cardOnly} solo ficha · ${summary.manualReviewRequired} pendientes de revisión. Las 96 fichas previas se conservan intactas.</p>
<p>Son ilustraciones originales referenciales, no fotografías oficiales ni reproducción exacta de modelos comerciales. Ninguna se publicó o asoció a una base de datos.</p>
<label for="search">Buscar nombre, código o variante</label><input id="search" type="search" autocomplete="off"><p id="count" role="status">96 SKU</p>
</header><main>${cards}</main>
<script>
const search=document.getElementById('search'),articles=[...document.querySelectorAll('main article')];
search.addEventListener('input',()=>{const term=search.value.trim().toLocaleLowerCase('es');let count=0;
for(const article of articles){article.hidden=!(article.textContent+' '+article.dataset.sku).toLocaleLowerCase('es').includes(term);if(!article.hidden)count++;}
document.getElementById('count').textContent=count+' SKU';});
</script></html>`);
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,source]=process.argv.slice(2);
  if(mode==='--plan'){await mkdir(destination,{recursive:true});const plan=await buildPlan();await saveJson(path.join(destination,'prompts.json'),plan);console.log(JSON.stringify(plan));}
  else if(mode==='--assemble'&&source)console.log(JSON.stringify(await assemble(path.resolve(source)),null,2));
  else throw Error('Usage: --plan | --assemble GENERATED_IMAGES_DIRECTORY');
}
