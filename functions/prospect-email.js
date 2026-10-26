'use strict';
// Internal notifications only. Recipients cannot be supplied by forms or browsers.
const {createHash,randomUUID}=require('node:crypto');
const APP_URL='https://sergio0489.github.io/Helicopteros-Personales-S.A./';
const COURSES={privado:'Piloto privado',comercial:'Piloto comercial',ifr:'IFR',multimotor:'Multimotor',rpa:'RPA (Drone)',instructor:'Instructor de vuelo'};
const hash=v=>createHash('sha256').update(v).digest('hex');
const clean=(v,max=3000)=>typeof v==='string'?v.replace(/\u0000/g,'').trim().slice(0,max):'';
const address=v=>typeof v==='string'&&v.length<=254&&/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)?v.toLowerCase():'';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function recipientList(value){
 if(!Array.isArray(value)||value.length!==2||value.some(v=>!address(v))||new Set(value.map(address)).size!==2)throw Error('Configura los dos destinatarios internos autorizados.');
 return value.map(address);
}

function configuration(raw){
 let cfg;try{cfg=JSON.parse(raw);}catch{throw Error('Configuración de correo no válida.');}
 if(!cfg||!address(cfg.from)||typeof cfg.host!=='string'||!/^([a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+$/.test(cfg.host)||![465,587].includes(cfg.port)||typeof cfg.user!=='string'||!cfg.user.trim()||typeof cfg.password!=='string'||!cfg.password||cfg.password.length>4096)throw Error('Configuración de correo incompleta.');
 return {from:address(cfg.from),recipients:recipientList(cfg.recipients),transport:{host:cfg.host,port:cfg.port,secure:cfg.port===465,requireTLS:true,tls:{minVersion:'TLSv1.2'},auth:{user:cfg.user,pass:cfg.password},connectionTimeout:20000,greetingTimeout:15000,socketTimeout:25000,dnsTimeout:10000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true}};
}

function panamaDate(value){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} (Panamá)`;
}

function message(inquiry,contact,from,to,id){
 const area=(inquiry.areas||[]).filter(x=>['school','charters'].includes(x)).map(x=>x==='school'?'Escuela':'Chárter').join(' / ')||'Consulta';
 const name=clean(contact.name,160),email=address(contact.email),phone=clean(contact.phone,40);
 const requested=clean(inquiry.requestedCourse,500)||(inquiry.courses||[]).map(c=>COURSES[c]).filter(Boolean).join(', ');
 const rows=[['Nombre',name],['Celular',phone],['Correo',email],['Área de interés',area],['Curso solicitado',requested],['Consulta',clean(inquiry.interest)],['Origen',clean(inquiry.channel,30)],['Fecha',panamaDate(inquiry.at)]];
 const title='Nuevo interesado · '+area;
 return {from:{name:'Helicópteros Personales',address:from},to,...(email?{replyTo:{name:name.replace(/[\r\n]/g,' '),address:email}}:{}),subject:title,
  messageId:`<hp-consulta-${id}@${from.split('@')[1]}>`,
  text:title+'\n\n'+rows.map(([k,v])=>k+': '+(v||'No proporcionado')).join('\n')+'\n\nVer en la app: '+APP_URL,
  html:`<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#172b4d;margin:0;padding:24px"><main style="max-width:640px;margin:auto"><h1 style="font-size:22px">${escape(title)}</h1><table style="width:100%;border-collapse:collapse">${rows.map(([k,v])=>`<tr><th style="text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e3eaf2;width:145px">${escape(k)}</th><td style="padding:10px;border-bottom:1px solid #e3eaf2;white-space:pre-wrap;overflow-wrap:anywhere">${escape(v||'No proporcionado')}</td></tr>`).join('')}</table><p><a href="${APP_URL}">Abrir Interesados y consultas en la app</a></p></main></body></html>`,
  disableFileAccess:true,disableUrlAccess:true};
}

// SMTP cannot guarantee exactly-once delivery after a lost acknowledgement.
// Never resend an ambiguous delivery automatically: mark it for review instead.
function failure(error){
 const response=Number(error?.responseCode),command=String(error?.command||'').toUpperCase();
 if(response>=400&&response<500)return {retry:true,code:'smtp-temporary'};
 if(response>=500&&response<600)return {retry:false,code:'smtp-rejected'};
 if(['EAUTH','ETLS','ECONFIG'].includes(error?.code))return {retry:false,code:'smtp-configuration'};
 if(['CONN','EHLO','HELO','STARTTLS','AUTH','MAIL FROM','RCPT TO'].includes(command)||['EDNS','ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error?.code))return {retry:true,code:'smtp-connection'};
 return {retry:false,review:true,code:'smtp-unconfirmed'};
}

async function deliver({db,event,from,recipients,send,now=()=>Date.now(),report=()=>{}}){
 const {contactId,inquiryId}=event.params||{};
 if(!/^[a-f0-9]{64}$/.test(contactId||'')||!/^\d{13}_[a-f0-9]{64}$/.test(inquiryId||''))throw Error('Evento de consulta no válido.');
 const inquiry=event.data.val();if(!inquiry||!Array.isArray(inquiry.areas))return;
 // New records retain the original contact details; legacy producers still work.
 const contact=inquiry.contact||(await db.ref('prospects/contacts/'+contactId).get()).val();
 if(!contact||(!clean(contact.name,160)&&!address(contact.email))){report('contact-missing',hash(contactId+'|'+inquiryId));return;}
 const deliveryId=hash(contactId+'|'+inquiryId);let retry=false;
 for(const to of recipientList(recipients)){
  const key=hash(to),ref=db.ref('prospects/emailDeliveries/'+deliveryId+'/'+key),token=randomUUID(),started=now();
  const claimed=await ref.transaction(old=>{
   if(['sent','failed','review'].includes(old?.status))return;
   if(old?.status==='sending'){
    if(started-old.startedAt<240000)return;
    return {...old,status:'review',code:'delivery-interrupted',updatedAt:started};
   }
   if((old?.attempts||0)>=8)return {...old,status:'failed',code:'retry-limit',updatedAt:started};
   return {status:'sending',attempts:(old?.attempts||0)+1,token,startedAt:started,updatedAt:started};
  },undefined,false);
  const state=claimed.snapshot.val();
  if(!claimed.committed||state?.token!==token||state.status!=='sending'){
   if(state?.status==='sending')retry=true;
   if(claimed.committed&&['failed','review'].includes(state?.status))report(state.code,deliveryId);
   continue;
  }
  let outcome;
  try{
   const result=await send(message(inquiry,contact,from,to,deliveryId+'-'+key));
   if(!result?.accepted?.some(v=>address(typeof v==='string'?v:v?.address)===to))throw Object.assign(Error('SMTP no confirmó la recepción.'),{responseCode:result?.rejectedErrors?.[0]?.responseCode});
   outcome={status:'sent',acceptedAt:now(),code:'smtp-accepted'};
  }catch(error){
   const result=failure(error),canRetry=result.retry&&state.attempts<8;
   retry ||= canRetry;
   outcome={status:canRetry?'retry':result.review?'review':'failed',code:canRetry?result.code:result.retry?'retry-limit':result.code};
   report(outcome.code,deliveryId);
  }
  // Keep DB errors outside the SMTP catch: a lost receipt must not cause a resend.
  const finishedAt=now();
  const finalized=await ref.transaction(old=>{
   // A cold RTDB cache may supply null even though the claim exists remotely.
   // Propose the receipt from our confirmed claim so RTDB reconciles with the
   // server. Returning undefined here would abort before that reconciliation.
   if(old===null)return {...state,...outcome,updatedAt:finishedAt};
   if(old.token!==token||old.status!=='sending')return old;
   return {...old,...outcome,updatedAt:finishedAt};
  },undefined,false);
  const saved=finalized.snapshot.val();
  if(!finalized.committed||saved?.token!==token||saved.status!==outcome.status||saved.code!==outcome.code){
   report('delivery-receipt-conflict',deliveryId);
   throw Error('No se confirmó el registro de entrega del correo.');
  }
 }
 if(retry)throw Error('Entrega de correo pendiente de reintento.');
}

module.exports={recipientList,configuration,panamaDate,message,failure,deliver};
