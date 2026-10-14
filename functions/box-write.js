'use strict';
const {permissions}=require('./boxes');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const words=s=>new Set(s.split(' '));
const personal=words('name identity birthDate nationality address previousSchool phone residentialPhone email fatherName motherName emergencyName emergencyPhone referredBy enrolledDate createdDate createdAt updatedAt stage funding interests notes withdrawalReason completedDate completedCourses history');
const aircraft={identity:words('serial year voltaje component_schema_v2'),motor:words('motor_fabricante motor_modelo motor_serie motor_serie_izq motor_fabricante_izq motor_modelo_izq motor_serie_der motor_fabricante_der motor_modelo_der'),propeller:words('helice_fabricante helice_modelo helice_serie helice_serie_izq helice_fabricante_izq helice_modelo_izq helice_serie_der helice_fabricante_der helice_modelo_der'),inspection:words('tac_anterior tac_actual horas_diarias fecha_diaria horas_acum_50 horas_acum_100 fecha_50 fecha_100 proxima_inspeccion horas_totales horas_limite'),flight:words('bitacora_horas'),venc:words('ciclos_totales ciclos_limite limite_motor limite_helice fecha_motor fecha_helices helice1_ciclos helice2_ciclos helice1_limite helice2_limite fecha_helice1 fecha_helice2 ultimo_venc_hv ultimo_venc_fecha ultimo_venc_registry_id'),status:words('status estatus_nota estatus_label horas_desde_revision horas_hasta_revision'),tac:words('bitacora_tac'),inspections:words('bitacora_inspecciones'),orders:words('bitacora_pedidos'),'hours-history':words('bitacora_vencimientos'),documents:words('documentos')};
function boxFor(path,root){
 const [top,key,field]=path;
 if(top==='fleet'){
  if(field==='mantenimiento'){const item=root.fleet?.[key]?.mantenimiento?.[path[3]];if(path[4]==='piezas')return ['aeronaves','tracking'];return ['aeronaves',item?.resuelto?'maintenance':'pending'];}
  if(field?.startsWith('emerg_'))return ['aeronaves','emergency'];
  for(const [box,fields]of Object.entries(aircraft))if(fields.has(field))return ['aeronaves',box];
 }
 if(top==='pilotos'&&['identity','birthDate','nationality','address','emergencyName','emergencyPhone','notes'].includes(field))return ['pilotos','dossier'];
 if(top==='pilotos')return ['pilotos',['licencia','numeroLicencia','tipo','habilitaciones'].includes(field)?'licenses':['medico','medicoClase','charter','escuela','verificaciones'].includes(field)?'documents':'pilots'];
 if(top==='itinerarios')return ['itinerario','flights'];
 if(top==='school'){
  if(key==='rates'||key==='services')return ['estudiantes','rates'];
  if(key==='courseRates'||key==='additionalServices')return ['estudiantes','course-rates'];
  if(key==='intakes')return ['estudiantes','intakes'];if(key==='brochureUrl')return ['estudiantes','mail'];
  if(key==='paymentReceiverNames')return ['pagos','create'];
  if(key==='lastReceiptSequence')return ['pagos','create'];
  if(key==='paymentReceipts'||key==='receiptCounters')return ['pagos',key==='receiptCounters'?'create':path.includes('attachment')?'attachments':'receipts'];
  if(key==='balanceAlertDismissals')return ['saldos',String(field).startsWith('client:')?'clients':'students'];
  const client=key==='registry'&&field==='clients',student=key==='students';
  if(client||student){const i=client?4:3,k=path[i];if(k==='id')return ['estudiantes',client?'clients':'personal'];if(personal.has(k))return ['estudiantes',client?'clients':'personal'];
   if(k==='courses'){const sub=path[i+2];return ['estudiantes',sub==='payments'||sub==='budgets'||sub==='tutoriaEnabled'?'account':sub==='flights'?'hours':'courses'];}
   if(k==='deletedCourses')return ['estudiantes','archived'];if(k==='expenses')return ['estudiantes','expenses'];if(['extraPayments','payments'].includes(k))return ['estudiantes','account'];if(['registryFlights','flights'].includes(k))return ['estudiantes','hours'];
  }
  if(key==='deletedStudents')return ['estudiantes','personal'];
  if(key==='registry'&&field==='deletedEntries')return ['bitacora','history'];
  if(key==='registry'&&field==='entries')return ['bitacora','history'];if(key==='registry'&&field==='destinations')return ['bitacora','form'];
 }
 return null;
}
function rights(policy,pair,action){if(!pair)return false;const [p,b]=pair;return permissions(policy,p,b)[action];}
function allowed(policy,path,root,action,context={}){
 if(path.some(k=>['__proto__','prototype','constructor','authUid','accessConfiguration','userProfiles'].includes(String(k))))return false;
 const pair=boxFor(path,root);
 if(path[0]==='pilotos'&&['id','nombre','email','telefono','celular'].includes(path[2])&&rights(policy,['pilotos','dossier'],action))return true;
 if(action==='view'){
  if(path[0]==='fleet'&&path[2]==='mantenimiento'&&['nombre','resuelto'].includes(path[4])&&rights(policy,['aeronaves','tracking'],'view'))return true;
  if(path[0]==='school'&&path[1]==='students'&&path[3]==='courses'&&['id','type'].includes(path[5])&&['courses','account','hours'].some(b=>rights(policy,['estudiantes',b],'view')))return true;
  if(path[0]==='itinerarios'&&['planner','calendar','create'].some(b=>rights(policy,['itinerario',b],'view')))return true;
  if(path[0]==='school'&&path[1]==='students'&&['id','name','stage','funding'].includes(path[3])&&rights(policy,['estudiantes','directory'],'view'))return true;
 }
 if(rights(policy,pair,action))return true;
 // Creating a flight uses the same records as the daily flight list.
 if(path[0]==='itinerarios'&&context.creating)return rights(policy,['itinerario','create'],action);
 if(path[0]==='school'&&path[1]==='registry'&&path[2]==='entries'&&context.creating)return rights(policy,['bitacora','form'],action);
 if(path[0]==='school'&&path[1]==='paymentReceipts'&&!path.includes('attachment')&&context.creating)return rights(policy,['pagos','create'],action);
 if(path[0]==='school'&&path[1]==='rates'&&rights(policy,['aeronaves','rate'],action))return true;
 return false;
}
function applyChanges(current,before,after,policy,account){
 if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))throw Error('Cambios no válidos.');
 let writes=0;const root=clone(current);
 const check=(path,context)=>{if(path[0]==='school'&&path[1]==='paymentReceiverNames'&&path[2]!==account.uid)throw Error('Solo puedes registrar tu nombre como receptor.');if(account.role==='Estudiante'){
   const student=path[0]==='school'&&path[1]==='students',client=path[0]==='school'&&path[1]==='registry'&&path[2]==='clients';
   const person=student?root.school?.students?.[path[2]]:client?root.school?.registry?.clients?.[path[3]]:null;
   if(!person||account.syncStatus!=='matched'||person.id!==account.recordId||account.recordKind!==(student?'student':'client'))throw Error('Solo puedes modificar tu expediente autorizado.');
  }
  if(!allowed(policy,path,root,'edit',context)){const pair=boxFor(path,root);throw Error('Sin permiso de edición para '+(pair?pair.join(' / '):path.slice(0,3).join(' / '))+'. No se guardó ningún cambio.');}
  if(++writes>5000)throw Error('Demasiados cambios en una sola operación.');
 };
 function checkTree(v,path,context){
  if(Array.isArray(v)&&!v.length&&context.creating&&path[0]==='school'){
   if(path[1]==='students'&&path[3]==='courses'&&rights(policy,['estudiantes','personal'],'edit'))return;
   if(path[1]==='registry'&&path[2]==='clients'&&['flights','payments'].includes(path[4])&&rights(policy,['estudiantes','clients'],'edit'))return;
  }
  if(v===null&&path.at(-1)==='attachment'&&context.creating)return;if(v&&typeof v==='object'&&Object.keys(v).length){for(const k of Object.keys(v))checkTree(v[k],[...path,k],context);}else check(path,context);}
 function merge(actual,old,next,path,context={}){
  if(eq(old,next))return actual;
  if(Array.isArray(old)&&Array.isArray(next)){
   const keyed=[...old,...next].every(v=>v&&typeof v==='object'&&v.id!=null)&&new Set(next.map(v=>String(v.id))).size===next.length;
   if(keyed&&(Array.isArray(actual)||actual===undefined)){
    const result=clone(actual)||[];const newIds=new Set(next.map(v=>String(v.id)));
    for(const item of old)if(!newIds.has(String(item.id))){const n=result.findIndex(v=>String(v.id)===String(item.id));if(n>=0){checkTree(result[n],[...path,n],context);result.splice(n,1);}}
    for(const item of next){const previous=old.find(v=>String(v.id)===String(item.id)),n=result.findIndex(v=>String(v.id)===String(item.id));if(previous&&n<0)throw Error('El registro ya no existe. Actualiza la página.');if(!previous){if(n>=0)throw Error('El identificador del registro ya existe.');checkTree(item,[...path,result.length],{creating:true});result.push(clone(item));}else result[n]=merge(result[n],previous,item,[...path,n],context);}
    return result;
   }
   if(old.length!==next.length){checkTree(actual,path,context);checkTree(next,path,context);return clone(next);}
   return next.map((v,i)=>merge(actual?.[i],old[i],v,[...path,i],context));
  }
  if(old&&next&&typeof old==='object'&&typeof next==='object'&&!Array.isArray(old)&&!Array.isArray(next)){
   const result=clone(actual)||{};for(const k of new Set([...Object.keys(old),...Object.keys(next)])){if(eq(old[k],next[k]))continue;if(!Object.hasOwn(next,k)){checkTree(result[k],[...path,k],context);delete result[k];}else result[k]=merge(result[k],old[k],next[k],[...path,k],context);}return result;
  }
  // A supplied baseline is untrusted: replacing a subtree must authorize every removed field.
  if(actual!==undefined&&actual!==null&&typeof actual==='object')checkTree(actual,path,context);
  checkTree(next===undefined?actual:next,path,context);return clone(next);
 }
 const result=merge(root,before,after,[]);return {data:result,writes};
}
module.exports={boxFor,allowed,applyChanges};

