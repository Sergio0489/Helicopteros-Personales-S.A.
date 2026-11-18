'use strict';
const {randomUUID,createHash}=require('node:crypto');
const audit=require('./audit');
const H=require('./honorarios');
const list=v=>Array.isArray(v)?v:[];
const denied=message=>{const e=Error(message);e.status=403;throw e;};
function role(context){return context.director?'Director':context.account?.role||'Estudiante';}
function mayView(context){return !!context.director||['Gerente','Piloto','Administrativo','Contabilidad'].includes(role(context))&&!!context.account?.assignedAt;}
function activeVerified(context){return !!context.user?.emailVerified&&!context.user?.disabled;}
function linkedStudent(data,context){
 const students=list(data.school?.students),account=context.account||{};
 if(account.syncStatus==='matched'&&account.recordKind==='student'&&account.recordId)return students.find(student=>String(student.id)===String(account.recordId))||null;
 const email=String(context.user?.email||'').trim().toLowerCase();if(!email)return null;
 const matches=students.filter(student=>String(student.email||'').trim().toLowerCase()===email);return matches.length===1?matches[0]:null;
}
function myNoShows(data,context){
 const student=linkedStudent(data,context);if(!student)return [];
 return list(student.expenses).filter(expense=>expense.noShowId&&!expense.voidedAt&&!expense.acceptance?.acceptedAt).map(expense=>({id:expense.noShowId,date:expense.date,cents:expense.cents,description:expense.description,aircraft:expense.aircraft}));
}
async function read(db,context,date){
 if(!context.user?.emailVerified||context.user.disabled||!mayView(context))denied('No tienes acceso a Honorarios.');
 const snapshot=await db.ref('dashboard').get(),root=snapshot.val(),data=JSON.parse(root?.payload||'{}'),pilotId=role(context)==='Piloto'&&context.account?.syncStatus==='matched'&&context.account.recordKind==='pilot'?context.account.recordId:null;
 if(!context.director&&!require('./access').visiblePages(require('./access').policyFor(data,context.account)).some(p=>p.id==='honorarios'))denied('No tienes acceso a Honorarios.');
 if(role(context)==='Piloto'&&!pilotId)denied('Vincula tu usuario con un expediente de piloto.');
 const selectedDate=date||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),report=H.report(data,pilotId,selectedDate);
 return {report,canEditRates:!!context.director,canVoidNoShow:context.director||role(context)==='Gerente',pilotId,myNoShows:myNoShows(data,context),operation:root?.operation||null};
}
async function mutate(db,context,reason,apply){
 const operation=randomUUID(),now=new Date().toISOString();let failure='';
 const result=await db.ref('dashboard').transaction(root=>{
  failure='';if(!root?.payload){failure='No hay datos disponibles.';return root;}
  try{const data=JSON.parse(root.payload);apply(data,now);return audit.attach(root,{...root,payload:JSON.stringify(data),operation,revision:(root.revision||0)+1,updatedAt:now,updatedBy:context.user.uid},{uid:context.user.uid,name:context.account?.profile?.name||context.user.displayName||context.user.email,role:role(context)},'dashboard',reason);}
  catch(e){failure=e.message;return;}
 },undefined,false);
 if(!result.committed||failure)throw Error(failure||'No se pudo confirmar el cambio. Actualiza e intenta nuevamente.');
 return {ok:true,operation};
}
async function handle(db,context,action,body={}){
 if(action==='no-show-own-read'){
  if(!activeVerified(context))denied('Inicia sesión con el correo verificado para consultar tus cargos.');
  const snapshot=await db.ref('dashboard').get(),root=snapshot.val(),data=JSON.parse(root?.payload||'{}');
  return {myNoShows:myNoShows(data,context)};
 }
 if(action==='honorarios-read')return read(db,context,body.date);
 if(action==='honorarios-rates-save'){
  if(!context.director||!activeVerified(context))denied('Solo el Director activo puede modificar las tarifas de Honorarios.');
  const rates=H.validateRates(body.rates);
  return {...await mutate(db,context,'Actualización de tarifas de honorarios',(data,now)=>{data.school ||= {};data.school.honorarios ||= {};const old=data.school.honorarios.rates||{};data.school.honorarios.rateHistory ||= [];data.school.honorarios.rateHistory.push({updatedAt:now,updatedBy:context.user.uid,rates:structuredClone(old)});data.school.honorarios.rates=rates;}),rates};
 }
 if(action==='no-show-accept'){
  if(!activeVerified(context))denied('Inicia sesión con el correo verificado del estudiante para aceptar este cargo.');
  if(typeof body.id!=='string'||body.id.length>180)throw Error('Cargo de no show no válido.');
  const saved=await mutate(db,context,'Aceptación digital de cargo por no show',(data,now)=>{
   const student=linkedStudent(data,context),expense=list(student?.expenses).find(e=>e.noShowId===body.id);
   if(!expense||expense.voidedAt)throw Error('El cargo no está disponible para aceptación.');if(expense.acceptance?.acceptedAt)throw Error('Este cargo ya fue aceptado y la firma no se puede repetir.');
   const name=String(student.name||context.account?.profile?.name||context.user.displayName||'').trim();if(!name)throw Error('No se pudo identificar al estudiante.');
   const signed=JSON.stringify({noShowId:body.id,cents:expense.cents,studentId:student.id,uid:context.user.uid,name,acceptedAt:now}),signature=createHash('sha256').update(signed).digest('hex');
   expense.acceptance={acceptedAt:now,acceptedByUid:context.user.uid,acceptedByName:name,signature};
  });
  const root=(await db.ref('dashboard/payload').get()).val(),data=JSON.parse(root||'{}'),expense=list(linkedStudent(data,context)?.expenses).find(e=>e.noShowId===body.id);
  return {...saved,acceptance:expense?.acceptance||null};
 }
 if(action==='no-show-remove'){
  if(!activeVerified(context)||!context.director&&!context.account?.assignedAt||!context.director&&role(context)!=='Gerente')denied('Solo Dirección o Gerencia activa puede retirar el cargo.');
  const id=String(body.id||''),reason=String(body.reason||'').trim();if(!id||id.length>180||!reason||reason.length>500)throw Error('Indica el cargo y el motivo para retirarlo.');
  return mutate(db,context,'Retiro autorizado de cargo por no show',(data,now)=>{
   const student=list(data.school?.students).find(s=>list(s.expenses).some(e=>e.noShowId===id)),expense=list(student?.expenses).find(e=>e.noShowId===id);
   if(!expense||expense.voidedAt)throw Error('El cargo ya fue retirado o no existe.');
   expense.voidedAt=now;expense.voidReason=reason;expense.voidedByUid=context.user.uid;expense.voidedByName=context.account?.profile?.name||context.user.displayName||context.user.email;
  });
 }
 throw Error('Operación de Honorarios no válida.');
}
module.exports={handle,read,mayView,linkedStudent,myNoShows};
