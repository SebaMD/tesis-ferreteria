import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{buildCatalogSlides}from'../src/helpers/customerNoticeCarousel.js';
test('one automatic slide, unchanged fallback, dynamic commercial text and suspension without promotion',()=>{
 const manual=[{id:2,title:'Manual',message:'Conservado',displaySeconds:7}];
 for(const kind of ['LOCAL_FIXED','SUSPENDED']){
  const slides=buildCatalogSlides(null,manual,{kind,title:'Título actual',message:'Mensaje actual',imageUrl:'/uploads/image.png'});
  assert.equal(slides.filter(s=>s.id==='delivery-policy').length,1);assert.equal(slides.at(-1).title,'Manual');
  assert.equal(slides[1].message,'Mensaje actual');assert.equal(slides[1].imageUrl,kind==='LOCAL_FIXED'?'/uploads/image.png':null);
 }
 assert.equal(buildCatalogSlides(null,manual,{kind:'LOCAL_FIXED',title:'Actual',message:'Actual'})[1].imageUrl,null);
});
test('image-only admin form has preview, cancel, expected revision and no editable commercial text',async()=>{
 const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');const ui=await read('components/DeliveryNoticeImage.jsx');
 assert.match(ui,/Automático/);assert.match(ui,/type="file"/);assert.match(ui,/Vista previa móvil/);assert.match(ui,/Cancelar imagen/);assert.match(ui,/announcement.revision/);assert.match(ui,/URL.revokeObjectURL/);
 assert.doesNotMatch(ui,/<textarea|type="text"|type="number"/);
 assert.match(await read('components/CustomerNoticeManager.jsx'),/<DeliveryNoticeImage/);
 assert.match(await read('services/customerNotice.service.js'),/If-Match/);
});
