'use strict';
const assert=require('node:assert/strict');
const now='2026-11-09T15:00:00.000Z';
const statement='Quiero recibir por correo electrónico novedades sobre próximos cursos de HP Flight School, de Helicópteros Personales S.A. Puedo retirar mi autorización en cualquier momento escribiendo a info@helicopterospersonales.com.';
const policy={statement,channels:['email']};
const config={token:'fictional-token-'.repeat(4),siteId:'fictional-site',forms:{
 'school-contact':{area:'school',courseMap:{'Piloto privado':'privado'},consentPolicies:{'hpfs-cursos-email-v1':policy}},
 'school-contact-2':{area:'school',consentPolicies:{'hpfs-cursos-email-v1':policy}},
 charters:{area:'charters'},legacy:{area:'school',consentVersion:'legacy-v1',consentStatement:'Autorización ficticia anterior.'}
}};
const body={token:config.token,siteId:config.siteId,formId:'school-contact',submissionId:'fictional-submission-001',submittedAt:now,
 name:'Persona Ficticia',email:'persona@example.test',phone:'TEST-ONLY',requestedCourse:'Piloto privado',interest:'Consulta ficticia sobre horarios.',
 courseUpdates:true,consentVersion:'hpfs-cursos-email-v1'};

// Model RTDB pruning of empty arrays/objects and transaction callbacks on cold
// caches. Every write stays in this memory tree, never in a Firebase service.
function prune(value){
 if(value===null||value===undefined)return null;
 if(typeof value!=='object')return value;
 if(Array.isArray(value)){const a=value.map(prune);return a.length?a:null;}
 const entries=Object.entries(value).map(([k,v])=>[k,prune(v)]).filter(([,v])=>v!==null);
 return entries.length?Object.fromEntries(entries):null;
}
function memory(seed={}){
 let root=prune(structuredClone(seed))||{},failure=null;const writes=[];
 const read=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],root);
 const snapshot=value=>({val:()=>structuredClone(value??null)});
 function write(path,value,operation){
  assert(path.startsWith('prospects/'),'No writes outside the private CRM');
  if(failure&&failure(path,operation,value)){failure=null;throw Error('Simulated interruption');}
  const keys=path.split('/');let target=root;
  for(const key of keys.slice(0,-1))target=target[key]||={};
  const cleaned=prune(value);if(cleaned===null)delete target[keys.at(-1)];else target[keys.at(-1)]=cleaned;
  writes.push({path,operation});
 }
 return {root:()=>structuredClone(root),read:path=>structuredClone(read(path)),writes,failOnce:fn=>{failure=fn;},ref(path){
  let end='',start='',limit=Infinity,last=false;
  const ref={
   get:async()=>{let value=read(path);if(limit!==Infinity)value=Object.fromEntries(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)).filter(([k])=>(!end||k<end)&&k>start).slice(last?-limit:0,last?undefined:limit));return snapshot(value);},
   transaction:async fn=>{
    // SDK can invoke an updater first with an empty cache, then current data.
    if(fn(null)===undefined)return {committed:false,snapshot:snapshot(null)};
    const value=fn(structuredClone(read(path)??null));
    if(value===undefined)return {committed:false,snapshot:snapshot(read(path))};
    write(path,value,'transaction');return {committed:true,snapshot:snapshot(read(path))};
   },
   set:async value=>write(path,value,'set'),update:async value=>write(path,{...read(path),...value},'update'),
   orderByKey:()=>ref,endBefore:v=>(end=v,ref),startAfter:v=>(start=v,ref),limitToLast:v=>(limit=v,last=true,ref),limitToFirst:v=>(limit=v,ref)
  };return ref;
 }};
}
module.exports={now,statement,policy,config,body,memory};
