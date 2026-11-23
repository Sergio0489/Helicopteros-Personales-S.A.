'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {failure}=require('./prospect-email');
const APP_URL='https://sergio0489.github.io/Helicopteros-Personales-S.A./';
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const address=value=>typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)?value.trim().toLowerCase():'';
const clean=(value,max=500)=>typeof value==='string'?value.replace(/\u0000/g,'').trim().slice(0,max):'';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function recipients(publication,accounts,auth,directorUid){
 const found=new Set(),add=value=>{const valid=address(value);if(valid)found.add(valid);};
 if(publication.draft===true){
  if(!directorUid)return [];
  try{const user=await auth.getUser(directorUid);if(user&&!user.disabled&&user.emailVerified)add(user.email);}catch{}
  return [...found];
 }
 if(publication.practice===true){
  let next=null;do{const page=await auth.listUsers(1000,next);next=page.pageToken||null;for(const user of page.users)if(!user.disabled&&user.emailVerified)add(user.email);}while(next);
  return [...found].sort();
 }
 for(const value of publication.pilotRecipients||[])add(value);
 const eligible=Object.entries(accounts||{}).filter(([uid,account])=>!account?.mergedInto&&(uid===directorUid||!!account?.assignedAt&&['Director','Gerente','Administrativo','Piloto','Contabilidad'].includes(account.role)));
 const userIds=new Set(eligible.map(([uid])=>uid));if(directorUid)userIds.add(directorUid);
 const users=await Promise.all([...userIds].map(async uid=>{try{return await auth.getUser(uid);}catch{return null;}}));
 for(const user of users)if(user&&!user.disabled&&user.emailVerified)add(user.email);
 return [...found].sort();
}
function message(publication,from,to){
 const date=String(publication.date||''),match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)throw Error('Fecha de publicación no válida.');
 const dateLabel=match[3]+'/'+match[2]+'/'+match[1],draft=publication.draft===true,title=(draft?'BORRADOR · Horario del día · ':publication.practice?'SIMULACIÓN · Horario de práctica publicado · ':publication.action==='updated'?'Horario de vuelo actualizado · ':'Horario de vuelo publicado · ')+dateLabel;
 const flights=(publication.flights||[]).map(f=>({start:clean(f.start,5),end:clean(f.end,5),aircraft:clean(f.aircraft,40),model:clean(f.model,120),pilot:clean(f.pilot,160),student:clean(f.student,160),type:clean(f.type,80),route:clean(f.route,200),notes:clean(f.notes,500)}));
 const grouped=new Map();for(const f of flights){const key=f.aircraft||'Sin aeronave asignada';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(f);}
 const displayTime=value=>{const m=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!m)return 'Hora por definir';const hour=Number(m[1]),suffix=hour<12?'AM':'PM';return (hour%12||12)+':'+m[2]+' '+suffix;};
 const rows=[...grouped].map(([aircraft,items])=>aircraft+' · '+items.length+' vuelo'+(items.length===1?'':'s')+'\n'+items.map(f=>displayTime(f.start)+(f.end?' → '+displayTime(f.end):'')+' · '+(f.type||'Vuelo')+' · Piloto: '+(f.pilot||'Sin asignar')+(f.student?' · Estudiante/Cliente: '+f.student:'')+(f.route?' · Ruta: '+f.route:'')).join('\n')).join('\n\n');
 const warnings=(publication.draftWarnings||[]).map(value=>clean(value,300)).filter(Boolean),intro=title+'\n\n'+(draft?'Este borrador se envía únicamente a Dirección para revisión. Publicación automática prevista a las 8:15 p. m., hora de Panamá.\n\n':publication.practice?'Ejercicio temporal de reunión. No es un horario oficial y no reserva vuelos.\n\n':'')+(warnings.length?'Advertencias del borrador:\n- '+warnings.join('\n- ')+'\n\n':'')+(rows||'No hay vuelos programados para este día.')+'\n\nConsulta el horario en la app: '+APP_URL;
 const aircraftCards=[...grouped].map(([aircraft,items])=>'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #dce5ef;border-radius:10px;background:#e7edf5;overflow:hidden"><tr><td colspan="2" style="padding:12px 14px;background:#153b67;color:#fff"><strong style="font-size:16px">'+escape(aircraft)+'</strong>'+(items[0].model?'<br><small>'+escape(items[0].model)+'</small>':'')+'<span style="float:right">'+items.length+' vuelo'+(items.length===1?'':'s')+'</span></td></tr>'+items.map(f=>'<tr><td colspan="2" style="padding:10px 14px;border-top:1px solid #d5dfea"><strong style="color:#153b67">'+escape(displayTime(f.start)+(f.end?' → '+displayTime(f.end):''))+'</strong><br><span style="font-size:12px;color:#52657a">'+escape(f.type||'Vuelo')+'</span><br><strong>Piloto:</strong> '+escape(f.pilot||'Sin asignar')+(f.student?'<br><strong>Estudiante / Cliente:</strong> '+escape(f.student):'')+(f.route?'<br><strong>Ruta:</strong> '+escape(f.route):'')+'</td></tr>').join('')+'</table>');
 const columns=[];for(let i=0;i<aircraftCards.length;i+=3){const cells=aircraftCards.slice(i,i+3).map(card=>'<td class="hp-aircraft-cell" width="33.33%" valign="top" style="width:33.33%;padding:0 6px">'+card+'</td>');while(cells.length<3)cells.push('<td class="hp-aircraft-cell" width="33.33%" style="width:33.33%;padding:0 6px"></td>');columns.push('<tr class="hp-aircraft-row">'+cells.join('')+'</tr>');}
 const cards=aircraftCards.length?'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">'+columns.join('')+'</table>':'<p>No hay vuelos programados para este día.</p>';
 const domain=String(from).split('@')[1]||'localhost',deliveryKey=hash(publication.id+'|'+address(to)).slice(0,24);
 const banner=draft?'<p style="padding:12px;background:#fff3cd;border:1px solid #edcf6e"><b>BORRADOR PARA DIRECCIÓN</b> · No es el horario oficial. La publicación automática está prevista para las 8:15 p. m., hora de Panamá.</p>':publication.practice?'<p style="padding:12px;background:#fff3cd;border:1px solid #edcf6e"><b>SIMULACIÓN DE REUNIÓN</b> · Temporal; no es oficial y no reserva vuelos.</p>':'';
 const warningHtml=warnings.length?'<section style="padding:12px;margin:0 0 16px;background:#fff3cd;border:1px solid #edcf6e"><strong>Revisar antes de publicar:</strong><ul>'+warnings.map(value=>'<li>'+escape(value)+'</li>').join('')+'</ul></section>':'';
 const html='<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:700px){.hp-aircraft-row{display:block!important}.hp-aircraft-cell{display:block!important;width:100%!important;max-width:100%!important;padding:0!important}}</style></head><body style="font-family:Arial,sans-serif;color:#172b4d;margin:0;padding:20px;background:#f3f6fa"><main style="max-width:1400px;margin:auto">'+banner+'<h1 style="font-size:22px;margin:0 0 8px">'+escape(title)+'</h1><div style="color:#52657a;margin-bottom:16px">'+escape(dateLabel)+' · Hora de Panamá</div>'+warningHtml+cards+'<p><a href="'+APP_URL+'">Abrir horario en la app</a></p></main></body></html>';
 return {from:{name:'Helicópteros Personales'+(publication.practice?' · SIMULACIÓN':''),address:from},to,subject:title,messageId:'<hp-itinerary-'+deliveryKey+'@'+domain+'>',text:intro,html,disableFileAccess:true,disableUrlAccess:true};
}
async function deliver({db,event,from,recipients:targets,send,report=()=>{},now=()=>Date.now()}){
 const publication=event.data?.val(),id=event.params?.publicationId;
 const validId=/^(publication-\d{4}-\d{2}-\d{2}|modified-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9-]{12,100}|practice-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9-]{12,100}|draft-\d{4}-\d{2}-\d{2})$/.test(id),isDraftId=String(id||'').startsWith('draft-');
 if(!publication||publication.id!==id||!validId||!/\d{4}-\d{2}-\d{2}$/.test(publication.date)||!Array.isArray(publication.flights)||publication.practice===true&&!id.startsWith('practice-')||publication.draft===true&&!isDraftId||isDraftId&&publication.draft!==true)throw Error('Evento de publicación del horario no válido.');
 const unique=[...new Set((targets||[]).map(address).filter(Boolean))],deliveryRoot='itineraryEmailDeliveries/'+id;
 if(!unique.length){report('recipients-empty',id);return;}
 let retry=false;
 for(const to of unique){
  const ref=db.ref(deliveryRoot+'/'+hash(to)),token=randomUUID(),startedAt=now();
  const claimed=await ref.transaction(old=>{
   if(['sent','failed','review'].includes(old?.status))return;
   if(old?.status==='sending'){
    if(startedAt-old.startedAt<240000)return;
    return {...old,status:'review',code:'delivery-interrupted',updatedAt:startedAt};
   }
   if((old?.attempts||0)>=8)return {...old,status:'failed',code:'retry-limit',updatedAt:startedAt};
   return {status:'sending',attempts:(old?.attempts||0)+1,token,startedAt,updatedAt:startedAt};
  },undefined,false);
  const state=claimed.snapshot.val();
  if(!claimed.committed||state?.token!==token||state.status!=='sending'){
   if(state?.status==='sending')retry=true;
   if(claimed.committed&&['failed','review'].includes(state?.status))report(state.code,id);
   continue;
  }
  let outcome;
  try{
   const result=await send(message(publication,from,to));
   if(!result?.accepted?.some(value=>address(typeof value==='string'?value:value?.address)===to))throw Object.assign(Error('SMTP no confirmó la recepción.'),{responseCode:result?.rejectedErrors?.[0]?.responseCode});
   outcome={status:'sent',acceptedAt:now(),code:'smtp-accepted'};
  }catch(error){
   const classification=failure(error),canRetry=classification.retry&&state.attempts<8;
   retry ||= canRetry;outcome={status:canRetry?'retry':classification.review?'review':'failed',code:canRetry?classification.code:classification.retry?'retry-limit':classification.code};report(outcome.code,id);
  }
  const finishedAt=now(),finalized=await ref.transaction(old=>{
   if(old===null)return {...state,...outcome,updatedAt:finishedAt};
   if(old.token!==token||old.status!=='sending')return old;
   return {...old,...outcome,updatedAt:finishedAt};
  },undefined,false);
  const saved=finalized.snapshot.val();
  if(!finalized.committed||saved?.token!==token||saved.status!==outcome.status||saved.code!==outcome.code){report('delivery-receipt-conflict',id);throw Error('No se confirmó el registro de entrega del horario.');}
 }
 if(retry)throw Error('Entrega del horario pendiente de reintento.');
}

module.exports={recipients,message,deliver};
