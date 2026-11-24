(function(root){
'use strict';
const PRIORITY_IDLE_DAYS=3;
const MIN_ASSIGNMENT_MINUTES=90;
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
function validWindow(q){return !!q&&typeof q==='object'&&Number.isFinite(minutes(q.start))&&Number.isFinite(minutes(q.end))&&minutes(q.start)<minutes(q.end);}
function operatingHoursWarning(q){if(!validWindow(q))return '';return minutes(q.start)<minutes('06:30')||minutes(q.end)>minutes('18:30')?'Alerta: este horario está fuera del horario habitual de 6:30 a. m. a 6:30 p. m.; confirma la habilitación nocturna. El límite máximo es 8:00 p. m.':'';}
function operatingHoursError(q){if(!validWindow(q))return '';return minutes(q.start)<minutes('06:30')||minutes(q.end)>minutes('20:00')?'No se puede asignar antes de las 6:30 a. m. ni después de las 8:00 p. m. (no se permiten vuelos hasta las 11:59 p. m.).':'';}
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
function availabilityBounds(a,date){
 if(a.release?.enabled&&a.release.date===date){
  const start=minutes(a.release.from),configuredEnd=minutes(a.release.until),legacyEnd=active(a).reduce((end,s)=>Math.max(end,minutes(s.end)),0),end=Number.isFinite(configuredEnd)?configuredEnd:legacyEnd;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return null;
  return {start,end};
 }
 return a.status==='operativo'?{start:0,end:1440}:null;
}
function availabilityStart(a,date){const bounds=availabilityBounds(a,date);return bounds?timeLabel(bounds.start):null;}
function availabilityEnd(a,date){const bounds=availabilityBounds(a,date);return bounds?timeLabel(bounds.end):null;}
function bookable(a,date){return availabilityBounds(a,date)!==null;}
function bookingSlots(a,date){
 const bounds=availabilityBounds(a,date);if(!bounds)return [];
 const window=a.category==='Monomotor'&&validWindow(a.scheduleWindow)?a.scheduleWindow:null;
 return active(a).map(s=>{
  const start=Math.max(minutes(s.start),bounds.start,window?minutes(window.start):0),end=Math.min(minutes(s.end),bounds.end,window?minutes(window.end):1440);
  return {...s,start:timeLabel(start),end:timeLabel(end)};
 }).filter(validWindow);
}
function requestSelectable(a){return !!a&&['operativo','mantenimiento'].includes(a.status);}
function requestSlots(a,date){
 if(!requestSelectable(a))return [];
 // Requests may be submitted while an aircraft is in maintenance. A forecast
 // window still limits the request; otherwise use its normal enabled blocks.
 return bookingSlots(a.status==='mantenimiento'?{...a,status:'operativo'}:a,date);
}
function requestCovers(a,q,date){return coversWindow(requestSlots(a,date),q);}
function assignmentEligible(a,state){return !!a&&a.status==='operativo'&&(!Array.isArray(state?.assignmentAircraftIds)||state.assignmentAircraftIds.includes(a.id));}
function covers(a,q,date){return coversWindow(bookingSlots(a,date),q);}
function scheduleWindowError(a,q){
 const window=a?.category==='Monomotor'?a.scheduleWindow:null;if(!window)return '';
 if(!validWindow(window))return 'El horario permitido para esta fecha no es válido. Actualiza la página o contacta a Dirección.';
 if(!validWindow(q))return '';
 return minutes(q.start)<minutes(window.start)||minutes(q.end)>minutes(window.end)?'Los vuelos de esta fecha deben quedar entre '+timeLabel(minutes(window.start))+' y '+timeLabel(minutes(window.end))+'.':'';
}
function directorWindowAvailable(a,q,date){const bounds=availabilityBounds(a,date);return bounds!==null&&validWindow(q)&&minutes(q.start)>=bounds.start&&minutes(q.end)<=bounds.end&&!scheduleWindowError(a,q);}
function flightAvailable(a,q,date){return q.createdByRole==='director'?directorWindowAvailable(a,q,date):covers(a,q,date);}
// Business scheduling rule: any flight extending past 18:30 on this date is nocturnal.
// Count assigned, available aircraft, never pending requests or repeated flights on one tail.
function isNightFlight(q){return validWindow(q)&&minutes(q.end)>minutes('18:30');}
function nightPublication(state,flights){
 const night=flights.filter(q=>!q.operationalHold&&isNightFlight(q));
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
 examen:{label:'Examen de vuelo',hint:'Prioridad máxima entre solicitudes pendientes. Requiere número de delegación.'},
 solo:{label:'Vuelo solo',hint:'Por defecto: HP1819, HP1907 y HP1784 como última opción.'},
 xc:{label:'XC',hint:'Aeronaves asignadas por el director para vuelos XC.'},
 ley89:{label:'Ley 89',hint:'Aeronaves asignadas por el director para vuelos Ley 89.'},
 conversion:{label:'Conversión',hint:'Aeronaves asignadas por el director para vuelos de conversión.'},
 maniobras:{label:'Maniobras comercial',hint:'Aeronaves asignadas por el director para maniobras comercial.'},
 ifr:{label:'IFR',hint:'Por defecto: HP1579 o HP1815, según prioridad del director.'},
 multi:{label:'Multi Estudiante',hint:'Vuelo de estudiante en multimotor. El director configura aeronaves y prioridad.'},
 multiLey89:{label:'Multi Ley 89',hint:'Vuelo Ley 89 en multimotor. El director configura aeronaves y prioridad.'},
 multiConversion:{label:'Multi Conversión',hint:'Vuelo de conversión en multimotor. El director configura aeronaves y prioridad.'},
 atp:{label:'ATP',hint:'Vuelo ATP en multimotor. El director configura aeronaves y prioridad.'},
 grob:{label:'Grob',hint:'HP1930 por defecto; aeronaves y orden configurables por el director.'},
 charter:{label:'Chárter',hint:'Solo director, en multimotor o helicóptero. Agenda fija, sin reasignación automática.'},
 socio:{label:'Socio',hint:'Indica el nombre del socio. Se respetan las aeronaves y el orden configurados por el director.'}
};
const typeOf=q=>!q.flightType||q.flightType==='general'?'privado':q.flightType;
const multiTypes=['multi','multiLey89','multiConversion','atp'];
const soloOrder=['HP1819','HP1907','HP1784'];
function defaultTypeRules(){
 const mono=fleet.filter(a=>a[2]==='Monomotor').map(a=>a[0]);
 return {privado:[...mono],examen:[...mono,'HP880BL'],solo:[...soloOrder],xc:[...mono],ley89:[...mono,'HP880BL'],conversion:[...mono,'HP880BL'],maniobras:[...mono],ifr:['HP1579','HP1815'],multi:['HP880BL'],multiLey89:['HP880BL'],multiConversion:['HP880BL'],atp:['HP880BL'],grob:['HP1930'],charter:fleet.filter(a=>a[2]!=='Monomotor').map(a=>a[0]),socio:fleet.map(a=>a[0])};
}
function typeConfigAircraft(state,type){
 if(!flightTypes[type])return [];
 return state.aircraft.filter(a=>multiTypes.includes(type)?a.category==='Multimotor':type==='charter'?a.category!=='Monomotor':true);
}
function allowedForType(state,type){
 const choices=typeConfigAircraft(state,type).map(a=>a.id);
 return [...new Set(state.typeRules?.[type]||defaultTypeRules()[type]||[])].filter(id=>choices.includes(id));
}
function pilotCanRequest(a){return !!a;}
function canSchedule(role,a){return !!a&&(role==='director'||role==='admin'&&a.category!=='Monomotor');}
function canChooseFlightType(state,type,role,a){
 if(!flightTypes[type])return false;
 if(role==='pilot'&&type==='charter')return a?.id==='HP880BL'&&allowedForType(state,type).includes(a.id);
 if(type==='charter')return role==='director'&&!!a&&a.category!=='Monomotor'&&allowedForType(state,type).includes(a.id);
 const allowed=allowedForType(state,type);
 if(role!=='pilot')return !!a&&canSchedule(role,a)&&allowed.includes(a.id);
 if(!pilotCanRequest(a))return false;
 if(a.category==='Monomotor')return multiTypes.includes(type)?allowed.includes('HP880BL'):state.aircraft.some(x=>x.category==='Monomotor'&&allowed.includes(x.id));
 return allowed.includes(a.id);
}
function aircraftOrder(state,type){
 const allowed=allowedForType(state,type);
 return allowed.map(id=>state.aircraft.find(a=>a.id===id)).filter(a=>a?.category==='Monomotor');
}
function assignmentMinutes(q){const start=minutes(q?.start),end=minutes(q?.end);return Number.isFinite(start)&&Number.isFinite(end)&&end>start?end-start:0;}
function aircraftLoad(assignments,id){const flights=assignments.filter(q=>q.aircraft===id);return {count:flights.length,minutes:flights.reduce((total,q)=>total+assignmentMinutes(q),0)};}
function compareAircraftLoad(assignments,a,b){const left=aircraftLoad(assignments,a.id),right=aircraftLoad(assignments,b.id);return left.count-right.count||left.minutes-right.minutes;}
function forecastInspectionDate(state,aircraft,assignments){
 const plan=aircraft?.inspectionPlan;if(!plan||!Array.isArray(plan.weekdayHours))return null;
 const assignedHours=aircraftLoad(assignments,aircraft.id).minutes/60,target=Date.parse(state.date+'T12:00:00Z');if(!Number.isFinite(target))return null;
 const dates=[];
 for(const limit of [50,100]){
  let remaining=Number(plan['remaining'+limit])-assignedHours;if(!Number.isFinite(remaining))continue;
  if(remaining<=0){dates.push(state.date);continue;}
  let projected=0,due=null;
  for(let offset=1;offset<=366;offset++){
   const day=new Date(target+offset*86400000);projected+=Number(plan.weekdayHours[day.getUTCDay()])||0;
   if(projected+1e-7>=remaining){due=day.toISOString().slice(0,10);break;}
  }
  if(due)dates.push(due);
 }
 return dates.length?dates.sort()[0]:null;
}
function inspectionStaggeringBias(state,type,assignments){
 const rows=aircraftOrder(state,type).filter(a=>a.status==='operativo').map(a=>({id:a.id,date:forecastInspectionDate(state,a,assignments)})).filter(row=>row.date);
 if(rows.length<2)return new Map();
 const parent=rows.map((_,index)=>index),root=index=>{while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index];}return index;};
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const difference=Math.abs(Date.parse(rows[i].date+'T12:00:00Z')-Date.parse(rows[j].date+'T12:00:00Z'))/86400000;
  if(difference<=7){const left=root(i),right=root(j);if(left!==right)parent[right]=left;}
 }
 const groups=new Map();rows.forEach((row,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);});
 const bias=new Map();
 for(const group of groups.values()){
  if(group.length<2)continue;
  const weekdayRank=date=>{const weekday=new Date(date+'T12:00:00Z').getUTCDay();return weekday>=1&&weekday<=4?0:1;};
  const leader=[...group].sort((a,b)=>weekdayRank(a.date)-weekdayRank(b.date)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0];
  for(const row of group)bias.set(row.id,row.id===leader.id?-90:90);
 }
 return bias;
}
function compareAircraftFairLoad(state,type,assignments,a,b,bias=inspectionStaggeringBias(state,type,assignments)){
 const left=aircraftLoad(assignments,a.id),right=aircraftLoad(assignments,b.id);if(left.count!==right.count)return left.count-right.count;
 return left.minutes+(bias.get(a.id)||0)-right.minutes-(bias.get(b.id)||0);
}
function compareAircraftPriority(state,type,assignments,a,b,bias=inspectionStaggeringBias(state,type,assignments)){
 if((a.status==='operativo')!==(b.status==='operativo'))return a.status==='operativo'?-1:1;
 const order=aircraftOrder(state,type),rank=id=>{const value=order.findIndex(row=>row.id===id);return value<0?Number.MAX_SAFE_INTEGER:value;};
 const left=aircraftLoad(assignments,a.id),right=aircraftLoad(assignments,b.id);if(left.count!==right.count)return left.count-right.count;
 if(state.prioritySettings?.aircraftMode==='priority'){
  const inspectionOrder=(bias.get(a.id)||0)-(bias.get(b.id)||0);
  return inspectionOrder||rank(a.id)-rank(b.id);
 }
 return compareAircraftFairLoad(state,type,assignments,a,b)||rank(a.id)-rank(b.id);
}
function pilotHoursPeriod(state){return state.prioritySettings?.hourPeriod==='month'?'Month':'Honorarios';}
function pilotAssignedLoad(state,pilotId,assignments){
 const pilot=state.pilots.find(p=>p.id===pilotId),period=pilotHoursPeriod(state),prior=Number(pilot?.['periodPriorMinutes'+period])||0;
 return prior+assignments.filter(q=>q.pilot===pilotId).reduce((total,q)=>total+assignmentMinutes(q),0);
}
function comparePilotPriority(state,aircraft,assignments,left,right){
 const mode=state.prioritySettings?.pilotMode||'hours';
 if(mode==='hours'){
  const leftMinutes=pilotAssignedLoad(state,left.request.pilot,assignments)+assignmentMinutes(left.fit),rightMinutes=pilotAssignedLoad(state,right.request.pilot,assignments)+assignmentMinutes(right.fit);
  if(leftMinutes!==rightMinutes)return leftMinutes-rightMinutes;
 }
 const order=state.prioritySettings?.pilotOrder||[],globalRank=id=>{const value=order.indexOf(id);return value<0?Number.MAX_SAFE_INTEGER:value;},aircraftRank=id=>{const value=aircraft.pilots.indexOf(id);return value<0?Number.MAX_SAFE_INTEGER:value;};
 return globalRank(left.request.pilot)-globalRank(right.request.pilot)||aircraftRank(left.request.pilot)-aircraftRank(right.request.pilot)||left.request.created-right.request.created||left.request.id.localeCompare(right.request.id);
}
function priorityAssignment(state,q,a,requests,assignments,sharedInspectionBias){
 const competing=requests.some(other=>{
  if(other.id===q.id||other.aircraft!==q.aircraft||other.pilot===q.pilot||!overlaps(other,q))return false;
  const assigned=assignments.find(f=>f.id===other.id);
  return !assigned||assigned.aircraft===q.aircraft;
 });
 const requested=state.aircraft.find(other=>other.id===q.aircraft);
 const fallback=!requested||!assignmentEligible(requested,state)||!compatible(state,q,requested)||!fitRequest(state,q,requested,assignments)||assignments.some(f=>f.aircraft===q.aircraft&&overlaps(f,q));
 const inspectionBias=sharedInspectionBias||inspectionStaggeringBias(state,typeOf(q),assignments),inspection=inspectionBias.has(a.id)&&(!requested||inspectionBias.get(a.id)<(inspectionBias.get(requested.id)||0))&&(!requested||aircraftLoad(assignments,a.id).count<=aircraftLoad(assignments,requested.id).count);
 if(q.aircraft===a.id)return {allowed:true,competing,idle:false,fallback,inspection:inspectionBias.get(a.id)<0};
 const order=aircraftOrder(state,typeOf(q)).map(other=>other.id),rank=order.indexOf(a.id),requestedRank=order.indexOf(q.aircraft);
 const higher=rank>=0&&requestedRank>rank;
 const idle=higher&&Number.isFinite(a.idleDays)&&a.idleDays>=PRIORITY_IDLE_DAYS;
 const manualPriority=state.prioritySettings?.aircraftMode==='priority'&&higher&&(!requested||aircraftLoad(assignments,a.id).count<=aircraftLoad(assignments,requested.id).count);
 const balanced=state.prioritySettings?.aircraftMode!=='priority'&&requested&&compareAircraftFairLoad(state,typeOf(q),assignments,a,requested,inspectionBias)<0;
 return {allowed:fallback||competing||idle||manualPriority||balanced||inspection,competing,idle,fallback,manualPriority,balanced,inspection};
}
function compatible(state,q,a){
 const p=state.pilots.find(x=>x.id===q.pilot);
 return !!p&&p.valid&&p.categories.includes(a.category)&&allowedForType(state,typeOf(q)).includes(a.id);
}
function normalizeRequest(state,q){
 const type=typeOf(q),source=state.aircraft.find(a=>a.id===q.aircraft),allowed=allowedForType(state,type);
 // A selected multimotor/helicopter is never moved by type configuration or priorities.
 const target=source?.category==='Monomotor'?(multiTypes.includes(type)&&allowed.includes('HP880BL')?'HP880BL':type==='grob'&&allowed.length===1&&state.aircraft.some(a=>a.id===allowed[0]&&a.category==='Monomotor')?allowed[0]:null):null;
 if(!target||q.aircraft===target)return {...q,flightType:type};
 const a=state.aircraft.find(x=>x.id===target);if(!a)return {...q,flightType:type};
 const slot=active(a).find(s=>overlaps(s,q))?.id||q.slot,next={...q,flightType:type,preferredAircraft:q.preferredAircraft||q.aircraft,aircraft:target,slot};
 next.sourceSlots=sourceSnapshot(a,next);return next;
}
function flightTypeLabel(type,aircraftId){
 const id=String(typeof aircraftId==='object'?aircraftId?.id||'':aircraftId||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 if(id==='HP880BL'){
  const labels={ley89:'Multi Ley 89',conversion:'Multi Conversión',charter:'Charter',socio:'Socio'};
  if(labels[type])return labels[type];
 }
 return flightTypes[type]?.label||'Tipo no válido';
}
function typeHint(state,type,aircraftId){
 const aircraft=String(typeof aircraftId==='object'?aircraftId?.id||'':aircraftId||'').replace(/[^a-z0-9]/gi,'').toUpperCase(),hp880Types=[...multiTypes,'ley89','conversion','charter','socio'].includes(type),allowed=aircraft==='HP880BL'&&hp880Types?['HP880BL']:allowedForType(state,type);
 return flightTypeLabel(type,aircraftId)+': '+(allowed.join(' → ')||'sin aeronaves asignadas')+(type==='examen'?' · prioridad máxima entre solicitudes pendientes; requiere número de delegación':type==='charter'?aircraft==='HP880BL'?' · disponible para pilotos en HP880BL · agenda fija':' · solo director · agenda fija':multiTypes.includes(type)?' · prioridad y aeronaves configurables por el director':' · prioridad por tipo; solo se redistribuyen monomotores');
}
function routeError(value){
 const normalized=normalizeRoute(value),parts=normalized.split(' - ');
 if(normalized.length>200)return 'La ruta no puede exceder 200 caracteres.';
 return parts.length<3||parts.some(code=>!/^[A-Z0-9]{3,4}$/.test(code))?'Ingresa al menos 3 códigos OACI, IATA o VOR de 3 o 4 caracteres, separados por guiones.':'';
}
function normalizeRoute(value){return String(value||'').normalize('NFKC').toUpperCase().trim().split(/\s*[-–—]\s*/).map(code=>code.trim()).join(' - ');}
function delegationNumberError(value){const number=String(value||'').trim();return !number||number.length>30||/[\x00-\x1F\x7F]/.test(number)?'Escribe un número de delegación válido (máximo 30 caracteres).':'';}
function flightDataError(state,q){
 if(q.studentId&&!state.students?.some(x=>x.id===q.studentId))return 'Selecciona un estudiante de la lista o deja la casilla en blanco.';
 if(q.studentId&&state.students?.some(x=>x.id===q.studentId&&x.blockedForFlights))return 'Este estudiante tiene un cargo de no show pendiente de aceptación y no puede recibir nuevos vuelos.';
 if(typeOf(q)==='examen'){const error=delegationNumberError(q.delegationNumber);if(error)return error;}
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
 if(minutes(clock.time)<360||minutes(clock.time)>=1200)return 'Reservas cerradas. Se reciben de 6:00 a. m. a 8:00 p. m. del día anterior, hora de Panamá.';
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
 if(a?.status==='grounded')return 'La aeronave está GROUNDED y no se puede seleccionar para agendar vuelos.';
 if(role==='director'&&Array.isArray(state.assignmentAircraftIds)&&!assignmentEligible(a,state))return 'Esta aeronave no estaba operativa al cierre de las 8:00 p. m. o ahora no está operativa; no se puede agregar al borrador.';
 const metadataError=flightDataError(state,q);if(metadataError)return metadataError;
 if(role!=='director'&&(!a||!bookable(a,state.date)))return 'La aeronave no está operativa ni tiene disponibilidad prevista para esta fecha.';
 if(!p||!p.valid||!p.categories.includes(a.category))return 'El piloto no está habilitado para esta aeronave.';
 if(!canChooseFlightType(state,typeOf(q),role,a))return typeOf(q)==='charter'?'Chárter solo está disponible para director en multimotor o helicóptero.':'La aeronave no corresponde al tipo de vuelo seleccionado.';
 if(!validWindow(q))return 'La hora final debe ser posterior a la inicial, dentro del mismo día.';
 const hoursError=operatingHoursError(q);if(hoursError)return hoursError;
 if(minutes(q.end)>minutes('18:30')&&!state.nightEnabled)return 'Dirección debe habilitar el bloque nocturno de 6:30 p. m. a 8:00 p. m. antes de asignar este vuelo.';
 if(state.confirmed.some(x=>x.id!==excludeId&&(x.aircraft===q.aircraft||x.pilot===q.pilot)&&overlaps(x,q)))return 'El horario se cruza con otro vuelo de la aeronave o del piloto.';
 if(sameStudentConflict(state.confirmed,q,excludeId))return 'El estudiante ya tiene otro vuelo en ese horario.';
 if(minutes(q.end)-minutes(q.start)<MIN_ASSIGNMENT_MINUTES)return 'El vuelo debe durar al menos 1 hora y 30 minutos.';
 const dayWindowError=scheduleWindowError(a,q);if(dayWindowError)return dayWindowError;
 if((role!=='director'||a?.release?.enabled&&a.release.date===state.date)&&!covers(a,q,state.date))return 'El intervalo completo debe estar habilitado. Revisa horarios base, previsión y bloque nocturno.';
 return '';
}
function requestError(state,q,options={}){
 q=normalizeRequest(state,q);
 const clock=panamaClock(state.now),mayEditClosed=options.allowClosedEdit===true&&state.date===clock.tomorrow&&!state.published;
 const gate=reservationGate(state);if(gate&&!mayEditClosed)return gate;
 const a=state.aircraft.find(x=>x.id===q.aircraft),p=state.pilots.find(x=>x.id===q.pilot),s=a&&active(a).find(x=>x.id===q.slot),type=typeOf(q);
 if(!a||!requestSelectable(a))return 'La aeronave está GROUNDED o no está registrada como operativa; no se puede seleccionar para solicitar un vuelo.';
 if(!flightTypes[type])return 'Selecciona un tipo de vuelo válido.';
 const metadataError=flightDataError(state,q);if(metadataError)return metadataError;
 if(type==='charter'&&a?.id!=='HP880BL')return 'Chárter solo está disponible para pilotos en HP880BL; las demás aeronaves requieren agenda de Dirección.';
 if(!p||!p.valid||!p.categories.includes(a.category))return 'El piloto no está habilitado para esta solicitud.';
 if(!canChooseFlightType(state,type,'pilot',a))return 'El director no ha habilitado aeronaves accesibles para este tipo de vuelo.';
 if(!allowedForType(state,type).length&&!(a.id==='HP880BL'&&[...multiTypes,'ley89','conversion','charter','socio'].includes(type)))return 'El director debe asignar una aeronave a este tipo de vuelo.';
 if(!s)return 'Este bloque no está habilitado.';
 const timing=timeError(a,q);if(timing)return timing;
 const hoursError=operatingHoursError(q);if(hoursError)return hoursError;
 if(minutes(q.end)-minutes(q.start)<MIN_ASSIGNMENT_MINUTES)return 'El vuelo debe durar al menos 1 hora y 30 minutos.';
 const dayWindowError=scheduleWindowError(a,q);if(dayWindowError)return dayWindowError;
 if(!requestCovers(a,q,state.date))return 'El horario comienza antes de la habilitación del director o queda fuera de los horarios disponibles.';
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
function studentNameKey(q){
 const name=String(q?.studentName||q?.estudiante||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 return name?'name:'+name:'';
}
function sameStudent(a,b){
 const aId=String(a?.studentId||'').trim(),bId=String(b?.studentId||'').trim();
 if(aId&&bId)return aId===bId;
 const aName=studentNameKey(a),bName=studentNameKey(b);
 return !!aName&&aName===bName;
}
function studentConflicts(state,request){
 if(!studentNameKey(request)&&!request?.studentId)return [];
 const confirmed=(state.confirmed||[]).filter(f=>f.id!==request.id&&sameStudent(f,request)&&overlaps(f,request));
 const pending=(state.requests||[]).filter(q=>q.id!==request.id&&q.status!=='approved'&&q.status!=='cancelled'&&!state.cancelled?.includes(q.id)&&!state.confirmed?.some(f=>f.sourceRequestId===q.id)&&sameStudent(q,request)&&overlaps(q,request));
 return [...confirmed,...pending];
}
function sameStudentConflict(assignments,q,excludeId){
 return !!(studentNameKey(q)||q?.studentId)&&assignments.some(x=>x.id!==excludeId&&sameStudent(x,q)&&overlaps(x,q));
}
function timeLabel(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function fitDeviation(request,fit){
 const requestedStart=minutes(request.start),requestedEnd=minutes(request.end),duration=minutes(fit.end)-minutes(fit.start),requestedDuration=requestedEnd-requestedStart;
 return (requestedDuration-duration)*100000+Math.abs(minutes(fit.start)-requestedStart)*2+Math.abs(minutes(fit.end)-requestedEnd);
}
function fitRequest(state,request,aircraft,assignments){
 const requestedStart=minutes(request.start),requestedEnd=minutes(request.end),requestedDuration=requestedEnd-requestedStart;
 if(!Number.isFinite(requestedStart)||requestedDuration<MIN_ASSIGNMENT_MINUTES)return null;
 const windows=[];
 for(const row of bookingSlots(aircraft,state.date).filter(validWindow).sort((a,b)=>minutes(a.start)-minutes(b.start))){
  const start=minutes(row.start),end=minutes(row.end),last=windows.at(-1);
  if(last&&start<=last.end)last.end=Math.max(last.end,end);else windows.push({start,end});
 }
 const conflicts=assignments.filter(f=>f.id!==request.id&&(f.aircraft===aircraft.id||f.pilot===request.pilot||sameStudent(f,request))&&validWindow(f)).map(f=>({start:minutes(f.start),end:minutes(f.end)}));
 let best=null,bestCost=Infinity;
 for(const segment of windows){
  const latestMinimum=segment.end-MIN_ASSIGNMENT_MINUTES,latestFull=segment.end-requestedDuration;
  if(latestMinimum<segment.start)continue;
  const starts=new Set([Math.max(segment.start,Math.min(requestedStart,latestMinimum)),segment.start,latestFull]);
  for(const conflict of conflicts){starts.add(conflict.end);starts.add(conflict.start-requestedDuration);}
  for(const start of starts){
   if(!Number.isFinite(start)||start<segment.start||start>latestMinimum)continue;
   if(conflicts.some(f=>f.start<=start&&f.end>start))continue;
   const nextConflict=conflicts.filter(f=>f.start>start).reduce((end,f)=>Math.min(end,f.start),segment.end),duration=Math.min(requestedDuration,nextConflict-start,segment.end-start);
   if(duration<MIN_ASSIGNMENT_MINUTES)continue;
   const fit={...request,start:timeLabel(start),end:timeLabel(start+duration),requestedStart:request.start,requestedEnd:request.end,assignedDuration:duration},cost=fitDeviation(request,fit);
   if(cost<bestCost||cost===bestCost&&minutes(fit.start)>minutes(best?.start||'00:00')){best=fit;bestCost=cost;}
  }
 }
 return best;
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
 const fields=['date','aircraft','pilot','studentId','start','end','flightType','socioName','route','note'];
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
 return {kind:'publication',date:state.date,flightCount:state.confirmed.filter(q=>!q.operationalHold&&!held.has(q.id)).length,recipients:[{kind:'group',id:'all'}]};
}
function canCancelRelocated(state,flight,pilot,now){
 const clock=panamaClock(now);
 return !!flight&&flight.pilot===pilot&&state.published&&(state.date>clock.date||state.date===clock.date&&minutes(flight.start)>minutes(clock.time));
}
function pendingConflict(state,flight,aircraftId){
 return state.requests.some(q=>q.id!==flight.id&&q.id!==flight.sourceRequestId&&q.sourceRequestId!==flight.id&&q.status!=='approved'&&q.status!=='cancelled'&&!state.cancelled.includes(q.id)&&(q.aircraft===aircraftId||q.pilot===flight.pilot||sameStudent(q,flight))&&overlaps(q,flight));
}
function reallocatePublished(state,aircraftId,previousStatus,now){
 const flights=structuredClone(state.confirmed),changes=[],a=state.aircraft.find(a=>a.id===aircraftId),clock=panamaClock(now);
 if(!state.published||previousStatus!=='operativo'||!['mantenimiento','grounded'].includes(a?.status)||state.date<clock.date)return {flights,changes};
 const affected=flights.filter(q=>q.aircraft===aircraftId&&(state.date>clock.date||minutes(q.end)>minutes(clock.time))).sort((x,y)=>allowedForType(state,typeOf(x)).length-allowedForType(state,typeOf(y)).length||minutes(x.start)-minutes(y.start)||x.id.localeCompare(y.id));
 for(const q of affected){
  const before=structuredClone(q),inProgress=state.date===clock.date&&minutes(q.start)<=minutes(clock.time);
  const candidates=a.category==='Monomotor'&&typeOf(q)!=='charter'&&!inProgress?allowedForType(state,typeOf(q)).map(id=>state.aircraft.find(other=>other.id===id)).filter(other=>other&&other.id!==a.id&&other.category==='Monomotor'&&other.status==='operativo'&&compatible(state,q,other)&&flightAvailable(other,q,state.date)&&covers(other,q,state.date)&&!scheduleWindowError(other,q)&&!operatingHoursError(q)&&!flights.some(x=>x.id!==q.id&&(x.aircraft===other.id||x.pilot===q.pilot||sameStudent(x,q))&&overlaps(x,q))&&!pendingConflict(state,q,other.id)):[];
  if(candidates.length){
   const target=candidates[0];q.aircraft=target.id;q.conditional=false;
   q.relocationOrigin ||= {aircraft:before.aircraft,start:before.start,end:before.end,slot:before.slot,coveredSlots:before.coveredSlots};
   q.relocation={from:before.aircraft,to:target.id,at:now,reason:'Cambio de estado a '+a.status};q.relocationHistory=[...(q.relocationHistory||[]),q.relocation];delete q.relocationPending;
   q.reason='Reubicado por cambio de estado · '+before.aircraft+' → '+q.aircraft;changes.push({kind:'relocated',before,after:structuredClone(q),reason:q.reason});
  }else{
   q.conditional=true;q.relocationPending=true;
   const categoryReason=a.category==='Multimotor'?'Multimotor: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.':a.category==='Helicóptero'?'Helicóptero: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.':'Sin aeronave operativa compatible y libre en el mismo horario.';
   const reason=inProgress?'Vuelo ya iniciado: requiere revisión del Director.':typeOf(q)==='charter'?'Chárter: cambio de aeronave requiere revisión del Director.':categoryReason;
   changes.push({kind:'review',before,after:structuredClone(q),reason});
  }
 }
 return {flights,changes};
}
function restorePublished(state,aircraftId,previousStatus,now){
 const flights=structuredClone(state.confirmed),changes=[],a=state.aircraft.find(a=>a.id===aircraftId),clock=panamaClock(now);
 if(!state.published||!['mantenimiento','grounded'].includes(previousStatus)||a?.status!=='operativo'||state.date<clock.date)return {flights,changes};
 const affected=flights.filter(q=>{const origin=q.relocationOrigin?.aircraft||q.relocation?.from,moved=origin===aircraftId&&q.aircraft!==aircraftId&&(!q.relocation?.to||q.relocation.to===q.aircraft);return (moved||q.aircraft===aircraftId&&q.relocationPending)&&(state.date>clock.date||minutes(q.end)>minutes(clock.time));}).sort((x,y)=>minutes(x.start)-minutes(y.start)||x.id.localeCompare(y.id));
 for(const q of affected){
  if(q.aircraft===aircraftId){const before=structuredClone(q),conflict=flights.some(x=>x.id!==q.id&&(x.aircraft===a.id||x.pilot===q.pilot||sameStudent(x,q))&&overlaps(x,q))||pendingConflict(state,q,a.id),allowed=allowedForType(state,typeOf(q)).includes(a.id),available=allowed&&compatible(state,q,a)&&flightAvailable(a,q,state.date)&&covers(a,q,state.date)&&!scheduleWindowError(a,q)&&!operatingHoursError(q)&&!conflict;if(available){q.conditional=false;delete q.relocationPending;delete q.operationalHold;delete q.validationHold;delete q.publicationStatus;q.reason='Horario conservado en '+a.id+' al restablecerse sus operaciones.';changes.push({kind:'restored',before,after:structuredClone(q),reason:q.reason});}else{q.conditional=true;q.relocationPending=true;q.reason='La aeronave está operativa, pero la asignación requiere revisión del Director por disponibilidad o conflicto.';changes.push({kind:'review',before,after:structuredClone(q),reason:q.reason});}continue;}
  const before=structuredClone(q),origin=q.relocationOrigin||{},candidate={...q,aircraft:a.id,slot:origin.slot||q.slot,coveredSlots:origin.coveredSlots||q.coveredSlots},inProgress=state.date===clock.date&&minutes(q.start)<=minutes(clock.time),conflict=flights.some(x=>x.id!==q.id&&(x.aircraft===a.id||x.pilot===q.pilot||sameStudent(x,q))&&overlaps(x,candidate))||pendingConflict(state,q,a.id),allowed=allowedForType(state,typeOf(q)).includes(a.id);
  if(!inProgress&&a.category==='Monomotor'&&allowed&&compatible(state,q,a)&&flightAvailable(a,candidate,state.date)&&covers(a,candidate,state.date)&&!scheduleWindowError(a,candidate)&&!operatingHoursError(candidate)&&!conflict){q.aircraft=a.id;q.slot=candidate.slot;q.coveredSlots=candidate.coveredSlots;q.conditional=false;q.relocationHistory=[...(q.relocationHistory||[]),{from:before.aircraft,to:a.id,at:now,reason:'Horario restaurado al volver a estar operativa',restored:true}];delete q.relocation;delete q.relocationOrigin;delete q.relocationPending;q.reason='Horario restaurado en '+a.id+' al volver a estar operativa.';changes.push({kind:'restored',before,after:structuredClone(q),reason:q.reason});}
  else{q.conditional=true;q.relocationPending=true;q.reason=inProgress?'El vuelo ya había comenzado; requiere revisión del Director.':'No hay un espacio libre compatible en '+a.id+' para restaurar el horario anterior; requiere revisión del Director.';changes.push({kind:'review',before,after:structuredClone(q),reason:q.reason});}
 }
 return {flights,changes};
}
function allocateMonomotorType(state,type,valid,assignments,results,used){
 while(true){
  const maintenanceBias=inspectionStaggeringBias(state,type,assignments),options=aircraftOrder(state,type).filter(a=>assignmentEligible(a,state)&&bookable(a,state.date)).sort((a,b)=>compareAircraftPriority(state,type,assignments,a,b,maintenanceBias)),candidates=[];
  for(const a of options)for(const request of valid.filter(q=>state.aircraft.find(x=>x.id===q.aircraft)?.category==='Monomotor'&&typeOf(q)===type&&!used.has(q.id)&&priorityAssignment(state,q,a,valid,assignments,maintenanceBias).allowed&&compatible(state,q,a)&&(!state.maxBlocks||assignments.filter(x=>x.pilot===q.pilot).length<state.maxBlocks))){
   const fit=fitRequest(state,request,a,assignments);if(fit)candidates.push({aircraft:a,candidate:{request,fit}});
  }
  candidates.sort((left,right)=>fitDeviation(left.candidate.request,left.candidate.fit)-fitDeviation(right.candidate.request,right.candidate.fit)||compareAircraftPriority(state,type,assignments,left.aircraft,right.aircraft,maintenanceBias)||comparePilotPriority(state,left.aircraft,assignments,left.candidate,right.candidate)||left.candidate.request.created-right.candidate.request.created||left.candidate.request.id.localeCompare(right.candidate.request.id));
  const selected=candidates[0];if(!selected)break;
  const a=selected.aircraft,original=selected.candidate.request,q=selected.candidate.fit,touched=active(a).filter(s=>overlaps(s,q)),priority=priorityAssignment(state,original,a,valid,assignments,maintenanceBias);
  if(!touched.length){used.add(original.id);results.push({...original,status:'review',reason:'No se encontró un bloque habilitado para el horario ajustado.'});continue;}
  const reason=flightTypes[type].label+' · '+(priority.competing?'prioridad por solicitudes coincidentes':priority.fallback?'aeronave solicitada no disponible para este tipo e intervalo':priority.manualPriority?'prioridad manual de aeronave':priority.balanced?'balance del uso de la flota':priority.idle?'prioridad de aeronave: '+a.registration+' lleva '+a.idleDays+' días sin vuelos registrados':'solicitud concedida en la aeronave solicitada')+((priority.inspection||maintenanceBias.has(a.id))?' · se consideran inspecciones próximas; proyección semanal para favorecer lunes a jueves':'')+(state.prioritySettings?.pilotMode==='hours'?' · priorización por horas acumuladas':'')+(q.aircraft!==a.id?' · redistribuido desde '+q.aircraft:'')+(q.start!==original.start||q.end!==original.end?' · horario ajustado desde '+original.start+'–'+original.end:' · horario solicitado conservado')+(a.status!=='operativo'?' · operativa prevista desde '+a.release.from:'');
  used.add(original.id);assignments.push({...q,aircraft:a.id,sourceRequestId:original.id,slot:touched[0].id,coveredSlots:touched.map(s=>s.id),requestedAircraft:original.aircraft,requestedStart:original.start,requestedEnd:original.end,fixed:false,conditional:a.status!=='operativo',reason});
  results.push({...original,start:q.start,end:q.end,assignedAircraft:a.id,status:'assigned',conditional:a.status!=='operativo',reason});
 }
}
function simulate(state){
 const assignments=state.confirmed.filter(x=>!x.operationalHold).map(x=>({...x,fixed:true})),results=[],used=new Set(),requests=state.requests.filter(q=>q.status!=='approved'&&!state.cancelled.includes(q.id)&&!state.confirmed.some(f=>f.sourceRequestId===q.id));
 const valid=requests.map(q=>normalizeRequest(state,q)).filter(q=>{
  const a=state.aircraft.find(x=>x.id===q.aircraft),p=state.pilots.find(x=>x.id===q.pilot),s=a&&active(a).find(x=>x.id===q.slot),type=typeOf(q);
  let reason='';
  if(!flightTypes[type])reason='Tipo de vuelo inválido: requiere revisión';
  else if(type==='charter'&&q.aircraft!=='HP880BL')reason='Charter requiere agenda manual de un director';
  else if(flightDataError(state,q))reason=flightDataError(state,q);
  else if(!a||!['operativo','mantenimiento','grounded'].includes(a.status))reason='Aeronave sin estado operativo válido: requiere revisión';
  else if(!p||!p.valid)reason='Vigencia del piloto pendiente';
  else if(!a||!p.categories.includes(a.category)||!canChooseFlightType(state,type,'pilot',a))reason='Equipo fuera de la habilitación o del tipo de vuelo solicitado';
  else if(minutes(q.end)-minutes(q.start)<MIN_ASSIGNMENT_MINUTES)reason='El vuelo debe durar al menos 1 hora y 30 minutos';
  else if(!s)reason='Bloque cerrado: requiere revisión';
  else reason=timeError(a,q);
  if(reason){results.push({...q,status:'review',reason});return false;}return true;
 });
 // Exam requests take precedence over every other pending request.
 // Allocate their monomotor requests first; other aircraft stay fixed to the
 // aircraft selected and are checked against the 20:00 operating snapshot.
 allocateMonomotorType(state,'examen',valid,assignments,results,used);
 // Multimotor and helicopter requests stay on the selected aircraft; never
 // shift these requests to another tail without Director configuration.
 const protectedRequests=valid.filter(q=>state.aircraft.find(a=>a.id===q.aircraft)?.category!=='Monomotor').sort((a,b)=>(typeOf(b)==='examen')-(typeOf(a)==='examen')||a.created-b.created||a.id.localeCompare(b.id));
 for(const original of protectedRequests){
  const a=state.aircraft.find(a=>a.id===original.aircraft);let q=original,reason='';
  if(!a||!assignmentEligible(a,state))reason='No se asigna: '+(a?.id||original.aircraft)+' no estaba operativa al cierre de las 8:00 p. m. o ahora no está operativa.';
  else if(!allowedForType(state,typeOf(q)).includes(a.id)||!compatible(state,q,a))reason='La aeronave no está habilitada para este tipo de vuelo o piloto.';
  else if(!bookable(a,state.date))reason=a.id+' no tiene disponibilidad habilitada para esta fecha.';
  if(!reason){const fitted=fitRequest(state,q,a,assignments);if(fitted)q=fitted;else reason='No se encontró un espacio compatible dentro del horario permitido para esta fecha.';}
  const conflict=assignments.find(x=>(x.aircraft===q.aircraft||x.pilot===q.pilot||sameStudent(x,q))&&overlaps(x,q));used.add(original.id);
  if(!reason&&!covers(a,q,state.date))reason=a.id+' no está disponible para todo el intervalo. Requiere revisión de Dirección.';
  else if(!reason&&conflict?.flightType==='examen'&&!conflict.fixed&&typeOf(q)!=='examen')reason='El examen de vuelo tiene prioridad sobre esta solicitud.';
  else if(!reason&&conflict)reason='Cruce con otra solicitud del piloto o del estudiante; se requiere revisión manual.';
  if(reason){results.push({...original,status:reason.startsWith('No se asigna:')? 'waiting':'review',reason});continue;}
  const moved=q.start!==original.start||q.end!==original.end;
  reason=(typeOf(q)==='examen'?'Examen de vuelo · prioridad máxima · ':'')+a.id+' · reserva fija · '+(moved?'horario ajustado desde '+original.start+'–'+original.end:'se publica como fue solicitado');
  assignments.push({...q,requestedStart:original.start,requestedEnd:original.end,protected:true,requestedAircraft:q.aircraft,fixed:false,conditional:a.status!=='operativo',reason});
  results.push({...original,start:q.start,end:q.end,assignedAircraft:q.aircraft,status:'assigned',protected:true,conditional:false,reason});
 }
 // Only mono requests and mono aircraft participate in the remaining type priorities.
 for(const type of Object.keys(flightTypes).filter(t=>t!=='examen'&&!multiTypes.includes(t)&&t!=='charter').sort((a,b)=>aircraftOrder(state,a).length-aircraftOrder(state,b).length))allocateMonomotorType(state,type,valid,assignments,results,used);
 for(const q of valid.filter(x=>!used.has(x.id))){
  const type=typeOf(q),options=aircraftOrder(state,type).filter(a=>assignmentEligible(a,state)&&compatible(state,q,a)&&bookable(a,state.date));
  const examPriorityConflict=type!=='examen'&&assignments.some(x=>typeOf(x)==='examen'&&!x.fixed&&(x.pilot===q.pilot||x.aircraft===q.aircraft)&&overlaps(x,q));
  let reason;
  if(examPriorityConflict)reason='El examen de vuelo tiene prioridad sobre esta solicitud.';
  else if(assignments.some(x=>x.pilot===q.pilot&&overlaps(x,q)))reason='El piloto ya tiene otro vuelo en ese horario';
  else if(state.maxBlocks&&assignments.filter(x=>x.pilot===q.pilot).length>=state.maxBlocks)reason='Límite diario propuesto alcanzado';
  else if(!options.length)reason='No hay aeronaves operativas al cierre de las 8:00 p. m. para '+flightTypes[type].label+' en su lista: '+allowedForType(state,type).join(', ');
  else if(!options.some(a=>covers(a,q,state.date)))reason='Ninguna aeronave permitida cubre todo el horario solicitado';
  else reason='Sin cupo compatible para '+flightTypes[type].label+' en ese horario: '+allowedForType(state,type).join(', ');
  results.push({...q,status:'waiting',reason});
 }
 return {assignments,results:results.sort((a,b)=>a.created-b.created)};
}
const api={slots,fleet,minutes,overlaps,active,validWindow,coversWindow,availabilityBounds,availabilityStart,availabilityEnd,bookable,bookingSlots,requestSelectable,requestSlots,requestCovers,assignmentEligible,covers,scheduleWindowError,operatingHoursWarning,operatingHoursError,directorWindowAvailable,flightAvailable,isNightFlight,nightPublication,sourceSnapshot,timeError,validateSlots,requestError,reservationGate,panamaClock,operationalAlerts,competingRequests,studentConflicts,sameStudentConflict,prepareApproval,publishedChange,publicationNotice,canCancelRelocated,reallocatePublished,restorePublished,directorFlightError,pilotCanRequest,canSchedule,allowedForType,defaultTypeRules,normalizeRequest,typeHint,flightTypeLabel,typeConfigAircraft,canChooseFlightType,routeError,normalizeRoute,delegationNumberError,flightDataError,simulate,fitRequest,fitDeviation,MIN_ASSIGNMENT_MINUTES,flightTypes,typeOf,aircraftOrder,compatible};
if(typeof module==='object'&&module.exports)module.exports=api;else root.HPItinerary=api;
})(typeof globalThis==='object'?globalThis:this);

