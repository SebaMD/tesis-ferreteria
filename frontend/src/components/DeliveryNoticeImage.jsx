import {useEffect,useMemo,useState} from 'react';
import useCustomerNotice from '../hooks/useCustomerNotice.js';
import {getApiError} from '../api/httpClient.js';
import {saveDeliveryNoticeImageRequest} from '../services/customerNotice.service.js';

export default function DeliveryNoticeImage({announcement,onSaved}){
 const [file,setFile]=useState(null),[remove,setRemove]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {deliveryAnnouncement:live}=useCustomerNotice();
 const preview=useMemo(()=>file?URL.createObjectURL(file):'',[file]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 if(!announcement)return null;
 const image=file?preview:remove?'':announcement.savedImageUrl;
 const content=live||announcement;
 function cancel(){setFile(null);setRemove(false);setError('');}
 async function save(){setBusy(true);setError('');try{await saveDeliveryNoticeImageRequest(announcement.revision,file);await onSaved();cancel();}catch(e){setError(getApiError(e));}finally{setBusy(false);}}
 return <article className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-white p-4" aria-label="Aviso automático de despacho">
  <strong>Automático · Información de despacho</strong><h3 className="m-0 break-words text-lg">{content.title}</h3><p className="m-0 whitespace-pre-wrap break-words text-sm">{content.message}</p>
  <p className="m-0 text-xs text-slate-500">Texto de solo lectura, vinculado a Configurar despacho local. Solo puedes cambiar su imagen. Usa una imagen decorativa sin precios ni promesas de cobertura o gratuidad.</p>
  {content.kind!=='LOCAL_FIXED'&&<p role="status" className="m-0 text-sm">La imagen queda guardada, pero no se publica mientras el despacho local no esté disponible.</p>}
  {image&&<div className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="Vista previa de imagen"><img className="h-36 w-full rounded object-cover" src={image} alt="Vista previa de escritorio"/><img className="h-40 w-full max-w-64 rounded object-cover" src={image} alt="Vista previa móvil"/></div>}
  <label className="min-w-0">Imagen opcional (JPG, PNG o WebP, máximo 5 MB)<input key={announcement.revision+':'+Boolean(file)+':'+remove} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024){setError('Selecciona JPG, PNG o WebP de hasta 5 MB');return;}setError('');setFile(f);setRemove(false);}}/></label>
  {error&&<p role="alert" className="m-0 text-sm text-critical-600">{error}</p>}
  <div className="flex flex-wrap gap-2">{announcement.savedImageUrl&&<button type="button" disabled={busy} onClick={()=>{setFile(null);setRemove(true);}}>Quitar imagen</button>}{(file||remove)&&<><button type="button" disabled={busy} onClick={cancel}>Cancelar imagen</button><button type="button" disabled={busy} onClick={save}>{busy?'Guardando…':'Guardar imagen'}</button></>}</div>
 </article>;
}
