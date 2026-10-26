'use strict';
// Private CRM storage. Never writes students, Auth users, or the operational dashboard.
const {createHash,timingSafeEqual}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const COURSES=['privado','comercial','ifr','multimotor','rpa','instructor'];
const STATES=['Nueva','En seguimiento','Información enviada','Confirmada','No concretada'];
function text(v,max=500){if(v==null)return '';if(typeof v!=='string'||v.length>max)throw Error('Texto no válido.');return v.trim();}
function email(v){const s=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Ingresa un correo válido.');return s;}
function date(v){const s=text(v,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))throw Error('Fecha no válida.');return s;}
function timestamp(v){const s=text(v,40);if(!/^\d{4}-\d{2}-\d{2}T/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('Fecha del envío no válida.');return new Date(s).toISOString();}
function areas(v){if(!Array.isArray(v)||v.length>2||!v.length||v.some(x=>!['charters','school'].includes(x)))throw Error('Selecciona Charters, Cursos de pilotos o ambos.');return [...new Set(v)].sort();}
function courses(v){if(v==null||v==='')return [];if(!Array.isArray(v)||v.length>6||v.some(x=>!COURSES.includes(x)))throw Error('Cursos no válidos.');return [...new Set(v)].sort();}
function consent(status,evidence,at,source){if(!['unknown','granted','withdrawn'].includes(status))throw Error('Consentimiento no válido.');evidence=text(evidence,1000);if(status!=='unknown'&&!evidence)throw Error('Registra cómo y cuándo autorizó o retiró los avisos de cursos.');return {status,evidence,at,source};}
function newContact(input,now){return {id:hash(input.email),email:input.email,name:input.name,phone:input.phone,areas:input.areas,courses:input.courses,status:'Nueva',responsible:input.areas.length===2?'Antonio / Fernando Alvarado':input.areas[0]==='charters'?'Antonio':'Fernando Alvarado',notes:'',nextContact:'',consent:{status:'unknown'},createdAt:now,updatedAt:now,version:0};}
function manualInput(input){const clean={email:email(input.email),name:text(input.name,160),phone:text(input.phone,40),areas:areas(input.areas),courses:courses(input.courses),interest:text(input.interest,3000),channel:text(input.channel||'WhatsApp',30),status:text(input.status||'Nueva',30),responsible:text(input.responsible,160),notes:text(input.notes,4000),nextContact:date(input.nextContact)};if(!clean.name)throw Error('Ingresa el nombre.');if(!['WhatsApp','Teléfono','Presencial','Correo'].includes(clean.channel)||!STATES.includes(clean.status))throw Error('Canal o estado no válido.');return clean;}
function areaState(old){const area=old?.areas?.length===1?old.areas[0]:null,followups={...old?.areaFollowups},last={...old?.areaLastInquiry};if(area&&!followups[area])followups[area]={status:old.status||'Nueva',responsible:old.responsible||'',notes:old.notes||'',nextContact:old.nextContact||''};if(area&&!last[area]&&old.lastInquiry)last[area]=old.lastInquiry;return {areaFollowups:followups,areaLastInquiry:last};}
function manualMerge(old,input,actor,now){const p=manualInput(input);p.responsible ||= p.areas.length===2?'Antonio / Fernando Alvarado':p.areas[0]==='charters'?'Antonio':'Fernando Alvarado';if(input.id&&input.id!==hash(p.email))throw Error('El correo identifica el registro y no puede cambiarse.');if((old?.version||0)!==input.version)throw Error('El registro cambió. Actualiza antes de guardar.');const next={...(old||newContact(p,now)),...areaState(old),...p,updatedAt:now,updatedBy:actor.uid,version:(old?.version||0)+1};delete next.interest;delete next.channel;if(p.areas.length===1)next.areaFollowups[p.areas[0]]={status:p.status,responsible:p.responsible,notes:p.notes,nextContact:p.nextContact,updatedAt:now,updatedBy:actor.uid};if(input.consentStatus&&input.consentStatus!==(old?.consent?.status||'unknown'))next.consent=consent(input.consentStatus,input.consentEvidence,now,'Registro manual · '+actor.uid);
 if(!old){next.lastInquiry={channel:p.channel,interest:p.interest,at:now};next.inquiryCount=1;}
 if(p.interest){const inquiry={channel:p.channel,interest:p.interest,at:now,areas:p.areas,courses:p.courses};next.lastInquiry=inquiry;next.inquiryCount=(old?.inquiryCount||0)+1;for(const area of p.areas)next.areaLastInquiry[area]=inquiry;}
 return next;
}
function authorizedConfig(raw){let cfg;try{cfg=JSON.parse(raw);}catch{throw Error('Integración pendiente de configuración.');}if(typeof cfg.token!=='string'||cfg.token.length<43||!cfg.siteId||!cfg.forms||typeof cfg.forms!=='object')throw Error('Integración pendiente de configuración.');return cfg;}
function validToken(actual,expected){return typeof actual==='string'&&actual.length<=200&&timingSafeEqual(Buffer.from(hash(actual)),Buffer.from(hash(expected)));}
function webhookInput(body,cfg,now){
 if(typeof body==='string'||Buffer.isBuffer(body)){if(Buffer.byteLength(body)>32768)throw Error('Envío no válido.');try{body=JSON.parse(body.toString());}catch{throw Error('Envío no válido.');}}
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>32768)throw Error('Envío no válido.');
 // Wix can wrap the configured parameters in data. Never merge both envelopes.
 if(!Object.hasOwn(body,'token')&&body.data&&typeof body.data==='object'&&!Array.isArray(body.data))body=body.data;
 if(!validToken(body.token,cfg.token)){const err=Error('No autorizado.');err.status=401;throw err;}const formId=text(body.formId,200),form=Object.hasOwn(cfg.forms,formId)?cfg.forms[formId]:null;if(body.siteId!==cfg.siteId||!form||!['charters','school'].includes(form.area))throw Error('Formulario no autorizado.');const submittedAt=timestamp(body.submittedAt);if(Date.parse(submittedAt)>Date.parse(now)+300000)throw Error('Fecha futura no válida.');const p={email:email(body.email),name:text(body.name,160),phone:text(body.phone,40),areas:[form.area],courses:courses(body.courses),...(body.requestedCourse?{requestedCourse:text(body.requestedCourse,500)}:{}),interest:text(body.interest,3000),submissionId:text(body.submissionId,200),formId,submittedAt,courseUpdates:body.courseUpdates===true||body.courseUpdates==='true'};if(!p.name||!p.submissionId)throw Error('Falta nombre o identificador del envío.');if(form.area==='charters'&&(p.courses.length||p.requestedCourse||p.courseUpdates))throw Error('Un formulario de Charters no puede registrar cursos ni consentimiento de Escuela.');if(p.requestedCourse&&form.courseMap&&Object.hasOwn(form.courseMap,p.requestedCourse))p.courses=courses([...new Set([...p.courses,form.courseMap[p.requestedCourse]])]);if(p.courseUpdates&&(!form.consentVersion||!form.consentStatement))throw Error('Falta configurar el texto de consentimiento del formulario.');if(p.courseUpdates)p.consent=consent('granted',text(form.consentStatement,1000),submittedAt,'Wix · '+formId+' · '+text(form.consentVersion,100));return p;}
function wixMerge(old,p,eventId,now){if(old?.received?.[eventId])return old;const next={...(old||newContact(p,now)),...areaState(old),areas:[...new Set([...(old?.areas||[]),...p.areas])].sort(),courses:[...new Set([...(old?.courses||[]),...p.courses])].sort(),updatedAt:now,version:(old?.version||0)+1,inquiryCount:(old?.inquiryCount||0)+1};for(const area of p.areas){if(!next.areaLastInquiry[area]||p.submittedAt>=next.areaLastInquiry[area].at)next.areaLastInquiry[area]={channel:'Formulario web',interest:p.interest,requestedCourse:p.requestedCourse||'',at:p.submittedAt,formId:p.formId,areas:[area],courses:p.courses};}const last=old?.lastInquiry;if(!last||p.submittedAt>=last.at)next.lastInquiry={channel:'Formulario web',interest:p.interest,at:p.submittedAt,formId:p.formId};if(!old?.phone&&p.phone)next.phone=p.phone;if(p.consent&&(!old?.consent?.at||p.consent.at>old.consent.at))next.consent=p.consent;
 // Keep retry markers bounded; durable receipts remain separately available.
 const received={...old?.received,[eventId]:now};next.received=Object.fromEntries(Object.entries(received).sort((a,b)=>b[1].localeCompare(a[1])).slice(0,100));return next;
}
async function receive(db,p,now){const id=hash(p.formId+'\0'+p.submissionId),key=hash(p.email),digest=hash(JSON.stringify(p)),receipt=db.ref('prospects/receipts/'+id);let collision=false;const claim=await receipt.transaction(old=>{collision=false;if(old&&old.digest!==digest){collision=true;return;}return old||{digest,contact:key,createdAt:now,done:false};},undefined,false);if(collision||!claim.committed)throw Error('El identificador ya corresponde a otro envío.');if(claim.snapshot.val()?.done)return {ok:true,duplicate:true};await db.ref('prospects/contacts/'+key).transaction(old=>wixMerge(old,p,id,now),undefined,false);await db.ref('prospects/inquiries/'+key+'/'+String(Date.parse(p.submittedAt)).padStart(13,'0')+'_'+id).set({channel:'Formulario web',at:p.submittedAt,formId:p.formId,requestedCourse:p.requestedCourse||'',interest:p.interest,areas:p.areas,courses:p.courses});await receipt.update({done:true});return {ok:true};}
function enrolled(s){const paid=items=>(Array.isArray(items)?items:[]).some(p=>!p.voidedAt&&!p.voided&&Number(p.cents)>0);return !!s.enrolledDate||['Matriculado','En formación','Culminado','Carrera culminada','Retirado'].includes(s.stage)||(s.courses||[]).some(c=>paid(c.payments))||paid(s.extraPayments);}
function publicContact(record,students){const {received,...out}=record;const matches=students.filter(s=>{try{return email(s.email)===record.email;}catch{return false;}});out.studentMatch=matches.length===1?{id:matches[0].id||'',name:matches[0].name||'',enrolled:enrolled(matches[0])}:null;out.ambiguousStudent=matches.length>1;out.courseUpdatesEligible=record.areas.includes('school')&&record.consent?.status==='granted'&&!out.ambiguousStudent&&!out.studentMatch?.enrolled;return out;}
function scopedContact(record,students,area){
 if(!area)return publicContact(record,students);
 if(!record.areas.includes(area))return null;
 const single=record.areas.length===1,follow=record.areaFollowups?.[area]||(single?record:{}),last=record.areaLastInquiry?.[area]||(single?record.lastInquiry:null);
 const out={id:record.id,email:record.email,name:record.name,phone:record.phone,areas:[area],courses:area==='school'?(record.courses||[]):[],version:record.version,status:follow.status||'Nueva',responsible:follow.responsible||(area==='school'?'Fernando Alvarado':'Antonio'),notes:follow.notes||'',nextContact:follow.nextContact||'',lastInquiry:last?{channel:last.channel,interest:last.interest,at:last.at}:null,consent:area==='school'?(record.consent||{status:'unknown'}):{status:'unknown'}};
 if(area==='school'){const matched=publicContact(record,students);out.studentMatch=matched.studentMatch?{enrolled:matched.studentMatch.enrolled}:null;out.ambiguousStudent=matched.ambiguousStudent;out.courseUpdatesEligible=matched.courseUpdatesEligible;}
 return out;
}
function scopedMerge(old,input,actor,now){
 const area=actor.prospectArea;if(!area)return manualMerge(old,input,actor,now);
 const p=manualInput(input);if(p.areas.length!==1||p.areas[0]!==area||area==='charters'&&(p.courses.length||input.consentStatus&&input.consentStatus!=='unknown'))throw Error('Solo puedes gestionar consultas de tu área.');
 const existing=old?.areas.includes(area);
 if(existing&&(old.version||0)!==input.version||!existing&&input.version!==0)throw Error('El registro cambió. Actualiza antes de guardar.');
 if(input.id&&input.id!==hash(p.email))throw Error('El correo no puede cambiarse.');
 const next={...(old||newContact(p,now)),...areaState(old),areas:[...new Set([...(old?.areas||[]),area])].sort(),updatedAt:now,updatedBy:actor.uid,version:(old?.version||0)+1};
 if(!old||existing){next.name=p.name;next.phone=p.phone;}
 if(area==='school')next.courses=p.courses;
 const responsible=p.responsible||(area==='school'?'Fernando Alvarado':'Antonio');
 next.areaFollowups={...next.areaFollowups,[area]:{status:p.status,responsible,notes:p.notes,nextContact:p.nextContact,updatedAt:now,updatedBy:actor.uid}};
 if(next.areas.length===1)Object.assign(next,next.areaFollowups[area]);
 if(area==='school'&&input.consentStatus&&input.consentStatus!==(old?.consent?.status||'unknown'))next.consent=consent(input.consentStatus,input.consentEvidence,now,'Registro manual · '+actor.uid);
 if(p.interest){const inquiry={channel:p.channel,interest:p.interest,at:now,areas:[area],courses:p.courses};next.lastInquiry=inquiry;next.areaLastInquiry={...next.areaLastInquiry,[area]:inquiry};next.inquiryCount=(old?.inquiryCount||0)+1;}
 return next;
}
async function handle(db,action,input,actor,now=new Date().toISOString()){
 const area=actor.prospectArea||null;
 if(action==='prospect-save'){
  const p=manualInput(input.record||{}),key=hash(p.email),ref=db.ref('prospects/contacts/'+key);let failure='';
  const result=await ref.transaction(old=>{failure='';if(old===null&&input.record.version>0)return old;try{return scopedMerge(old,input.record,actor,now);}catch(e){failure=e.message;return;}},undefined,false);
  if(failure||!result.committed||!result.snapshot.val())throw Error(failure||'No se pudo guardar. Actualiza el registro.');
  if(p.interest){const id=String(Date.parse(now)).padStart(13,'0')+'_'+hash(actor.uid+'|'+result.snapshot.val().version);await db.ref('prospects/inquiries/'+key+'/'+id).set({channel:p.channel,at:now,interest:p.interest,areas:p.areas,courses:p.courses});}
  return {ok:true};
 }
 if(action==='prospect-detail'){
  if(!/^[a-f0-9]{64}$/.test(input.id||'')||input.cursor&&!/^\d{13}_[a-f0-9]{64}$/.test(input.cursor))throw Error('Contacto o página no válida.');
  const record=(await db.ref('prospects/contacts/'+input.id).get()).val();if(!record||area&&!record.areas.includes(area))throw Error('No tienes acceso a este contacto.');
  let before=input.cursor,entries=[];
  do{let query=db.ref('prospects/inquiries/'+input.id).orderByKey();if(before)query=query.endBefore(before);const batch=Object.entries((await query.limitToLast(21).get()).val()||{}).sort(([a],[b])=>b.localeCompare(a));entries.push(...batch.filter(([,q])=>!area||q.areas?.includes(area)));if(batch.length<21)break;before=batch.at(-1)[0];}while(entries.length<21);
  return {inquiries:entries.slice(0,20).map(([id,q])=>({id,...q,...(area?{areas:[area],courses:area==='school'?(q.courses||[]):[]}: {})})),nextCursor:entries.length>20?entries[19][0]:null};
 }
 if(action==='prospect-list'){
  if(input.cursor&&!/^[a-f0-9]{64}$/.test(input.cursor))throw Error('Página no válida.');
  let after=input.cursor,records=[];
  do{let query=db.ref('prospects/contacts').orderByKey();if(after)query=query.startAfter(after);const batch=Object.values((await query.limitToFirst(101).get()).val()||{}).sort((a,b)=>a.id.localeCompare(b.id));records.push(...batch.filter(r=>!area||r.areas.includes(area)));if(batch.length<101)break;after=batch.at(-1).id;}while(records.length<101);
  const payload=area==='charters'?null:(await db.ref('dashboard/payload').get()).val(),students=JSON.parse(payload||'{}').school?.students||[];
  return {contacts:records.slice(0,100).map(r=>scopedContact(r,students,area)),nextCursor:records.length>100?records[99].id:null};
 }
 throw Error('Operación no válida.');
}

module.exports={COURSES,STATES,email,hash,manualInput,manualMerge,authorizedConfig,validToken,webhookInput,wixMerge,receive,enrolled,publicContact,scopedContact,scopedMerge,handle};

