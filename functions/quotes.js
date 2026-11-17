'use strict';
// Private quotations and contractual acceptance. This module never writes CRM
// inquiries, sends mail, creates payment links or confirms a payment/reservation.
const {hash,email,webhookInput:prospectInput}=require('./prospects');
const CONCEPTS=['Abono','Saldo','Pago total','Otro'];
const MIN_CENTS=10000,MAX_CENTS=800000;
function text(value,max=500,required=false){
 if(value==null)value='';
 if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error('Texto de cotización no válido.');
 return value.trim();
}
function reference(value){const result=text(value,100,true).normalize('NFKC').toUpperCase().replace(/\s+/g,' ');if(!/^[A-Z0-9][A-Z0-9 ._/-]{0,99}$/.test(result))throw Error('Usa una referencia con letras, números, espacios o guiones.');return result;}
function cents(value){if(!Number.isSafeInteger(value)||value<MIN_CENTS||value>MAX_CENTS)throw Error('El importe debe estar entre US$100 y US$8.000.');return value;}
function decimalCents(value){
 if(typeof value!=='string'&&typeof value!=='number')throw Error('Importe no válido.');
 const raw=String(value);if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw))throw Error('Usa dólares con un máximo de dos decimales.');
 const [whole,fraction='']=raw.split('.');return cents(Number(whole)*100+Number(fraction.padEnd(2,'0')));
}
function day(value){const result=text(value,10);if(result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result))throw Error('Fecha de vuelo no válida.');return result;}
function affirmative(value){
 if(value===true||value==='true')return true;
 if(value===false||value==='false'||value==null||value==='')return false;
 throw Error('La aceptación debe provenir de una casilla explícita.');
}
function bodyObject(body){if(typeof body==='string'||Buffer.isBuffer(body))body=JSON.parse(body.toString());return !Object.hasOwn(body,'token')&&body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data:body;}
function policy(cfg){
 const forms=Object.entries(cfg?.forms||{}).filter(([,form])=>form?.kind==='quoteAcceptance');
 if(forms.length!==1||forms[0][1].area!=='charters')throw Error('Configura un único formulario de aceptación de Charters.');
 const [formId,form]=forms[0],a=form.acceptance;
 const out={formId,conditionsVersion:text(a?.conditionsVersion,100,true),privacyVersion:text(a?.privacyVersion,100,true),conditionsText:text(a?.conditionsText,20000,true),privacyText:text(a?.privacyText,20000,true),formUrl:text(a?.formUrl,2000,true)};
 const url=new URL(out.formUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Dirección del formulario no válida.');
 return out;
}
function webhookInput(body,cfg,now,validated){
 // Reuse all existing size/envelope/token/site/form/contact/date safeguards.
 const base=validated||prospectInput(body,cfg,now),form=cfg.forms[base.formId];
 if(form?.kind!=='quoteAcceptance'||form.area!=='charters')throw Error('Este formulario no registra aceptaciones de cotización.');
 const raw=bodyObject(body),current=policy(cfg);
 if(current.formId!==base.formId)throw Error('Formulario de aceptación no autorizado.');
 const conditionsVersion=text(raw.conditionsVersion,100,true),privacyVersion=text(raw.privacyVersion,100,true);
 if(conditionsVersion!==current.conditionsVersion||privacyVersion!==current.privacyVersion)throw Error('Versión de condiciones o privacidad no autorizada.');
 const result={reference:reference(raw.quoteReference),name:base.name,email:base.email,phone:base.phone,amountCents:decimalCents(raw.amount),acceptedConditions:affirmative(raw.acceptedConditions),acceptedPrivacy:affirmative(raw.acceptedPrivacy),conditionsVersion,privacyVersion,submittedAt:base.submittedAt,formId:base.formId,submissionId:base.submissionId};
 return {...result,conditionsText:current.conditionsText,privacyText:current.privacyText,formUrl:current.formUrl};
}
function deliveryDigest(p){const {conditionsText,privacyText,formUrl,...submitted}=p;return hash(JSON.stringify(submitted));}
function material(record){const {reference,customerName,email,description,flightDate,amountCents,paymentConcept}=record;return hash(JSON.stringify({reference,customerName,email,description,flightDate,amountCents,paymentConcept}));}
function manualInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Cotización no válida.');
 const result={reference:reference(input.reference),customerName:text(input.customerName,160,true),email:email(input.email),phone:text(input.phone,40),description:text(input.description,3000,true),flightDate:day(input.flightDate),amountCents:cents(input.amountCents),paymentConcept:text(input.paymentConcept,30,true),notes:text(input.notes,4000)};
 if(!CONCEPTS.includes(result.paymentConcept)||!Number.isSafeInteger(input.version)||input.version<0)throw Error('Concepto o versión de cotización no válido.');
 result.id=hash(result.reference);if(input.id&&input.id!==result.id)throw Error('La referencia identifica la cotización y no puede cambiarse.');
 return result;
}
function manualMerge(old,input,actor,now){
 const clean=manualInput(input),previous=old?.record;
 if((previous?.version||0)!==input.version)throw Error('La cotización cambió. Actualiza antes de guardar.');
 const digest=material(clean),changed=!previous||previous.materialDigest!==digest;
 const record={...clean,version:(previous?.version||0)+1,materialRevision:(previous?.materialRevision||0)+(changed?1:0),materialDigest:digest,materialChangedAt:changed?now:previous.materialChangedAt,createdAt:previous?.createdAt||now,updatedAt:now,updatedBy:actor.uid};
 // Whitelisting avoids fabricated acceptance, paid flags, links and permissions.
 return {...old,id:clean.id,reference:clean.reference,record};
}
async function pinPolicy(db,p,now){
 // Pin each independent document version. Bumping privacy must not permit
 // silently rewriting conditions with an unchanged conditionsVersion.
 for(const kind of ['conditions','privacy']){
  const snapshot={formId:p.formId,kind,version:p[kind+'Version'],text:p[kind+'Text']};
  const id=hash(snapshot.formId+'\0'+kind+'\0'+snapshot.version),digest=hash(JSON.stringify(snapshot));let conflict=false;
  const result=await db.ref('prospects/quoteAcceptancePolicies/'+id).transaction(old=>{conflict=false;if(old&&old.digest!==digest){conflict=true;return;}return old||{...snapshot,digest,createdAt:now};},undefined,false);
  if(conflict||!result.committed)throw Error('No se puede modificar el contenido de una versión de aceptación.');
 }
}
async function receive(db,p,now){
 await pinPolicy(db,p,now);
 const eventId=hash(p.formId+'\0'+p.submissionId),quoteId=hash(p.reference),digest=deliveryDigest(p),ref=db.ref('prospects/quoteAcceptanceEvents/'+eventId);let conflict=false;
 const claimed=await ref.transaction(old=>{conflict=false;if(old&&old.digest!==digest){conflict=true;return;}return old||{id:eventId,quoteId,digest,input:p,receivedAt:now,done:false};},undefined,false);
 if(conflict||!claimed.committed)throw Error('El identificador ya corresponde a otra aceptación.');
 const receipt=claimed.snapshot.val();if(receipt.done)return {ok:true,duplicate:true};
 p=receipt.input;
 await db.ref('prospects/quotes/'+receipt.quoteId).transaction(old=>{
  if(old?.acceptances?.[eventId])return old;
  const record=old?.record;
  // Bind once to the actual revision visible at original receipt. Neither a
  // pre-quotation submission nor a delayed pre-change event can be reattached.
  const binds=record&&record.email===p.email&&record.amountCents===p.amountCents&&Date.parse(p.submittedAt)>=Date.parse(record.materialChangedAt)&&Date.parse(receipt.receivedAt)>=Date.parse(record.materialChangedAt);
  const evidence={...p,id:eventId,receivedAt:receipt.receivedAt,...(binds?{binding:{materialRevision:record.materialRevision,materialDigest:record.materialDigest}}:{})};
  return {...old,id:receipt.quoteId,reference:p.reference,acceptances:{...old?.acceptances,[eventId]:evidence}};
 },undefined,false);
 await ref.update({done:true});return {ok:true};
}
function evidenceView(e,record,current){
 let reason='';
 if(!record)reason='Registra y revisa la cotización; esta aceptación llegó antes del registro.';
 else if(!e.acceptedConditions||!e.acceptedPrivacy)reason='Falta aceptación explícita de condiciones o privacidad.';
 else if(e.reference!==record.reference||e.email!==record.email||e.amountCents!==record.amountCents)reason='La referencia, el correo o el importe no coinciden.';
 else if(!e.binding||e.binding.materialRevision!==record.materialRevision||e.binding.materialDigest!==record.materialDigest)reason='Se requiere una nueva aceptación de la cotización vigente.';
 else if(e.formId!==current.formId||e.conditionsVersion!==current.conditionsVersion||e.privacyVersion!==current.privacyVersion||e.conditionsText!==current.conditionsText||e.privacyText!==current.privacyText||e.formUrl!==current.formUrl)reason='Se requiere aceptar las condiciones y privacidad vigentes.';
 return {...e,matchesCurrentQuote:!reason,reason};
}
function orderedAcceptances(box){return Object.values(box?.acceptances||{}).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||b.receivedAt.localeCompare(a.receivedAt)||Number(a.acceptedConditions&&a.acceptedPrivacy)-Number(b.acceptedConditions&&b.acceptedPrivacy)||b.id.localeCompare(a.id));}
function quoteView(box,current){
 const record=box.record,events=orderedAcceptances(box).map(e=>evidenceView(e,record,current)),latest=events[0]||null;
 // The newest form response controls; a later unchecked response cannot be
 // bypassed by choosing an older affirmative submission.
 const ready=!!latest?.matchesCurrentQuote;
 const acceptanceStatus=!record?'pending_quote':!latest?'pending_acceptance':ready?'accepted':!latest.acceptedConditions||!latest.acceptedPrivacy||latest.email!==record.email||latest.amountCents!==record.amountCents?'mismatch':'needs_new_acceptance';
 return {...(record||{id:box.id,reference:box.reference,customerName:latest?.name||'',email:latest?.email||'',phone:latest?.phone||'',description:'',flightDate:'',amountCents:latest?.amountCents||MIN_CENTS,paymentConcept:'Abono',notes:'',version:0,materialRevision:0,createdAt:latest?.receivedAt||'',updatedAt:latest?.receivedAt||''}),quoteExists:!!record,readyForPaymentLink:ready,acceptanceStatus,acceptanceCount:events.length,latestAcceptance:latest};
}
function permitted(scope){return !!scope&&(scope.director||scope.full||scope.area==='charters');}
async function handle(db,action,input,actor,current,now=new Date().toISOString()){
 if(action==='quote-save'){
  const clean=manualInput(input.record),ref=db.ref('prospects/quotes/'+clean.id);let failure='';
  const result=await ref.transaction(old=>{failure='';if(old===null&&input.record.version>0)return old;try{return manualMerge(old,input.record,actor,now);}catch(error){failure=error.message;return;}},undefined,false);
  if(failure||!result.committed||!result.snapshot.val()?.record)throw Error(failure||'No se pudo guardar. Actualiza la cotización.');
  return {ok:true,quote:quoteView(result.snapshot.val(),current)};
 }
 if(action==='quote-list'){
  if(input.cursor&&!/^[a-f0-9]{64}$/.test(input.cursor))throw Error('Página no válida.');
  let query=db.ref('prospects/quotes').orderByKey();if(input.cursor)query=query.startAfter(input.cursor);
  const entries=Object.entries((await query.limitToFirst(101).get()).val()||{}).sort(([a],[b])=>a.localeCompare(b));
  return {quotes:entries.slice(0,100).map(([,box])=>quoteView(box,current)),nextCursor:entries.length>100?entries[99][0]:null};
 }
 if(action==='quote-detail'){
  if(!/^[a-f0-9]{64}$/.test(input.id||'')||input.cursor&&!/^\d{13}_[a-f0-9]{64}$/.test(input.cursor))throw Error('Cotización o página no válida.');
  const box=(await db.ref('prospects/quotes/'+input.id).get()).val();if(!box)throw Error('No se encontró la cotización.');
  const all=orderedAcceptances(box).map(e=>({...e,cursor:String(Date.parse(e.submittedAt)).padStart(13,'0')+'_'+e.id})),start=input.cursor?all.findIndex(e=>e.cursor===input.cursor):-1;
  if(input.cursor&&start<0)throw Error('La página de aceptaciones cambió. Actualiza la cotización.');
  const events=all.slice(start+1);
  return {quote:quoteView(box,current),acceptances:events.slice(0,20).map(e=>{const {cursor,...evidence}=e;return evidenceView(evidence,box.record,current);}),nextCursor:events.length>20?events[19].cursor:null};
 }
 throw Error('Operación de cotización no válida.');
}
module.exports={CONCEPTS,MIN_CENTS,MAX_CENTS,reference,decimalCents,policy,webhookInput,deliveryDigest,manualInput,manualMerge,pinPolicy,receive,evidenceView,quoteView,permitted,handle};
