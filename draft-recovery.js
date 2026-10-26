'use strict';
// Local drafts are never database writes. Recovery requires an unchanged server revision.
(()=>{
 const TTL=24*60*60*1000,MAX=750000,bindings=new Map();let options=null,statusNode=null,restoring=false;
 const identity=()=>window.firebase?.auth().currentUser?.uid;
 const prefix=()=>identity()?'hp:draft:v1:'+identity()+':':null;
 function list(){try{const p=prefix(),out={};if(!p)return out;for(const k of Object.keys(localStorage)){if(!k.startsWith(p))continue;try{const d=JSON.parse(localStorage.getItem(k));if(d.v!==1||Date.now()-d.at>TTL){localStorage.removeItem(k);continue;}out[k.slice(p.length)]=d;}catch{localStorage.removeItem(k);}}return out;}catch{return {};}}
 function store(key,value){const p=prefix();if(!p)throw Error('No se pudo identificar al usuario.');if(value===null){localStorage.removeItem(p+key);return;}const text=JSON.stringify(value);if(text.length>MAX)throw Error('El borrador es demasiado grande.');list();localStorage.setItem(p+key,text);}
 function clearUser(){const p=prefix();if(p)for(const k of Object.keys(localStorage))if(k.startsWith(p))localStorage.removeItem(k);}
 const now=()=>new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
 function status(kind,message){if(!options)return;if(!statusNode?.isConnected){statusNode=document.createElement('div');statusNode.id='hp-save-notice';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');statusNode.style.cssText='padding:8px 12px;margin:8px 0;border:1px solid #b9cadb;border-radius:8px;font-size:12px;font-weight:600;line-height:1.5;overflow-wrap:anywhere';(document.getElementById('content-area')||document.body).prepend(statusNode);}statusNode.dataset.state=kind;statusNode.style.background=({pending:'#fff2b3',saving:'#e5efff',saved:'#e3f7e8',error:'#ffe5e5',clean:'#eff4f8'})[kind]||'#eff4f8';statusNode.style.color=({error:'#a01616',saved:'#125b28'})[kind]||'#173556';statusNode.textContent=message;}
 function init(opts){options=opts;status('clean','Sin cambios pendientes');}
 function read(key){return options?.read(key);}
 async function put(key,d){await options.write(key,d);}
 function revision(){return String(options?.revision()??'');}
 function eligible(el){return el.matches('input,textarea,select')&&!['password','file','hidden','submit','button'].includes(el.type)&&!el.readOnly&&!el.disabled&&!el.closest('[data-draft-notice]');}
 function fields(root){const counts={};return [...root.querySelectorAll('input,textarea,select')].filter(eligible).map(el=>{const name=el.id?'#'+el.id:el.name?'@'+el.name:el.getAttribute('onchange')?'~'+el.getAttribute('onchange'):'';if(!name)return null;const i=counts[name]||0;counts[name]=i+1;return {name,i,value:el.value,checked:!!el.checked};}).filter(Boolean);}
 function applyFields(root,values,events=true){for(const item of values||[]){const matches=[...root.querySelectorAll('input,textarea,select')].filter(e=>eligible(e)&&(item.name[0]==='#'?e.id===item.name.slice(1):item.name[0]==='@'?e.name===item.name.slice(1):e.getAttribute('onchange')===item.name.slice(1)));const el=matches[item.i];if(!el)continue;el.value=item.value;if(['checkbox','radio'].includes(el.type))el.checked=item.checked;if(events){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}}
 function bind(key,root,get,set,label){if(!options||!root)return null;const old=bindings.get(key);if(old?.root===root)return old;
  const b={key,root,get,set,label,entry:null,dirty:false};bindings.set(key,b);
  const notice=document.createElement('div');notice.dataset.draftNotice='1';notice.style.cssText='margin:8px 0;padding:9px 12px;background:#fff5cc;border:1px solid #dbc574;border-radius:8px;font-size:12px;line-height:1.5';notice.hidden=true;root.prepend(notice);b.notice=notice;
  const message=text=>{notice.hidden=false;notice.textContent=text;};
  b.capture=()=>{if(restoring||!root.isConnected)return;try{const value=get();if(value==null)return;b.dirty=true;b.entry={v:1,at:Date.now(),revision:revision(),label,data:value,state:'draft'};status('pending','Cambios pendientes · aún no guardados en Firebase');put(key,b.entry).then(()=>message('Borrador local (24 h) · '+now()+' · aún no guardado en Firebase.')).catch(()=>message('No se pudo conservar el borrador en este dispositivo. Guarda antes de salir.'));}catch{message('No se pudo conservar el borrador. Guarda antes de salir.');}};
  root.addEventListener('input',e=>{if(eligible(e.target))queueMicrotask(b.capture);});root.addEventListener('change',e=>{if(eligible(e.target))queueMicrotask(b.capture);});
  root.addEventListener('click',e=>{if(e.target.closest('[data-add-route],[data-remove-route],[data-add-payment-line],[data-remove-line]'))queueMicrotask(b.capture);});
  b.clear=()=>{b.entry=null;b.dirty=false;notice.hidden=true;if(statusNode?.dataset.state==='pending'&&![...bindings.values()].some(x=>x.dirty))status('clean','Sin cambios pendientes');return put(key,null).catch(()=>message('Guardado confirmado, pero no se pudo limpiar el borrador local.'));};
  const saved=read(key);if(saved){b.entry=saved;status('pending','Borrador disponible · '+label+' · revisa el aviso del formulario');const valid=saved.revision===revision()&&saved.state==='draft';message(valid?'Hay un borrador de '+label+' sin guardar.':'Hay un borrador de '+label+' que requiere revisión: los datos cambiaron o el guardado quedó sin confirmar.');
   const recover=document.createElement('button');recover.type='button';recover.className='record-btn';recover.textContent=valid?'Recuperar borrador':'Ver borrador';recover.onclick=()=>{if(valid&&saved.revision===revision()){
    restoring=true;try{set(structuredClone(saved.data));b.dirty=true;status('pending','Borrador recuperado · revisa los datos y pulsa Guardar');message('Borrador recuperado. Revisa los datos y pulsa Guardar.');}catch{message('No se pudo recuperar este formulario. Conservamos el borrador para revisión.');}finally{restoring=false;}
   }else{const d=document.createElement('dialog'),pre=document.createElement('pre'),close=document.createElement('button');d.style.cssText='max-width:90vw;max-height:85vh';pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';pre.textContent=JSON.stringify(saved.data,null,2);close.textContent='Cerrar';close.dataset.close='';close.onclick=()=>d.close();d.append('Solo consulta: comprueba primero lo guardado para evitar duplicados.',pre,close);d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();}};
   const discard=document.createElement('button');discard.type='button';discard.className='record-btn';discard.textContent='Descartar borrador';discard.onclick=()=>{if(confirm('¿Descartar este borrador local? No se modificará lo guardado en Firebase.'))b.clear();};notice.append(document.createElement('br'),recover,' ',discard);
  }
  return b;
 }
 function form(key,root,label){return bind(key,root,()=>fields(root),value=>applyFields(root,value),label);}
 async function beforeSave(){status('saving','Guardando en Firebase… espera la confirmación');for(const b of bindings.values())if(b.dirty&&b.entry){b.entry.state='unconfirmed';await put(b.key,b.entry).catch(()=>{});}}
 function saved(){status('saved','Guardado en Firebase · '+now());}
 function error(message){status('error',(message||'No se pudo confirmar el guardado.')+' El borrador no equivale a un guardado.');}
 window.DraftRecovery={init,bind,form,fields,applyFields,status,beforeSave,saved,error,list,store,clearUser,clear:key=>bindings.get(key)?.clear(),capture:key=>bindings.get(key)?.capture()};
})();
