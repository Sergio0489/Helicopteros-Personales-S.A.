'use strict';
// Isolated meeting mode. It borrows the production itinerary rules but owns its
// flights, configuration and notifications; it never writes data.itinerarios.
const crypto=require('node:crypto');
const M=require('./itinerary-model');
const {normalize}=require('./boxes');
const audit=require('./audit');
const clone=v=>structuredClone(v);
const empty=()=>({version:1,revision:0,aircraftStatus:{},itinerary:{version:1,config:{},days:{},notices:[]},flights:[]});
function practiceData(data,practice,account){
 const copy=clone(data),store=copy.school ||= {};
 store.accessConfiguration ||= {};store.accessConfiguration.roles ||= {};
 const roles=['Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
 for(const role of roles){
  const p=normalize(store.accessConfiguration.roles[role]||{});
  p.itinerario={actions:{view:true,edit:role==='Piloto'},areas:{Calendario:true,'Programación de vuelos':true},boxes:{planner:{view:true,edit:false},calendar:{view:true,edit:false},flights:{view:true,edit:false},requests:{view:true,edit:role==='Piloto'},create:{view:true,edit:false}}};
  store.accessConfiguration.roles[role]=p;
 }
 copy.itinerary=clone(practice.itinerary);copy.itinerarios=clone(practice.flights);
 for(const [id,status] of Object.entries(practice.aircraftStatus||{})){
  const reg=Object.keys(copy.fleet||{}).find(k=>M.key(k)===id);if(reg)copy.fleet[reg].status=status;
 }
 return copy;
}
async function handle(db,ctx,body){
 if(!ctx.user?.emailVerified||ctx.user.disabled||ctx.account?.mergedInto)throw Error('Verifica tu correo e inicia sesión con una cuenta activa.');
 if(ctx.account?.identityReviewPending||ctx.account?.syncStatus==='duplicate-identity')throw Error('Tu identidad está pendiente de revisión por el Director.');
 ctx={...ctx,account:{...(ctx.account||{}),assignedAt:ctx.account?.assignedAt||'practice',role:ctx.account?.role||'Estudiante'}};
 const director=!!ctx.director,actor={uid:ctx.user.uid,name:ctx.account?.profile?.name||ctx.user.displayName||ctx.user.email,role:director?'Director':ctx.account?.role};
 const ref=db.ref('dashboard');let failure='',out,mailPayload=null,operation=crypto.randomUUID();
 if(body.action==='itinerary-practice-read'){
  const root=(await ref.get()).val();if(!root?.payload)throw Error('El dashboard no contiene datos.');
  const data=JSON.parse(root.payload),stored=data.itineraryPractice||empty(),expired=stored.expiresAt&&Date.parse(stored.expiresAt)<Date.now(),p=expired?empty():stored,sandbox=practiceData(data,p,ctx.account);
  const now=new Date().toISOString(),date=body.date||M.E.panamaClock(now).tomorrow;
  const view=M.view(sandbox,{...ctx,director},date,now),full=M.stateFor(sandbox,date,now);
  const operational=new Set(full.aircraft.filter(a=>a.status==='operativo').map(a=>a.id));
  view.state.aircraft=full.aircraft.map(a=>({...a,pilots:[]}));view.state.confirmed=full.confirmed.filter(q=>operational.has(q.aircraft));
  const pilots=new Set(view.state.confirmed.map(q=>q.pilot)),students=new Set(view.state.confirmed.map(q=>q.studentId).filter(Boolean));
  view.state.pilots=full.pilots.filter(p=>pilots.has(p.id));view.state.students=full.students.filter(p=>students.has(p.id));view.practice=true;
  view.rights={role:director?'director':ctx.account?.role==='Piloto'?'pilot':'reader',view:true,request:ctx.account?.role==='Piloto'&&view.rights.request,pilot:view.rights.pilot||null,create:false,edit:false,settings:director,boxes:{planner:true,flights:true,requests:true}};
  return view;
 }
 if(body.action==='itinerary-practice-calendar'){
  const root=(await ref.get()).val();if(!root?.payload)throw Error('El dashboard no contiene datos.');
  const stored=JSON.parse(root.payload).itineraryPractice||empty(),p=stored.expiresAt&&Date.parse(stored.expiresAt)<Date.now()?empty():stored,year=String(body.year||'');
  if(!/^\d{4}$/.test(year))throw Error('Selecciona un año válido.');
  return {version:1,year,days:Object.keys(p.itinerary.days||{}).filter(d=>d.startsWith(year+'-')).sort().map(date=>({date,count:(p.flights||[]).filter(f=>f.fecha===date).length})).filter(x=>x.count)};
 }
 if(body.action==='itinerary-practice-notices'){
  const root=(await ref.get()).val();if(!root?.payload)throw Error('El dashboard no contiene datos.');
  const stored=JSON.parse(root.payload).itineraryPractice||empty(),p=stored.expiresAt&&Date.parse(stored.expiresAt)<Date.now()?empty():stored;return {version:1,notices:(p.itinerary.notices||[]).slice(-100).reverse(),alerts:[]};
 }
 const saved=await ref.transaction(root=>{
  failure='';out=null;if(!root?.payload){failure='El dashboard no contiene datos.';return;}
  try{
   const data=JSON.parse(root.payload),stored=data.itineraryPractice||empty(),p=stored.expiresAt&&Date.parse(stored.expiresAt)<Date.now()?empty():stored,sandbox=practiceData(data,p,ctx.account);
   if(body.action==='itinerary-practice-status'){
    if(!director)throw Error('Solo el Director puede cambiar la disponibilidad de aeronaves.');
    const id=M.key(body.aircraft),status=body.status;
    if(!M.E.fleet.some(row=>row[0]===id)||!['operativo','mantenimiento','grounded'].includes(status))throw Error('Aeronave o estado no válido.');
    p.aircraftStatus||={};p.aircraftStatus[id]=status;p.revision++;p.expiresAt||=new Date(Date.now()+48*60*60*1000).toISOString();data.itineraryPractice=p;
   }else if(body.action==='itinerary-practice-command'){
    if(JSON.stringify(body).length>75000)throw Error('La solicitud es demasiado grande.');
    if(body.command==='publish'&&!director)throw Error('Solo el Director puede publicar el horario de práctica.');
    if(body.command==='publish'){
     const day=sandbox.itinerary.days?.[body.date];
     if(day?.published)throw Error('Este horario de práctica ya fue publicado.');
     M.apply(sandbox,{...ctx,director:true},{...body,command:'publish'},new Date().toISOString());
    }else M.apply(sandbox,{...ctx,director},{...body},new Date().toISOString());
    p.itinerary=sandbox.itinerary;p.flights=sandbox.itinerarios;p.revision++;p.expiresAt||=new Date(Date.now()+48*60*60*1000).toISOString();
    data.itineraryPractice=p;
   }else throw Error('Operación de práctica no válida.');
    if(body.action==='itinerary-practice-command'&&body.command==='publish'){
     const id='practice-'+body.date+'-'+body.actionId;
     const flights=(p.flights||[]).filter(f=>f.fecha===body.date).map(f=>({aircraft:f.aeronave,pilot:f.piloto,student:f.estudiante||'',start:f.horaInicio||'',end:f.horaFin||'',type:f.tipo||'',route:f.ruta||'',notes:f.observaciones||''}));
     mailPayload={id,date:body.date,publishedAt:new Date().toISOString(),pilotRecipients:[],flights,practice:true};
    }
    const next=audit.attach(root,{...root,payload:JSON.stringify(data),operation,revision:(root.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:ctx.user.uid},actor,'dashboard','Itinerario de práctica: '+(body.command||'estado de aeronave'));
    if(mailPayload){next.itineraryEmailOutbox ||= {};next.itineraryEmailOutbox[mailPayload.id]=mailPayload;}
    out={saved:true};return next;
  }catch(e){failure=e.message;return;}
 },undefined,false);
 if(failure||!saved.committed)throw Error(failure||'No se pudo confirmar el guardado de práctica.');
 if(out?.saved)return handle(db,ctx,{action:'itinerary-practice-read',date:body.date});
 return out;
}
module.exports={handle,empty,practiceData};
