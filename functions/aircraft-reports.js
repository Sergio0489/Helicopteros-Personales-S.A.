'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {policyFor}=require('./access');
const {permissions}=require('./boxes');

const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const panamaDate=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const hash=value=>createHash('sha256').update(value).digest('hex');

function tasksFor(data){
 const tasks=[];
 for(const [registration,aircraft] of Object.entries(data.fleet||{})){
  const maintenance=aircraft?.mantenimiento;
  const rows=Array.isArray(maintenance)?maintenance:maintenance&&typeof maintenance==='object'?Object.values(maintenance):[];
  for(const task of rows)if(task&&typeof task==='object')tasks.push({registration,task});
 }
 return tasks;
}

async function handle(db,{user,account,actor,body,now=()=>new Date().toISOString()}){
 if(user.disabled||!user.emailVerified||account?.role!=='Piloto'||!account.assignedAt||account.recordKind!=='pilot'||account.syncStatus!=='matched')return {status:403,error:'Solo un piloto con expediente vinculado puede reportar una aeronave.'};
 const registration=String(body.aircraft||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'_');
 const description=String(body.description||'').trim().slice(0,1000),idempotencyKey=body.idempotencyKey;
 if(!/^HP_?[A-Z0-9]+$/.test(registration)||description.length<5||typeof idempotencyKey!=='string'||!REQUEST_ID.test(idempotencyKey))return {status:400,error:'Selecciona una aeronave, describe el reporte (mínimo 5 caracteres) y conserva su identificador de envío.'};

 const rootRef=db.ref('dashboard'),operation=randomUUID(),createdAt=now(),newTaskId=randomUUID(),receiptKey=hash(user.uid+'\u0000'+idempotencyKey),inputHash=hash(registration+'\u0000'+description);let failure='',failureStatus=409,taskId='',savedOperation='',replayed=false;
 const result=await rootRef.transaction(root=>{
  failure='';failureStatus=409;taskId='';savedOperation='';replayed=false;
  // A null local cache is not authoritative. Returning it lets RTDB compare
  // with the server snapshot and invoke this callback again with current data.
  if(!root?.payload)return root;
  try{
   const data=JSON.parse(root.payload);
   // Use the same effective view permission as the UI, from each transaction snapshot.
   if(!permissions(policyFor(data,account),'aeronaves','status').view){failure='No tienes permiso para reportar problemas de aeronaves. Actualiza la aplicación para revisar tus accesos.';failureStatus=403;return;}
   const aircraft=data.fleet?.[registration];if(!aircraft)throw Error('La aeronave no existe. Actualiza la aplicación.');
   const pilot=(data.pilotos||[]).find(p=>p.id===account.recordId&&p.authUid===user.uid);if(!pilot)throw Error('El expediente de piloto cambió. Actualiza la aplicación.');
   // Receipts live outside the editable payload so resolving or deleting a task
   // cannot turn a retry of an accepted report into a new report.
   const receipt=root.aircraftReportReceipts?.[receiptKey];
   if(receipt){
    if(receipt.inputHash!==inputHash)throw Error('El identificador de este reporte ya se usó con otros datos. Actualiza el formulario.');
    taskId=receipt.taskId;savedOperation=receipt.operation;replayed=true;return root;
   }
   const remember=()=>({...root,aircraftReportReceipts:{...root.aircraftReportReceipts,[receiptKey]:{taskId,operation:savedOperation,inputHash}}});
   const previous=tasksFor(data).find(({task})=>task.reportIdempotencyKey===idempotencyKey&&task.reportadoPorUid===user.uid);
   if(previous){
    if(previous.registration!==registration||previous.task.description!==description)throw Error('El identificador de este reporte ya se usó con otros datos. Actualiza el formulario.');
    taskId=previous.task.id;savedOperation=previous.task.reportOperation||root.operation||operation;replayed=true;return remember();
   }
   if(!Array.isArray(aircraft.mantenimiento))aircraft.mantenimiento=aircraft.mantenimiento&&typeof aircraft.mantenimiento==='object'?Object.values(aircraft.mantenimiento):[];
   taskId=newTaskId;
   aircraft.mantenimiento.push({id:taskId,nombre:'Reporte de piloto: '+description,fecha:panamaDate(createdAt),resuelto:false,piezas:[],reportadoPor:pilot.nombre||account.profile?.name||user.email,reportadoPorUid:user.uid,reportadoAt:createdAt,reportIdempotencyKey:idempotencyKey,reportOperation:operation,registration,description});
   data.operationalNotices||=[];data.operationalNotices.push({id:'aircraft-report:'+taskId,kind:'aircraft-report',aircraft:registration.replaceAll('_','-'),taskId,createdAt,recipients:[{kind:'group',id:'mechanics'},{kind:'group',id:'pilots'}],message:'Reporte de piloto para '+registration.replaceAll('_','-')+': '+description});data.operationalNotices=data.operationalNotices.slice(-500);
   savedOperation=operation;return require('./audit').attach(root,{...remember(),payload:JSON.stringify(data),operation,revision:(root.revision||0)+1,updatedAt:createdAt,updatedBy:user.uid},actor,'dashboard','Reporte de aeronave por piloto');
  }catch(error){failure=error.message;return;}
 },undefined,false);
 if(failure)return {status:failureStatus,error:failure};
 if(!taskId)return {status:409,error:result.snapshot?.val()?.payload?'No se pudo guardar el reporte.':'No hay datos disponibles para guardar.'};
 if(!result.committed)return {status:409,error:'No se pudo guardar el reporte.'};
 return {ok:true,taskId,operation:savedOperation,deduplicated:replayed};
}

module.exports={handle,tasksFor};
