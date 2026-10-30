(function(root){
'use strict';
const slots=[{id:'b1',start:'06:30',end:'09:30'},{id:'b2',start:'09:30',end:'12:30'},{id:'b3',start:'12:30',end:'15:30'},{id:'b4',start:'15:30',end:'18:30'},{id:'b5',start:'18:30',end:'20:00'}];
const fleet=[
 ['HP1784','Piper Warrior · PA 28','Monomotor','#ce3437'],
 ['HP1819','Piper Cherokee · PA 28','Monomotor','#79543c'],
 ['HP1930','Grob G115','Monomotor','#21864b'],
 ['HP1815','Piper Warrior · PA 28','Monomotor','#ef923c'],
 ['HP1579','Piper Archer · PA 28','Monomotor','#66badf'],
 ['HP1907','Piper Cherokee · PA 28','Monomotor','#252f39'],
 ['HP880BL','Piper Seneca · PA 34','Multimotor','linear-gradient(110deg,#264bb7 65%,#c53543 65%)'],
 ['HP18BLM','King Air · BE 90','Multimotor','linear-gradient(110deg,#26323a 65%,#c53543 65%)'],
 ['HP1186','Navajo Panther · PA 31','Multimotor','#eef2f6'],
 ['HP1805BLM','Piper Navajo · PA 31','Multimotor','linear-gradient(110deg,#3158a0 65%,#8d9aa9 65%)'],
 ['HP11BL','Bell 206','Helicóptero','#8b2947']
];
function minutes(t){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))return NaN;return Number(t.slice(0,2))*60+Number(t.slice(3));}
function overlaps(a,b){return minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);}
function active(a){return a.slots.filter(s=>s.id!=='b5'||a.night);}
function validWindow(q){return Number.isFinite(minutes(q.start))&&Number.isFinite(minutes(q.end))&&minutes(q.start)<minutes(q.end);}
function coversWindow(windows,q){
 if(!validWindow(q))return false;
 let cursor=minutes(q.start),end=minutes(q.end);
 for(const w of [...windows].filter(validWindow).sort((a,b)=>minutes(a.start)-minutes(b.start))){
  if(minutes(w.end)<=cursor)continue;
  if(minutes(w.start)>cursor)return false;
  cursor=Math.max(cursor,minutes(w.end));if(cursor>=end)return true;
 }
 return false;
}
function availabilityStart(a,date){
 if(a.status==='operativo')return '00:00';
 return a.release?.enabled&&a.release.date===date&&Number.isFinite(minutes(a.release.from))?a.release.from:null;
}
function bookable(a,date){return availabilityStart(a,date)!==null;}
function bookingSlots(a,date){
 const from=availabilityStart(a,date);if(from===null)return [];
 return active(a).map(s=>({...s,start:minutes(s.start)<minutes(from)?from:s.start})).filter(validWindow);
}
function covers(a,q,date){return coversWindow(bookingSlots(a,date),q);}
function directorWindowAvailable(a,q,date){const from=availabilityStart(a,date);return from!==null&&validWindow(q)&&minutes(q.start)>=minutes(from);}
function flightAvailable(a,q,date){return q.createdByRole==='director'?directorWindowAvailable(a,q,date):covers(a,q,date);}
// Business scheduling rule: any flight extending past 18:30 on this date is nocturnal.
// Count assigned, available aircraft, never pending requests or repeated flights on one tail.
function isNightFlight(q){return validWindow(q)&&minutes(q.end)>minutes('18:30');}
function nightPublication(state,flights){
 const night=flights.filter(isNightFlight);
 const eligible=night.filter(q=>{
  const a=state.aircraft.find(a=>a.id===q.aircraft),p=state.pilots.find(p=>p.id===q.pilot);
  return a&&p&&p.valid&&p.categories.includes(a.category)&&flightAvailable(a,q,state.date)&&!state.cancelled.includes(q.sourceRequestId||q.id);
 });
 const aircraft=[...new Set(eligible.map(q=>q.aircraft))],minimum=2,ready=aircraft.length>=minimum;
 const eligibleIds=new Set(eligible.map(q=>q.id));
 const blockedIds=night.filter(q=>!ready||!eligibleIds.has(q.id)).map(q=>q.id);
 const reason=ready?'Vuelo nocturno pendiente de revisar su disponibilidad o piloto.':'No se publica: se requieren al menos 2 aeronaves distintas con vuelos nocturnos en esta fecha ('+aircraft.length+' de 2).';
 return {minimum,aircraft,count:aircraft.length,ready,nightCount:night.length,blockedIds,blockedCount:blockedIds.length,reason};
}
function sourceSnapshot(a,q){return active(a).filter(s=>overlaps(s,q)||s.id===q.slot).map(s=>({id:s.id,start:s.start,end:s.end}));}
function timeError(a,q){
 if(!validWindow(q))return 'La hora de finalización debe ser posterior al inicio, dentro del mismo día.';
 if(q.sourceSlots?.some(old=>!active(a).some(s=>s.id===old.id&&s.start===old.start&&s.end===old.end)))return 'Los horarios base cambiaron. Revisa tu solicitud y vuelve a guardarla.';
 if(!coversWindow(active(a),q))return 'El intervalo completo debe quedar dentro de los horarios habilitados, sin huecos. El bloque nocturno requiere habilitación del director.';
 return '';
}
function validateSlots(rows,night){
 const enabled=rows.filter(s=>s.id!=='b5'||night);
 if(rows.some(s=>!Number.isFinite(minutes(s.start))||!Number.isFinite(minutes(s.end))||minutes(s.start)>=minutes(s.end)))return 'Cada bloque necesita una hora inicial anterior a la final, dentro del mismo día.';
 for(let i=0;i<enabled.length;i++)for(let j=i+1;j<enabled.length;j++)if(overlaps(enabled[i],enabled[j]))return 'Los bloques '+enabled[i].id.slice(1)+' y '+enabled[j].id.slice(1)+' se superponen. Corrige las horas.';
 return '';
}

const flightTypes={
 privado:{label:'Privado',hint:'Aeronaves asignadas por el director. Solo los monomotores se redistribuyen.'},
 solo:{label:'Vuelo solo',hint:'Por defecto: HP1819, HP1907 y HP1784 como última opción.'},
 xc:{label:'XC',hint:'Aeronaves asignadas por el director para vuelos XC.'},
 maniobras:{label:'Maniobras comercial',hint:'Aeronaves asignadas por el director para maniobras comercial.'},
 ifr:{label:'IFR',hint:'Por defecto: HP1579 o HP1815, según prioridad del director.'},
 multi:{label:'Multi',hint:'Solo multimotores. Los pilotos pueden solicitar HP880BL si está seleccionado por el director.'},
 grob:{label:'Grob',hint:'HP1930 por defecto; aeronaves y orden configurables por el director.'},
 charter:{label:'Chárter',hint:'Solo director, en multimotor o helicóptero. Agenda fija, sin reasignación automática.'},
 socio:{label:'Socio',hint:'Indica el nombre del socio. Se respetan las aeronaves y el orden configurados por el director.'}
};
const typeOf=q=>!q.flightType||q.flightType==='general'?'privado':q.flightType;
const soloOrder=['HP1819','HP1907','HP1784'];
function defaultTypeRules(){
 const mono=fleet.filter(a=>a[2]==='Monomotor').map(a=>a[0]);
 return {privado:[...mono],solo:[...soloOrder],xc:[...mono],maniobras:[...mono],ifr:['HP1579','HP1815'],multi:['HP880BL'],grob:['HP1930'],charter:fleet.filter(a=>a[2]!=='Monomotor').map(a=>a[0]),socio:fleet.map(a=>a[0])};
}
function typeConfigAircraft(state,type){
 if(!flightTypes[type])return [];
 return state.aircraft.filter(a=>type==='multi'?a.category==='Multimotor':type==='charter'?a.category!=='Monomotor':true);
}
function allowedForType(state,type){
 const choices=typeConfigAircraft(state,type).map(a=>a.id);
 return [...new Set(state.typeRules?.[type]||defaultTypeRules()[type]||[])].filter(id=>choices.includes(id));
}
function pilotCanRequest(a){return !!a&&(a.category==='Monomotor'||a.id==='HP880BL');}
function canSchedule(role,a){return !!a&&(role==='director'||role==='admin'&&a.category!=='Monomotor');}
function canChooseFlightType(state,type,role,a){
 if(!flightTypes[type])return false;
 if(type==='charter')return role==='director'&&!!a&&a.category!=='Monomotor'&&allowedForType(state,type).includes(a.id);
 const allowed=allowedForType(state,type);
 if(role!=='pilot')return !!a&&canSchedule(role,a)&&allowed.includes(a.id);
 if(!pilotCanRequest(a))return false;
 if(a.category!=='Monomotor')return allowed.includes(a.id);
 return type==='multi'?allowed.includes('HP880BL'):state.aircraft.some(x=>x.category==='Monomotor'&&allowed.includes(x.id));
}
function aircraftOrder(state,type){
 const allowed=allowedForType(state,type);
 return allowed.map(id=>state.aircraft.find(a=>a.id===id)).filter(a=>a?.category==='Monomotor');
}
function compatible(state,q,a){
 const p=state.pilots.find(x=>x.id===q.pilot);
 return !!p&&p.valid&&p.categories.includes(a.category)&&allowedForType(state,typeOf(q)).includes(a.id);
}
function normalizeRequest(state,q){
 const type=typeOf(q),source=state.aircraft.find(a=>a.id===q.aircraft),allowed=allowedForType(state,type);
 // A selected multimotor/helicopter is never moved by type configuration or priorities.
 const target=source?.category==='Monomotor'?(type==='multi'&&allowed.includes('HP880BL')?'HP880BL':type==='grob'&&allowed.length===1&&state.aircraft.some(a=>a.id===allowed[0]&&a.category==='Monomotor')?allowed[0]:null):null;
 if(!target||q.aircraft===target)return {...q,flightType:type};
 const a=state.aircraft.find(x=>x.id===target);if(!a)return {...q,flightType:type};
 const slot=active(a).find(s=>overlaps(s,q))?.id||q.slot,next={...q,flightType:type,preferredAircraft:q.preferredAircraft||q.aircraft,aircraft:target,slot};
 next.sourceSlots=sourceSnapshot(a,next);return next;
}
function typeHint(state,type){return (flightTypes[type]?.label||'Tipo no válido')+': '+(allowedForType(state,type).join(' → ')||'sin aeronaves asignadas')+(type==='charter'?' · solo director · agenda fija':type==='multi'?' · orden de referencia manual · pilotos: solo HP880BL':' · prioridad por tipo; solo se redistribuyen monomotores');}
function flightDataError(state,q){
 if(q.studentId&&!state.students?.some(x=>x.id===q.studentId))return 'Selecciona un estudiante de la lista o deja la casilla en blanco.';
 if(typeOf(q)==='socio'&&(typeof q.socioName!=='string'||!q.socioName.trim()||q.socioName.trim().length>120))return 'Escribe el nombre del socio (máximo 120 caracteres).';
 return '';
}
function panamaClock(now){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
 const d=Object.fromEntries(parts.map(p=>[p.type,p.value])),date=d.year+'-'+d.month+'-'+d.day;
 const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 return {date,time:d.hour+':'+d.minute,tomorrow:next.toISOString().slice(0,10)};
}
function reservationGate(state){
 const clock=panamaClock(state.now);
 if(state.date!==clock.tomorrow)return 'Los pilotos solo pueden reservar para mañana: '+clock.tomorrow.split('-').reverse().join('/')+'.';
 if(state.published)return 'El horario ya está publicado. Los cambios los realiza un director.';
 if(minutes(clock.time)<721||minutes(clock.time)>=1200)return 'Reservas cerradas. Se reciben de 12:01 p. m. a 8:00 p. m. del día anterior, hora de Panamá.';
 return '';
}
// Planning alerts, never an operational release or an outgoing notification.
function operationalAlerts(scheduleDays,now){
 const clock=panamaClock(now),alerts=[];
 for(const day of scheduleDays){
  if(!day||![clock.date,clock.tomorrow].includes(day.date))continue;
  for(const flight of day.confirmed||[]){
   const a=day.aircraft.find(a=>a.id===flight.aircraft);
   if(a?.status==='operativo')continue;
   alerts.push({id:day.date+':'+flight.id,date:day.date,when:day.date===clock.date?'today':'tomorrow',flightId:flight.id,aircraft:flight.aircraft,status:a?.status||'sin registrar',pilot:flight.pilot,start:flight.start,end:flight.end});
  }
 }
 return alerts.sort((a,b)=>a.date.localeCompare(b.date)||minutes(a.start)-minutes(b.start)||a.aircraft.localeCompare(b.aircraft));
}
function directorFlightError(state,q,excludeId,role='director'){
 const a=state.aircraft.find(x=>x.id===q.aircraft),p=state.pilots.find(x=>x.id===q.pilot);
 if(!canSchedule(role,a))return 'Este cargo no puede agendar esta aeronave.';
 const metadataError=flightDataError(state,q);if(metadataError)return metadataError;
 if(role!=='director'&&(!a||!bookable(a,state.date)))return 'La aeronave no está operativa ni tiene disponibilidad prevista para esta fecha.';
 if(!p||!p.valid||!p.categories.includes(a.category))return 'El piloto no está habilitado para esta aeronave.';
 if(!canChooseFlightType(state,typeOf(q),role,a))return typeOf(q)==='charter'?'Chárter solo está disponible para director en multimotor o helicóptero.':'La aeronave no corresponde al tipo de vuelo seleccionado.';
 if(!validWindow(q))return 'La hora final debe ser posterior a la inicial, dentro del mismo día.';
 if(role!=='director'&&!covers(a,q,state.date))return 'El intervalo completo debe estar habilitado. Revisa horarios base, previsión y bloque nocturno.';
 if(state.confirmed.some(x=>x.id!==excludeId&&(x.aircraft===q.aircraft||x.pilot===q.pilot)&&overlaps(x,q)))return 'El horario se cruza con otro vuelo de la aeronave o del piloto.';
 return '';
}
function requestError(state,q){
 q=normalizeRequest(state,q);
 const gate=reservationGate(state);if(gate)return gate;
 const a=state.aircraft.find(x=>x.id===q.aircraft),p=state.pilots.find(x=>x.id===q.pilot),s=a&&active(a).find(x=>x.id===q.slot),type=typeOf(q);
 if(!pilotCanRequest(a))return 'Los pilotos solo pueden solicitar monomotores y HP880BL. Las demás aeronaves las agenda un director o administrativo.';
 if(!a||!bookable(a,state.date))return 'La aeronave debe estar operativa o habilitada por un director para esta fecha.';
 if(!flightTypes[type])return 'Selecciona un tipo de vuelo válido.';
 const metadataError=flightDataError(state,q);if(metadataError)return metadataError;
 if(type==='charter')return 'Chárter solo está disponible para director en multimotor o helicóptero.';
 if(!p||!p.valid||!p.categories.includes(a.category))return 'El piloto no está habilitado para esta solicitud.';
 if(!canChooseFlightType(state,type,'pilot',a))return 'El director no ha habilitado aeronaves accesibles para este tipo de vuelo.';
 if(!allowedForType(state,type).length)return 'El director debe asignar una aeronave a este tipo de vuelo.';
 if(!s)return 'Este bloque no está habilitado.';
 const timing=timeError(a,q);if(timing)return timing;
 if(!covers(a,q,state.date))return 'El horario comienza antes de la habilitación del director o queda fuera de los horarios disponibles.';
 if(state.confirmed.some(x=>x.aircraft===a.id&&overlaps(x,q)))return 'El horario solicitado se cruza con un vuelo confirmado de esta aeronave.';
 if(state.confirmed.some(x=>x.pilot===q.pilot&&overlaps(x,q)))return 'El piloto ya tiene un vuelo confirmado durante el horario solicitado.';
 const others=state.requests.filter(x=>x.id!==q.id&&x.status!=='approved'&&!state.cancelled.includes(x.id));
 if(others.some(x=>x.aircraft==='HP880BL'&&x.pilot===q.pilot&&overlaps(x,q)))return 'El piloto ya tiene otra solicitud en HP880BL a esa hora.';
 if(q.aircraft==='HP880BL'&&others.some(x=>x.pilot===q.pilot&&overlaps(x,q)))return 'El piloto ya tiene otra solicitud en ese horario. Modifícala antes de reservar HP880BL.';

 return '';
}
function competingRequests(state,request){
 return state.requests.filter(q=>q.id!==request.id&&q.status!=='approved'&&q.status!=='cancelled'&&!state.cancelled.includes(q.id)&&!state.confirmed.some(f=>f.sourceRequestId===q.id)&&q.aircraft===request.aircraft&&q.pilot!==request.pilot&&overlaps(q,request));
}
function prepareApproval(state,requestId,role='director'){
 if(role!=='director')return {error:'Solo el director puede aprobar y fijar solicitudes.'};
 if(state.published)return {error:'El horario ya está publicado. Usa la edición del director.'};
 const request=state.requests.find(q=>q.id===requestId);
 if(!request||state.cancelled.includes(requestId))return {error:'La solicitud ya no está disponible.'};
 if(request.status==='approved'||state.confirmed.some(q=>q.sourceRequestId===requestId))return {error:'Esta solicitud ya fue aprobada.'};
 const error=directorFlightError(state,request);if(error)return {error};
 const aircraft=state.aircraft.find(a=>a.id===request.aircraft);
 return {error:'',flight:{...request,id:'approved-'+request.id,sourceRequestId:request.id,fixed:true,createdByRole:'director',directorApproved:true,approvedAt:state.now,conditional:aircraft.status!=='operativo',reason:'Aprobado por director · fuera del orden de prioridades'}};
}
function publishedChange(before,after,isPublished){
 if(!isPublished||!before&&!after)return null;
 const fields=['date','aircraft','pilot','studentId','start','end','flightType','socioName','note'];
 const snapshot=q=>q?Object.fromEntries(fields.map(k=>[k,k==='flightType'?typeOf(q):(q[k]||'')])):null;
 const from=snapshot(before),to=snapshot(after);
 if(JSON.stringify(from)===JSON.stringify(to))return null;
 const recipients=new Map();
 for(const flight of [from,to].filter(Boolean)){
  if(flight.pilot)recipients.set('pilot:'+flight.pilot,{kind:'pilot',id:flight.pilot});
  if(flight.studentId)recipients.set('student:'+flight.studentId,{kind:'student',id:flight.studentId});
 }
 recipients.set('group:mechanics',{kind:'group',id:'mechanics'});
 return {kind:'change',action:!from?'created':!to?'cancelled':'updated',before:from,after:to,recipients:[...recipients.values()]};
}
function publicationNotice(state){
 const held=new Set(nightPublication(state,state.confirmed).blockedIds);
 return {kind:'publication',date:state.date,flightCount:state.confirmed.filter(q=>!held.has(q.id)).length,recipients:[{kind:'group',id:'all'}]};
}
function canCancelRelocated(state,flight,pilot,now){
 const clock=panamaClock(now);
 return !!flight?.relocation&&flight.pilot===pilot&&state.published&&(state.date>clock.date||state.date===clock.date&&minutes(flight.start)>minutes(clock.time));
}
function reallocatePublished(state,aircraftId,previousStatus,now){
 const flights=structuredClone(state.confirmed),changes=[],a=state.aircraft.find(a=>a.id===aircraftId),clock=panamaClock(now);
 if(!state.published||previousStatus!=='operativo'||!['mantenimiento','grounded'].includes(a?.status)||state.date<clock.date)return {flights,changes};
 const affected=flights.filter(q=>q.aircraft===aircraftId&&(state.date>clock.date||minutes(q.end)>minutes(clock.time))).sort((x,y)=>allowedForType(state,typeOf(x)).length-allowedForType(state,typeOf(y)).length||minutes(x.start)-minutes(y.start)||x.id.localeCompare(y.id));
 for(const q of affected){
  const before=structuredClone(q),inProgress=state.date===clock.date&&minutes(q.start)<=minutes(clock.time);
  const candidates=a.category==='Monomotor'&&!inProgress?aircraftOrder(state,typeOf(q)).filter(other=>other.id!==a.id&&other.status==='operativo'&&compatible(state,q,other)&&flightAvailable(other,q,state.date)&&!flights.some(x=>x.id!==q.id&&(x.aircraft===other.id||x.pilot===q.pilot)&&overlaps(x,q))):[];
  if(candidates.length){
   const target=candidates[0];q.aircraft=target.id;q.conditional=false;
   q.relocation={from:before.aircraft,to:target.id,at:now,reason:'Cambio de estado a '+a.status};
   q.relocationHistory=[...(q.relocationHistory||[]),q.relocation];delete q.relocationPending;
   q.reason='Reubicado por cambio de estado · '+before.aircraft+' → '+q.aircraft;
   changes.push({kind:'relocated',before,after:structuredClone(q),reason:q.reason});
  }else{
   q.conditional=true;q.relocationPending=true;
   const reason=inProgress?'Vuelo ya iniciado: requiere revisión del director.':a.category!=='Monomotor'?'Agenda multimotor o helicóptero: reubicación manual por director.':'Sin aeronave operativa compatible y libre en el mismo horario.';
   changes.push({kind:'review',before,after:structuredClone(q),reason});
  }
 }
 return {flights,changes};
}
function simulate(state){
 const assignments=state.confirmed.map(x=>({...x,fixed:true})),results=[],used=new Set(),requests=state.requests.filter(q=>q.status!=='approved'&&!state.cancelled.includes(q.id)&&!state.confirmed.some(f=>f.sourceRequestId===q.id));
 const valid=requests.map(q=>normalizeRequest(state,q)).filter(q=>{
  const a=state.aircraft.find(x=>x.id===q.aircraft),p=state.pilots.find(x=>x.id===q.pilot),s=a&&active(a).find(x=>x.id===q.slot),type=typeOf(q);
  let reason='';
  if(!flightTypes[type])reason='Tipo de vuelo inválido: requiere revisión';
  else if(type==='charter')reason='Chárter requiere agenda manual de un director';
  else if(flightDataError(state,q))reason=flightDataError(state,q);
  else if(!pilotCanRequest(a))reason='Aeronave reservada para agenda de director o administrativo';
  else if(!p||!p.valid)reason='Vigencia del piloto pendiente';
  else if(!a||!p.categories.includes(a.category)||!canChooseFlightType(state,type,'pilot',a))reason='Equipo fuera de la habilitación o del tipo de vuelo solicitado';
  else if(!s)reason='Bloque cerrado: requiere revisión';
  else reason=timeError(a,q);
  if(reason){results.push({...q,status:'review',reason});return false;}return true;
 });
 // HP880BL is a fixed reservation, protected before mono allocation.
 // A conflicting imported request is flagged as-is; never shifted or swapped.
 const protectedRequests=valid.filter(q=>q.aircraft==='HP880BL');
 const protectedConflicts=new Set();
 for(let i=0;i<protectedRequests.length;i++)for(let j=i+1;j<protectedRequests.length;j++){
  const x=protectedRequests[i],y=protectedRequests[j];if(overlaps(x,y)){protectedConflicts.add(x.id);protectedConflicts.add(y.id);}
 }
 for(const q of protectedRequests){
  const a=state.aircraft.find(a=>a.id===q.aircraft);used.add(q.id);
  let reason='';
  if(!bookable(a,state.date)||!covers(a,q,state.date))reason='HP880BL no está disponible para todo el intervalo. Revisión manual; no se reasigna.';
  else if(protectedConflicts.has(q.id)||assignments.some(x=>(x.aircraft===q.aircraft||x.pilot===q.pilot)&&overlaps(x,q)))reason='Cruce en una reserva fija de HP880BL. Revisión manual; no se alteran aeronave, piloto ni horas.';
  if(reason){results.push({...q,status:'review',reason});continue;}
  reason='HP880BL · reserva fija, fuera de prioridades · se publica como fue solicitada'+(a.status!=='operativo'?' · operativa prevista desde '+a.release.from:'');
  assignments.push({...q,protected:true,requestedAircraft:q.aircraft,fixed:false,conditional:a.status!=='operativo',reason});
  results.push({...q,assignedAircraft:q.aircraft,status:'assigned',protected:true,conditional:a.status!=='operativo',reason});
 }
 // Only mono requests and mono aircraft participate in priority allocation.
 for(const type of Object.keys(flightTypes).filter(t=>!['multi','charter'].includes(t)).sort((a,b)=>aircraftOrder(state,a).length-aircraftOrder(state,b).length)){
  for(const a of aircraftOrder(state,type)){
   if(!bookable(a,state.date))continue;
   const ranking=p=>{const n=a.pilots.indexOf(p);return n<0?Number.MAX_SAFE_INTEGER:n;};
   // Re-evaluate availability after every assignment, using the entire requested interval.
   // Short adjacent requests can share one base block; long requests occupy every minute.
   while(true){
    const candidates=valid.filter(q=>
     state.aircraft.find(x=>x.id===q.aircraft)?.category==='Monomotor'&&typeOf(q)===type&&!used.has(q.id)&&covers(a,q,state.date)&&compatible(state,q,a)&&
     !assignments.some(x=>(x.pilot===q.pilot||x.aircraft===a.id)&&overlaps(x,q))&&
     (!state.maxBlocks||assignments.filter(x=>x.pilot===q.pilot).length<state.maxBlocks)
    ).sort((x,y)=>ranking(x.pilot)-ranking(y.pilot)||x.created-y.created||x.id.localeCompare(y.id));
    if(!candidates.length)break;
    const q=candidates[0],touched=active(a).filter(s=>overlaps(s,q));
    const order=allowedForType(state,type);
    const rule=flightTypes[type].label+' · prioridad por tipo #'+(order.indexOf(a.id)+1)+(a.id===order.at(-1)?' (última opción)':'');
    const reason=rule+' · prioridad de piloto '+(ranking(q.pilot)===Number.MAX_SAFE_INTEGER?'fuera de lista':'#'+(ranking(q.pilot)+1))+
     (q.aircraft!==a.id?' · redistribuido desde '+q.aircraft:' · mantiene la matrícula solicitada')+' · horario solicitado conservado'+(a.status!=='operativo'?' · operativa prevista desde '+a.release.from:'');
    used.add(q.id);assignments.push({...q,aircraft:a.id,slot:touched[0].id,coveredSlots:touched.map(s=>s.id),requestedAircraft:q.aircraft,fixed:false,conditional:a.status!=='operativo',reason});
    results.push({...q,assignedAircraft:a.id,status:'assigned',conditional:a.status!=='operativo',reason});
   }
  }
 }
 for(const q of valid.filter(x=>!used.has(x.id))){
  const type=typeOf(q),options=aircraftOrder(state,type).filter(a=>compatible(state,q,a)&&bookable(a,state.date));
  let reason;
  if(assignments.some(x=>x.pilot===q.pilot&&overlaps(x,q)))reason='El piloto ya tiene otro vuelo en ese horario';
  else if(state.maxBlocks&&assignments.filter(x=>x.pilot===q.pilot).length>=state.maxBlocks)reason='Límite diario propuesto alcanzado';
  else if(!options.length)reason='No hay aeronaves operativas o previstas para '+flightTypes[type].label+' en su lista: '+allowedForType(state,type).join(', ');
  else if(!options.some(a=>covers(a,q,state.date)))reason='Ninguna aeronave permitida cubre todo el horario solicitado';
  else reason='Sin cupo compatible para '+flightTypes[type].label+' en ese horario: '+allowedForType(state,type).join(', ');
  results.push({...q,status:'waiting',reason});
 }
 return {assignments,results:results.sort((a,b)=>a.created-b.created)};
}
const api={slots,fleet,minutes,overlaps,active,validWindow,coversWindow,availabilityStart,bookable,bookingSlots,covers,directorWindowAvailable,flightAvailable,isNightFlight,nightPublication,sourceSnapshot,timeError,validateSlots,requestError,reservationGate,panamaClock,operationalAlerts,competingRequests,prepareApproval,publishedChange,publicationNotice,canCancelRelocated,reallocatePublished,directorFlightError,pilotCanRequest,canSchedule,allowedForType,defaultTypeRules,normalizeRequest,typeHint,typeConfigAircraft,canChooseFlightType,flightDataError,simulate,flightTypes,typeOf,aircraftOrder,compatible};
if(typeof module==='object'&&module.exports)module.exports=api;else root.HPItinerary=api;
})(typeof globalThis==='object'?globalThis:this);
