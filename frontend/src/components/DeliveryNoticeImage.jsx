import {useEffect,useRef,useState} from 'react';
import {Edit3,Truck} from 'lucide-react';
import DeliveryAnnouncementText from './DeliveryAnnouncementText.jsx';
import useCustomerNotice from '../hooks/useCustomerNotice.js';
import {getApiError} from '../api/httpClient.js';
import {saveDeliveryNoticeImageRequest} from '../services/customerNotice.service.js';
import NoticeImageField from './NoticeImageField.jsx';
import NoticeInlineEditor from './NoticeInlineEditor.jsx';

export default function DeliveryNoticeImage({announcement,onSaved}){
 const [editing,setEditing]=useState(false),[file,setFile]=useState(null),[remove,setRemove]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const editorRef=useRef(null);
 useEffect(()=>{
  if(!editing)return undefined;
  const frame=requestAnimationFrame(()=>{
   editorRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   editorRef.current?.querySelector('[data-notice-image-picker]')?.focus({preventScroll:true});
  });
  return()=>cancelAnimationFrame(frame);
 },[editing]);
 const {deliveryAnnouncement:live}=useCustomerNotice();
 if(!announcement)return null;
 const content=live||announcement;
 function cancel(){setFile(null);setRemove(false);setError('');}
 function close(){if(busy)return;cancel();setEditing(false);}
 async function save(){setBusy(true);setError('');try{await saveDeliveryNoticeImageRequest(announcement.revision,remove?null:file);await onSaved();cancel();setEditing(false);}catch(e){setError(getApiError(e));}finally{setBusy(false);}}
 return <div>
  <article className="customer-notice-automatic relative grid min-w-0 gap-3 rounded-md border-2 border-slate-200 bg-slate-50 p-4" aria-label="Aviso automático de despacho">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3 max-[620px]:pr-11">
     <span className="grid size-10 shrink-0 place-items-center rounded-md bg-rust-500 text-white"><Truck size={19} aria-hidden="true"/></span>
     <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-ink-950">Información de despacho</strong><span className="rounded-full bg-rust-50 px-2 py-1 text-[11px] font-bold text-rust-600">Automático</span></div>
      <DeliveryAnnouncementText announcement={content}/>
     </div>
    </div>
    <button type="button" title="Editar" aria-label="Editar imagen del aviso automático de despacho" aria-expanded={editing} onClick={()=>setEditing(true)} className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:absolute max-[620px]:top-3 max-[620px]:right-3 max-[620px]:size-10 max-[620px]:min-h-10 max-[620px]:p-0"><Edit3 size={16}/><span className="max-[620px]:sr-only">Editar</span></button>
   </div>
   {content.kind==='LOCAL_FIXED'&&announcement.savedImageUrl&&<img className="h-20 w-full rounded-md border border-slate-200 object-cover" src={announcement.savedImageUrl} alt=""/>}
   <span className="text-[11px] text-slate-500">Mensaje actualizado desde la política de despacho. Solo se puede editar su imagen decorativa.</span>
  </article>
  {editing&&<div className="mt-3"><NoticeInlineEditor ref={editorRef} aria-label="Editar aviso automático de despacho" onSubmit={event=>{event.preventDefault();if(!busy&&(file||remove))save();}} onCancel={close} busy={busy}>
    <strong className="text-sm text-ink-950">Editar aviso automático de despacho</strong>
    <h3 className="m-0 wrap-break-word text-base">{content.title}</h3><p className="m-0 whitespace-pre-wrap wrap-break-word text-sm">{content.message}</p>
    <p className="m-0 text-xs text-slate-500">Texto de solo lectura. Usa una imagen decorativa sin precios ni promesas de cobertura o gratuidad.</p>
    {content.kind!=='LOCAL_FIXED'&&<p role="status" className="m-0 text-sm">La imagen queda guardada, pero no se publica mientras el despacho local no esté disponible.</p>}
    <NoticeImageField currentUrl={announcement.savedImageUrl} file={file} removeImage={remove} disabled={busy}
     onFile={f=>{if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024){setError('Selecciona JPG, PNG o WebP de hasta 5 MB');return;}setError('');setFile(f);setRemove(false);}}
     onRemove={()=>{setFile(null);setRemove(Boolean(announcement.savedImageUrl));}}/>
    {error&&<p role="alert" className="m-0 text-sm text-critical-600">{error}</p>}
    <div className="admin-form-actions">
     <button type="button" className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" disabled={busy} onClick={close}>Cancelar imagen</button>
     <button type="submit" className="product-positive-action" disabled={busy||(!file&&!remove)}>{busy?'Guardando…':'Guardar imagen'}</button>
    </div>
  </NoticeInlineEditor></div>}
 </div>;
}
