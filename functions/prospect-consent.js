'use strict';
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
function requiredText(value,max){
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Texto o versión de consentimiento no válido.');
 return value.trim();
}

// The request selects an approved version, never the wording or the channel.
function resolve(body,form,input){
 const requested=body.consentVersion==null?'':requiredText(body.consentVersion,100);
 let version='',statement='',channels=[],mode='legacy';
 if(form.consentPolicies!==undefined){
  mode='versioned';
  const policies=form.consentPolicies;
  if(!policies||typeof policies!=='object'||Array.isArray(policies))throw Error('Catálogo de consentimiento no válido.');
  if(input.courseUpdates&&!requested)throw Error('Falta la versión del consentimiento aceptado.');
  if(requested){
   if(!Object.hasOwn(policies,requested))throw Error('Versión de consentimiento no autorizada.');
   const policy=policies[requested];
   statement=requiredText(policy?.statement,1000);
   if(!Array.isArray(policy.channels)||policy.channels.length!==1||policy.channels[0]!=='email')throw Error('Canal de consentimiento no autorizado.');
   version=requested;channels=['email'];
  }
 }else if(input.courseUpdates||requested){
  version=requiredText(form.consentVersion,100);statement=requiredText(form.consentStatement,1000);
  if(requested&&requested!==version)throw Error('Versión de consentimiento no autorizada.');
  // Older statements do not prove any particular channel.
 }
 return {accepted:input.courseUpdates,version,statement,channels,mode,at:input.submittedAt,
  source:'Wix · '+input.formId+(version?' · '+version:''),formId:input.formId,submissionId:input.submissionId};
}

// A version becomes immutable on its first observed delivery, including an
// unchecked box. Corrections require a new version, not replacement wording.
async function pinPolicy(db,response,now){
 if(response?.mode!=='versioned'||!response.version)return;
 const policy={formId:response.formId,version:response.version,statement:response.statement,channels:response.channels};
 const digest=hash(JSON.stringify(policy));let conflict=false;
 const result=await db.ref('prospects/consentPolicies/'+hash(policy.formId+'\0'+policy.version)).transaction(old=>{
  conflict=false;
  if(old&&old.digest!==digest){conflict=true;return;}
  return old||{...policy,digest,createdAt:now};
 },undefined,false);
 if(conflict||!result.committed)throw Error('El texto de esta versión de consentimiento no puede cambiarse.');
}

function change(old,next,id,now,extra={}){
 const event={...next.consent,previous:old?.consent||{status:'unknown'},receivedAt:now,...extra};
 // Committed with the contact state: even an interrupted later inquiry write
 // cannot lose a withdrawal. This journal is omitted from contact list responses.
 next.consentHistory={...old?.consentHistory,[id]:event};
}
function manualChange(old,next,input,actor,now){
 if(!input.consentStatus||input.consentStatus===(old?.consent?.status||'unknown'))return;
 if(!next.areas.includes('school'))throw Error('La autorización de cursos pertenece a Escuela.');
 const id=String(Date.parse(now)).padStart(13,'0')+'_'+hash('manual|'+actor.uid+'|'+next.version);
 change(old,next,id,now,{actor:actor.uid,kind:'manual'});
}

module.exports={resolve,pinPolicy,change,manualChange};
