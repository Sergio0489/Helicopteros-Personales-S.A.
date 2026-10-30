'use strict';
const {randomUUID}=require('node:crypto');
const M=require('./itinerary-model');
const audit=require('./audit');
const {normalize}=require('./boxes');
function enable(data){
 if(data.itinerary?.version)return false;
 M.setup(data);
 // Preserve every existing box permission before granting only own pilot requests.
 const roles=data.school?.accessConfiguration?.roles;
 if(roles?.Piloto?.itinerario?.actions?.view){const policy=normalize(roles.Piloto),p=policy.itinerario;p.actions.edit=true;p.boxes.requests={view:true,edit:true};p.areas['Solicitudes de vuelos']=true;roles.Piloto=policy;}
 return true;
}
async function transaction(db,actor,reason,update){
 let failure='',outcome;const operation=randomUUID(),now=new Date().toISOString();
 const result=await db.ref('dashboard').transaction(root=>{
  failure='';outcome=undefined;if(!root?.payload){failure='El dashboard no contiene datos.';return root===null?null:undefined;}
  try{const data=JSON.parse(root.payload),before=JSON.stringify(data);outcome=update(data,now);if(before===JSON.stringify(data))return root;
   return audit.attach(root,{...root,payload:JSON.stringify(data),operation,revision:(root.revision||0)+1,updatedAt:now,updatedBy:actor?.uid||'itinerary-system'},actor||{uid:'itinerary-system',name:'Programador de itinerario',role:'Sistema'},'dashboard',reason);
  }catch(e){failure=e.message;return;}
 },undefined,false);
 if(failure||!result.committed)throw Error(failure||'No se pudo confirmar el guardado. Actualiza para comprobar el resultado.');
 return {root:result.snapshot.val(),outcome};
}
async function handle(db,context,body){
 const actor={uid:context.user.uid,name:context.account?.profile?.name||context.user.displayName||context.user.email,role:context.director?'Director':context.account?.role};
 let root;
 if(body.action==='itinerary-notices'){
  root=(await db.ref('dashboard').get()).val();const data=JSON.parse(root?.payload||'{}');
  return {version:1,notices:M.visibleNotices(data,context,new Date().toISOString()),alerts:context.director?M.operational(data,new Date().toISOString()):[]};
 }
 if(body.action==='itinerary-read'){
  if(context.director){root=(await transaction(db,actor,'Activación del itinerario por bloques',data=>enable(data))).root;}
  else root=(await db.ref('dashboard').get()).val();
 }else if(body.action==='itinerary-command'){
  if(JSON.stringify(body).length>75000)throw Error('La solicitud es demasiado grande.');
  root=(await transaction(db,actor,'Itinerario: '+body.command,data=>{if(!data.itinerary?.version)throw Error('El director debe abrir primero el nuevo itinerario.');return M.apply(data,context,body,new Date().toISOString());})).root;
 }else throw Error('Operación no válida.');
 const now=new Date().toISOString(),data=JSON.parse(root?.payload||'{}');
 return {...M.view(data,context,body.date||M.E.panamaClock(now).tomorrow,now),operation:root.operation};
}
async function scheduled(db,now=new Date().toISOString()){
 const clock=M.E.panamaClock(now);
 return transaction(db,null,'Publicación automática del horario',data=>{
  if(!data.itinerary?.version)return false;
  // The scheduler may retry across midnight: never publish a different date by accident.
  return M.publish(data,clock.tomorrow,now);
 });
}
module.exports={handle,transaction,scheduled,enable};
