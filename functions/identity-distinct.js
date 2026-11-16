'use strict';
// Decisions distinguish one reviewed pair; names and documents never join people.
const {createHash}=require('node:crypto');
const {email,identity,personName}=require('./identity-merge');
const audit=require('./audit');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const own=(value,key)=>value&&Object.hasOwn(value,key);
const account=(root,uid)=>own(root.accountRequests,uid)?root.accountRequests[uid]:null;
const unique=values=>[...new Set(values.filter(Boolean))].sort();
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function fail(message,status=409){const error=Error(message);error.status=status;throw error;}
function payload(root){return root.dashboard?.payload?JSON.parse(root.dashboard.payload):{};}

function subjects(root,targetUid,overrides={}){
 const data=payload(root),all=[];
 for(const [uid,stored]of Object.entries(root.accountRequests||{})){
  if(stored?.mergedInto)continue;
  const row=uid===targetUid?{...stored,...(overrides.profile?{profile:overrides.profile}:{}),...(Object.hasOwn(overrides,'email')?{email:overrides.email}:{})}:stored;
  all.push({key:'user:'+uid,uid,role:row?.role||'Estudiante',name:row?.profile?.name||'',email:row?.email||'',identity:row?.profile?.identity||'',personKeys:[],stable:!!uid});
 }
 const directories=[['student',data.school?.students],['pilot',data.pilotos],['personnel',data.school?.personnel],['client',data.school?.registry?.clients]];
 for(const [kind,records]of directories)for(const [index,row]of (Array.isArray(records)?records:[]).entries()){
  if(!row||typeof row!=='object')continue;
  const hasId=typeof row.id==='string'&&!!row.id;
  const personKeys=hasId?Object.entries(data.school?.identityLinks||{}).filter(([,link])=>(link.records||[]).some(ref=>ref.kind===kind&&ref.id===row.id)).map(([key])=>key).sort():[];
  all.push({key:kind+':'+(hasId?row.id:'index-'+index),kind,id:row.id,uid:row.authUid||'',name:kind==='pilot'?row.nombre||'':row.name||'',email:row.email||'',identity:row.identity||'',personKeys,personKey:personKeys[0]||'',stable:hasId});
 }
 const keyCounts=new Map();for(const item of all)keyCounts.set(item.key,(keyCounts.get(item.key)||0)+1);
 for(const item of all)if(keyCounts.get(item.key)>1)item.stable=false;
 const parents=all.map((_,index)=>index),find=index=>parents[index]===index?index:parents[index]=find(parents[index]),seen=new Map();
 all.forEach((item,index)=>{
  for(const key of [item.uid&&'uid:'+item.uid,email(item.email)&&'email:'+email(item.email),...item.personKeys.map(key=>'person:'+key)].filter(Boolean)){
   if(seen.has(key))parents[find(index)]=find(seen.get(key));else seen.set(key,index);
  }
 });
 const grouped=new Map();all.forEach((item,index)=>{const key=find(index);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(item);});
 return [...grouped.values()].map(members=>{
  members.sort((a,b)=>a.key.localeCompare(b.key));
  const keys=members.map(item=>item.key),users=members.filter(item=>!item.kind);
  const uids=unique(members.map(item=>item.uid)),inferredUid=uids.length===1?uids[0]:'';
  // ensure() may fill an unowned email-matching record with this same sole UID.
  // Normalize that equivalent association, while retaining every explicit UID.
  const normalized=members.map(item=>({key:item.key,uid:item.uid||inferredUid,personKeys:item.personKeys,name:personName(item.name),email:email(item.email),identity:identity(item.identity),stable:item.stable}));
  return {key:users[0]?.key||keys[0],members,keys,uids,emails:unique(members.map(item=>email(item.email))),documents:unique(members.map(item=>identity(item.identity))),names:unique(members.map(item=>personName(item.name))),personKeys:unique(members.flatMap(item=>item.personKeys)),fingerprint:hash(normalized)};
 });
}
const intersects=(a,b)=>a.some(value=>b.includes(value));
const sameSubject=(a,b)=>!!a&&!!b&&a===b;
const collides=(a,b)=>!sameSubject(a,b)&&(intersects(a.names,b.names)||intersects(a.documents,b.documents));
const locate=(world,key)=>world.find(subject=>subject.keys.includes(key)||subject.key===key);
function subjectErrors(subject){
 if(!subject)return ['No se encontró la persona. Actualiza la consulta.'];
 const errors=[];
 if(subject.members.some(item=>!item.stable))errors.push('Hay un expediente sin identificador estable. No se puede confirmar esta coincidencia.');
 if(new Set(subject.keys).size!==subject.keys.length)errors.push('Hay identificadores de expediente repetidos.');
 if(subject.uids.length>1)errors.push('El conjunto está asociado a varias cuentas y requiere otra revisión.');
 if(subject.members.some(item=>item.personKeys.length>1))errors.push('Hay un expediente asociado a varios vínculos de identidad.');
 for(const kind of ['student','pilot','personnel','client'])if(subject.members.filter(item=>item.kind===kind).length>1)errors.push('Hay varios expedientes del mismo tipo: '+kind+'.');
 return errors;
}
function pairErrors(target,counterpart){
 const errors=[...subjectErrors(target),...subjectErrors(counterpart)];
 if(!target||!counterpart)return unique(errors);
 if(sameSubject(target,counterpart))errors.push('Los registros ya están vinculados a la misma persona.');
 if(intersects(target.uids,counterpart.uids))errors.push('Los registros comparten una cuenta de acceso.');
 if(intersects(target.emails,counterpart.emails))errors.push('Los registros comparten un correo electrónico.');
 if(intersects(target.personKeys,counterpart.personKeys))errors.push('Los registros comparten un vínculo de identidad.');
 if(intersects(target.documents,counterpart.documents))errors.push('Hay un documento de identidad coincidente; una aprobación de homónimos no puede ignorarlo.');
 if(!intersects(target.names,counterpart.names))errors.push('No hay una coincidencia actual de nombre que se pueda resolver por esta operación.');
 return unique(errors);
}
function validReceipt(receipt,targetUid,target,counterpart){
 return !!receipt&&receipt.version===1&&receipt.targetUid===targetUid&&typeof receipt.requestId==='string'&&UUID.test(receipt.requestId)&&typeof receipt.inputHash==='string'&&HASH.test(receipt.inputHash)&&typeof receipt.revision==='string'&&HASH.test(receipt.revision)&&receipt.verifiedIndependently===true&&!!receipt.reviewedBy?.uid&&receipt.reviewedBy.role==='Director'&&typeof receipt.reviewedAt==='string'&&Number.isFinite(Date.parse(receipt.reviewedAt))&&typeof receipt.reason==='string'&&receipt.reason.trim().length>=10&&receipt.reason.trim().length<=1000&&!!target&&!!counterpart&&
  receipt.targetFingerprint===target.fingerprint&&receipt.counterpartFingerprint===counterpart.fingerprint&&
  !pairErrors(target,counterpart).length;
}
function receipts(root,targetUid){return Object.values(account(root,targetUid)?.identityDistinctDecisions||{});}
function covered(root,targetUid,target,counterpart){return receipts(root,targetUid).some(receipt=>validReceipt(receipt,targetUid,target,counterpart));}
function context(root,targetUid,overrides={}){
 const world=subjects(root,targetUid,overrides),target=locate(world,'user:'+targetUid);
 const collisions=target?world.filter(other=>collides(target,other)):[];
 const remaining=target?Math.max(collisions.filter(other=>!covered(root,targetUid,target,other)).length,subjectErrors(target).length?1:0):1;
 return {world,target,collisions,remaining};
}
function publicItems(subject){return (subject?.members||[]).map(({stable,personKeys,...item})=>({...item,personKey:personKeys.join(', ')}));}
function revision(root,targetUid,target,counterpart,collisions){
 const stored=account(root,targetUid)||{};
 return hash({targetUid,target:target?.fingerprint||'',counterpart:counterpart?.fingerprint||'',collisions:collisions.map(item=>({key:item.key,fingerprint:item.fingerprint})).sort((a,b)=>a.key.localeCompare(b.key)),version:stored.identityReviewVersion||0,pending:!!stored.identityReviewPending,decisions:receipts(root,targetUid).map(item=>({id:item.requestId,inputHash:item.inputHash})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))});
}
function preview(root,targetUid,counterpartKey=''){
 const stored=account(root,targetUid),ctx=context(root,targetUid),{target,collisions,remaining}=ctx;
 const counterpart=counterpartKey?locate(ctx.world,counterpartKey):null;
 const errors=counterpartKey?pairErrors(target,counterpart):subjectErrors(target);
 if(!stored||stored.mergedInto)errors.push('La cuenta no existe o fue unificada.');
 if(stored?.verified!==true)errors.push('La cuenta debe verificar su correo antes de resolver la revisión.');
 const warnings=target&&counterpart&&(!target.documents.length||!counterpart.documents.length)?['Falta documento en una de las personas: verifica por una vía independiente antes de confirmar.']:[];
 const candidates=collisions.map(other=>({counterpartKey:other.key,names:other.names,label:other.members.map(item=>item.name||item.email||item.key).join(' · '),eligible:!pairErrors(target,other).length&&stored?.verified===true,blockers:pairErrors(target,other),approved:covered(root,targetUid,target,other),revision:revision(root,targetUid,target,other,collisions)}));
 return {targetUid,counterpartKey:counterpart?.key||counterpartKey,revision:revision(root,targetUid,target,counterpart,collisions),eligible:!!counterpart&&!errors.length,blockers:unique([...errors,...warnings]),warnings,target:publicItems(target),counterpart:publicItems(counterpart),remaining,approved:!!counterpart&&covered(root,targetUid,target,counterpart),candidates};
}
function approved(root,targetUid,counterpartKey,overrides={}){
 if(!account(root,targetUid))return false;
 const ctx=context(root,targetUid,overrides),other=locate(ctx.world,counterpartKey);
 return !!other&&covered(root,targetUid,ctx.target,other);
}
function invalidated(root,targetUid){
 if(!account(root,targetUid)||account(root,targetUid).mergedInto)return false;
 const ctx=context(root,targetUid);
 return receipts(root,targetUid).some(receipt=>{
  if(!receipt||typeof receipt!=='object')return false;
  const peerKeys=new Set([receipt.counterpartKey,...(Array.isArray(receipt.counterpart)?receipt.counterpart.map(item=>item?.key):[])].filter(Boolean));
  const overlaps=subject=>!!subject&&subject.keys.some(key=>peerKeys.has(key));
  // A new strong association can absorb the reviewed peer into the target.
  if(overlaps(ctx.target))return true;
  // The account key can disappear or split; retain the reviewed stable records.
  return ctx.collisions.some(other=>overlaps(other)&&!validReceipt(receipt,targetUid,ctx.target,other));
 });
}
function confirm(root,body,actor,now=new Date().toISOString()){
 const acting=account(root,actor?.uid);
 if(!actor?.uid||actor.role!=='Director'||(actor.rootDirector!==true&&(!acting||acting.role!=='Director'||!acting.assignedAt||acting.mergedInto)))fail('Solo el Director vigente puede confirmar personas distintas.',403);
 if(typeof body?.targetUid!=='string'||typeof body.counterpartKey!=='string'||!body.targetUid||!body.counterpartKey||typeof body.requestId!=='string'||!UUID.test(body.requestId)||typeof body.revision!=='string'||!HASH.test(body.revision)||body.confirm!==true||body.verifiedIndependently!==true||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.trim().length>1000)fail('Confirma la verificación independiente, indica un motivo de 10 a 1000 caracteres y conserva los identificadores de la revisión.',400);
 const requestId=body.requestId.toLowerCase(),reason=body.reason.trim(),stored=account(root,body.targetUid);
 if(!stored)fail('La cuenta ya no existe. Actualiza.');
 const inputHash=hash({targetUid:body.targetUid,counterpartKey:body.counterpartKey,revision:body.revision,requestId,reason,confirm:true,verifiedIndependently:true});
 const previous=stored.identityDistinctDecisions?.[requestId];
 if(previous){
  if(previous.inputHash!==inputHash||previous.reviewedBy?.uid!==actor.uid)fail('El identificador de esta decisión ya se usó con otros datos o por otro Director.');
  const current=context(root,body.targetUid);
  return {root,targetUid:body.targetUid,decisionId:requestId,remaining:current.remaining,resolved:!stored.identityReviewPending&&current.remaining===0,deduplicated:true};
 }
 const view=preview(root,body.targetUid,body.counterpartKey);
 if(view.revision!==body.revision)fail('Cambió la información de identidad o sus coincidencias. Actualiza y vuelve a revisar.');
 if(!view.eligible)fail(view.blockers.join(' ')||'Esta coincidencia no se puede resolver como personas distintas.');
 const ctx=context(root,body.targetUid),other=locate(ctx.world,body.counterpartKey),time=typeof now==='function'?now():now;
 if(typeof time!=='string'||!Number.isFinite(Date.parse(time)))fail('La fecha de la decisión no es válida.',400);
 const decision={version:1,requestId,targetUid:body.targetUid,counterpartKey:other.key,targetFingerprint:ctx.target.fingerprint,counterpartFingerprint:other.fingerprint,revision:body.revision,inputHash,reviewedBy:{uid:actor.uid,name:actor.name||'',role:'Director'},reviewedAt:time,reason,verifiedIndependently:true,target:view.target,counterpart:view.counterpart};
 const nextAccount={...stored,identityDistinctDecisions:{...stored.identityDistinctDecisions,[requestId]:decision},identityReviewVersion:(Number.isSafeInteger(stored.identityReviewVersion)?stored.identityReviewVersion:0)+1,syncedOperation:null};
 const nextRoot={...root,accountRequests:{...root.accountRequests,[body.targetUid]:nextAccount}};
 const remaining=context(nextRoot,body.targetUid).remaining;
 decision.remaining=remaining;decision.resolved=remaining===0;nextAccount.identityReviewPending=remaining!==0;
 if(remaining===0)nextAccount.syncStatus='no-match';
 nextRoot.accountRequests[body.targetUid]=audit.attach(stored,nextAccount,actor,'account','Personas distintas: '+reason,body.targetUid);
 return {root:nextRoot,targetUid:body.targetUid,decisionId:requestId,remaining,resolved:remaining===0,deduplicated:false};
}
function preventsMerge(root,memberKeys){
 const selected=new Set(Array.isArray(memberKeys)?memberKeys:[]);
 for(const [uid,stored]of Object.entries(root.accountRequests||{})){
  if(stored?.mergedInto||!Object.keys(stored?.identityDistinctDecisions||{}).length)continue;
  const ctx=context(root,uid);
  for(const receipt of receipts(root,uid)){
   const other=locate(ctx.world,receipt.counterpartKey);
   if(validReceipt(receipt,uid,ctx.target,other)&&ctx.target.keys.some(key=>selected.has(key))&&other.keys.some(key=>selected.has(key)))return true;
  }
 }
 return false;
}
module.exports={preview,confirm,approved,invalidated,preventsMerge};
