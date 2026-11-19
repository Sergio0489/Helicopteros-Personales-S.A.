'use strict';
// Pure production adapter. No Firebase, browser clock, demonstration users or seed data.
const E=require('./itinerary-engine');
const V=require('./pilot-validity');
const {policyFor}=require('./access');
const {permissions}=require('./boxes');
const {createHash}=require('node:crypto');
const copy=v=>structuredClone(v),arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const iso=v=>V.iso(v),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24);
const DAY_MS=86400000;
const status=v=>v==='aog'?'grounded':['operativo','mantenimiento','grounded'].includes(v)?v:'sin registrar';
const error=s=>{throw Error(s);};
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)error('Selecciona una fecha válida.');return value;}
function setup(data){return data.itinerary ||= {version:1,config:{},days:{},notices:[]};}
function day(data,d){date(d);const s=setup(data);s.days ||= {};return s.days[d] ||= {revision:0,nightEnabled:false,requests:[],held:[],cancelled:[],cancelledFlights:[],openSlots:[],published:false};}
function pilots(data){return arr(data.pilotos).map((p,i)=>({id:String(p.id||'legacy-pilot-'+i),name:p.nombre||p.name||'',categories:['Monomotor','Multimotor','Helicóptero'],valid:true}));}
function hasPendingNoShow(student){return arr(student?.expenses).some(e=>e?.noShowId&&!e.voidedAt&&!e.acceptance?.acceptedAt);}
function students(data){return [...arr(data.school?.students).map(p=>({id:'student:'+p.id,name:p.name,blockedForFlights:hasPendingNoShow(p)})),...arr(data.school?.registry?.clients).map(p=>({id:'client:'+p.id,name:p.name,blockedForFlights:false}))].sort((a,b)=>a.name.localeCompare(b.name,'es'));}
function legacyId(f){return f.id==null?'legacy-'+hash(f):String(f.id);}
function fromFlight(f,ps){return {...f.schedule,publicationStatus:'published',id:legacyId(f),date:iso(f.fecha),aircraft:key(f.aeronave),pilot:f.schedule?.pilot||f.pilotId||(f.pilotIdentityUnresolved?'legacy-name:'+f.piloto:ps.find(p=>p.name===f.piloto)?.id||'legacy-name:'+f.piloto),studentName:f.estudiante||'',studentId:f.personId&&f.personKind?f.personKind+':'+f.personId:f.schedule?.studentId||'',start:f.horaInicio||f.hora||'',end:f.horaFin||'',flightType:f.schedule?.flightType||'privado',note:f.observaciones||f.schedule?.note||'',route:f.ruta||f.schedule?.route||'',fixed:true,legacy:!f.schedule};}
function idleDays(data,id,targetDate){
 const entry=Object.entries(data.fleet||{}).find(([registration])=>key(registration)===id)?.[1]||{};
 const logs=Array.isArray(entry.bitacora_horas)?entry.bitacora_horas:Object.values(entry.bitacora_horas||{});
 const target=Date.parse(targetDate+'T12:00:00Z');let latest='';
 for(const log of logs){
  if(!(Number(log?.hv)>0))continue;
  const logged=iso(log.fecha),time=Date.parse(logged+'T12:00:00Z');
  if(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===logged&&logged<=targetDate&&logged>latest)latest=logged;
 }
 if(!latest||!Number.isFinite(target))return null;
 const days=(target-Date.parse(latest+'T12:00:00Z'))/DAY_MS;
 return Number.isFinite(days)?Math.max(0,Math.floor(days)-1):null;
}
function stateFor(data,d,now){
 date(d);const config=data.itinerary?.config||{},stored=data.itinerary?.days?.[d]||{},ps=pilots(data);
 const aircraft=E.fleet.map(([id,model,category,color],i)=>{const entry=Object.entries(data.fleet||{}).find(([k])=>key(k)===id),ac=config.aircraft?.[id]||{},order=config.aircraftOrder||[];return {id,registration:entry?.[0].replaceAll('_','-')||(id==='HP1186'?id:id.replace(/^HP/,'HP-')),model,category,color,status:status(entry?.[1]?.status),rank:order.includes(id)?order.indexOf(id)+1:i+1,idleDays:idleDays(data,id,d),pilots:arr(ac.pilots),slots:copy(stored.blocks?.[id]||ac.slots||E.slots),night:!!stored.nightEnabled,release:stored.releases?.[id]};});
 const confirmed=[...arr(data.itinerarios).filter(f=>iso(f.fecha)===d).map(f=>fromFlight(f,ps)),...copy(arr(stored.held)).map(q=>({...q,publicationStatus:'held'}))];
 const defaults=E.defaultTypeRules();if(config.aircraftOrder)for(const type of ['privado','xc','maniobras'])defaults[type]=copy(config.aircraftOrder);
 const typeRules={...defaults,...copy(config.typeRules||{})};
 return {date:d,now,published:!!stored.published,nightEnabled:!!stored.nightEnabled,aircraft,pilots:ps,students:students(data),typeRules,requests:copy(arr(stored.requests)),confirmed,cancelled:copy(arr(stored.cancelled)),cancelledFlights:copy(arr(stored.cancelledFlights)),openSlots:copy(arr(stored.openSlots)),maxBlocks:0,revision:stored.revision||0,configurationRevision:config.revision||0,lastResults:copy(arr(stored.results))};
}
function scope(data,actor){
 if(!actor.user?.emailVerified||actor.user.disabled||actor.account?.mergedInto)error('Verifica el correo e inicia sesión con una cuenta activa.');
 if(actor.director)return {role:'director',view:true,request:false,create:true,edit:true,settings:true};
 const p=policyFor(data,actor.account),box=id=>permissions(p,'itinerario',id);
 const view=['planner','calendar','flights','create','requests'].some(id=>box(id).view);
 const role=actor.account?.role==='Piloto'?'pilot':actor.account?.role==='Administrativo'?'admin':'reader';
 const linked=arr(data.pilotos).map((p,i)=>({...p,id:String(p.id||'legacy-pilot-'+i)})).filter(p=>p.authUid===actor.user.uid||!p.authUid&&String(p.email||'').trim().toLowerCase()===actor.user.email.toLowerCase());
 const pilot=linked.length===1?linked[0].id:null;
 // Requesting one's own flight never grants the pilot general itinerary editing.
 return {role,view,request:view&&role==='pilot'&&box('requests').edit&&!!pilot,pilot,create:view&&role==='admin'&&box('create').edit,edit:false,settings:false,boxes:{planner:box('planner').view,flights:box('flights').view,requests:box('requests').view}};
}
function assertPilot(data,q,d,now){
 const p=arr(data.pilotos).find((p,i)=>String(p.id||'legacy-pilot-'+i)===q.pilot);if(!p)error('Selecciona un piloto de los expedientes.');
 const expired=V.alerts(p,d,q.end,Date.parse(now)).filter(a=>a.expired);if(expired.length)error('No se puede asignar a '+(p.nombre||p.name)+': '+expired.map(a=>a.label+' vencido').join(', ')+'.');
}
function validateDateRange(d,now){date(d);const today=E.panamaClock(now).date;if(d<today)error('No se pueden crear o modificar reservas de fechas pasadas.');}
function toFlight(q,state,original){
 const person=state.students.find(p=>p.id===q.studentId),[kind,...parts]=String(q.studentId||'').split(':'),pilot=state.pilots.find(p=>p.id===q.pilot),ac=state.aircraft.find(a=>a.id===q.aircraft);
 const schedule=copy(q);delete schedule.legacy;delete schedule.createdByUid;delete schedule.requestActionId;
 return {...original,id:q.id,fecha:state.date,aeronave:ac?.registration||q.aircraft,piloto:pilot?.name||original?.piloto||'',estudiante:person?.name||'',personId:person?parts.join(':'):'',personKind:person?kind:'',horaInicio:q.start,horaFin:q.end,tipo:E.flightTypes[E.typeOf(q)]?.label||'Privado',observaciones:q.note||'',ruta:q.route||'',schedule};
}
function storeFlights(data,state){
 for(const q of state.confirmed.filter(q=>!q.legacy)){try{assertPilot(data,q,state.date,state.now);delete q.validationHold;}catch(e){q.validationHold=e.message;}}
 const d=day(data,state.date),old=arr(data.itinerarios),night=E.nightPublication(state,state.confirmed.filter(q=>!q.validationHold)),held=new Set([...night.blockedIds.filter(id=>!state.confirmed.find(q=>q.id===id)?.legacy),...state.confirmed.filter(q=>q.validationHold).map(q=>q.id)]);
 d.held=state.confirmed.filter(q=>held.has(q.id));
 data.itinerarios=[...old.filter(f=>iso(f.fecha)!==state.date),...state.confirmed.filter(q=>!held.has(q.id)).map(q=>{const original=old.find(f=>legacyId(f)===q.id);return q.legacy&&original&&eq(fromFlight(original,state.pilots),q)?original:toFlight(q,state,original);})];
 return night;
}
function notice(data,event,now,id){if(!event)return;const s=setup(data);s.notices ||= [];if(s.notices.some(n=>n.id===id))return;s.notices.push({...copy(event),id,createdAt:now});s.notices=s.notices.slice(-500);}
function changeNotice(data,before,after,published,now,id,all=false){const n=E.publishedChange(before,after,published);if(n){if(all)n.recipients=[{kind:'group',id:'all'}];notice(data,n,now,id);}}
function cleanFlight(input,id,now,allowEmptyNote=false){
 if(!input||typeof input!=='object'||Array.isArray(input))error('Vuelo no válido.');
 for(const [field,label,max]of [['aircraft','Aeronave',40],['pilot','Piloto',200],['start','Hora de inicio',5],['end','Hora de culminación',5],['flightType','Tipo de vuelo',40],['route','Ruta o destino',200],...allowEmptyNote?[]:[['note','Observaciones',1000]]]){
  if(typeof input[field]!=='string'||!input[field].trim())error('Completa el campo '+label+'.');
  if(input[field].trim().length>max)error(label+': máximo '+max+' caracteres.');
 }
 if(allowEmptyNote&&input.note!=null&&(typeof input.note!=='string'||input.note.trim().length>1000))error('Observaciones: máximo 1000 caracteres.');
 if(!Object.hasOwn(E.flightTypes,input.flightType))error('Vuelo no válido.');
 return {id,aircraft:key(input.aircraft),pilot:String(input.pilot||''),studentId:String(input.studentId||''),start:String(input.start||''),end:String(input.end||''),slot:String(input.slot||'b1'),flightType:String(input.flightType||'privado'),socioName:String(input.socioName||'').trim().slice(0,120),route:input.route.trim(),note:String(input.note||'').trim().slice(0,1000),created:Date.parse(now)};
}
function checkExpected(d,body){if(body.revision!==d.revision)error('El horario cambió. Actualiza y revisa antes de volver a guardar.');}
function publish(data,dateValue,now){
 const d=day(data,dateValue);if(d.published)return false;
 const state=stateFor(data,dateValue,now);
 state.pilots.forEach(p=>{try{for(const q of [...state.requests,...state.confirmed].filter(q=>q.pilot===p.id))assertPilot(data,q,dateValue,now);}catch{p.valid=false;}});
 const result=E.simulate(state);
 state.confirmed=result.assignments.map(q=>({...q,id:q.fixed?q.id:'scheduled-'+q.id,sourceRequestId:q.sourceRequestId||(!q.fixed?q.id:undefined)}));
 // JSON persistence excludes undefined; keep deterministic identities across retries.
 state.confirmed=JSON.parse(JSON.stringify(state.confirmed));
 d.published=true;d.publishedAt=now;d.results=result.results;d.revision++;state.published=true;
 storeFlights(data,state);notice(data,E.publicationNotice(state),now,'publication:'+dateValue);return true;
}
function publicationEmail(data,dateValue){
 const scheduled=arr(data.itinerarios).filter(f=>iso(f.fecha)===dateValue).map(f=>({aircraft:f.aeronave||'',model:E.fleet.find(x=>x[0]===key(f.aeronave))?.[1]||'',pilot:f.piloto||'',student:f.estudiante||'',start:f.horaInicio||f.hora||'',end:f.horaFin||'',type:f.tipo||f.schedule?.flightType||'Privado',route:f.ruta||'',notes:f.observaciones||''})).sort((a,b)=>E.fleet.findIndex(x=>x[0]===key(a.aircraft))-E.fleet.findIndex(x=>x[0]===key(b.aircraft))||a.start.localeCompare(b.start));
 return {id:'publication-'+dateValue,date:dateValue,publishedAt:data.itinerary?.days?.[dateValue]?.publishedAt||'',pilotRecipients:arr(data.pilotos).map(p=>p.email||'').filter(Boolean),flights:scheduled};
}
function queueModifiedEmail(data,dateValue,now){const d=day(data,dateValue);d.modifiedEmail={updatedAt:now,dueAt:new Date(Date.parse(now)+600000).toISOString()};}
function flushModifiedEmail(data,now){
 const due=Object.entries(data.itinerary?.days||{}).filter(([,d])=>d?.published&&d.modifiedEmail&&Date.parse(d.modifiedEmail.dueAt)<=Date.parse(now)).sort((a,b)=>a[1].modifiedEmail.dueAt.localeCompare(b[1].modifiedEmail.dueAt))[0];
 if(!due)return null;
 const [dateValue,stored]=due,updatedAt=stored.modifiedEmail.updatedAt;delete stored.modifiedEmail;
 const email=publicationEmail(data,dateValue);email.id='modified-'+dateValue+'-'+hash([dateValue,updatedAt]).slice(0,16);email.action='updated';email.updatedAt=updatedAt;return email;
}
function apply(data,actor,body,now){
 const rights=scope(data,actor);if(!rights.view)error('No tienes acceso al itinerario.');
 const dte=date(body.date),d=day(data,dte),action=body.command;
 if(!/^[a-zA-Z0-9-]{12,100}$/.test(body.actionId||''))error('Identificador de guardado no válido.');
 const receipt=actor.user.uid+':'+body.actionId,signature=hash({...body,revision:undefined});
 d.receipts ||= [];const prior=d.receipts.find(r=>r.id===receipt);if(prior){if(prior.signature!==signature)error('Identificador reutilizado con datos distintos.');return {duplicate:true};}
 if(action!=='request'||body.id)checkExpected(d,body);
 const state=stateFor(data,dte,now),before=copy(state.confirmed);let emailPublication=null;
 const requireDirector=()=>{if(!rights.settings)error('Solo un director puede realizar esta operación.');};
 if(action==='settings'){
  requireDirector();validateDateRange(dte,now);const c=setup(data).config ||= {};
  if((body.configurationRevision||0)!==(c.revision||0))error('Las prioridades cambiaron. Actualiza antes de guardar.');c.revision=(c.revision||0)+1;
  if(typeof body.nightEnabled==='boolean')d.nightEnabled=body.nightEnabled;
  if(body.aircraftOrder){const known=state.aircraft.filter(a=>a.category==='Monomotor').map(a=>a.id);if(!Array.isArray(body.aircraftOrder)||body.aircraftOrder.length!==known.length||new Set(body.aircraftOrder).size!==known.length||body.aircraftOrder.some(id=>!known.includes(id)))error('Revisa el orden de monomotores.');c.aircraftOrder=copy(body.aircraftOrder);}
  if(body.typeRules){for(const [type,ids]of Object.entries(body.typeRules)){if(!Object.hasOwn(E.flightTypes,type))error('Tipo de vuelo no válido.');const allowed=E.typeConfigAircraft(state,type).map(a=>a.id);if(!Array.isArray(ids)||ids.length>11||new Set(ids).size!==ids.length||ids.some(id=>!allowed.includes(id)))error('Revisa las aeronaves de cada tipo.');}(c.typeRules ||= copy(state.typeRules));Object.assign(c.typeRules,copy(body.typeRules));}
  if(body.aircraft){const id=key(body.aircraft),a=state.aircraft.find(a=>a.id===id);if(!a)error('Aeronave no válida.');c.aircraft ||= {};const ac=c.aircraft[id] ||= {};
   if(body.pilots){if(!Array.isArray(body.pilots)||new Set(body.pilots).size!==body.pilots.length||body.pilots.some(id=>!state.pilots.some(p=>p.id===id)))error('Selecciona pilotos existentes sin duplicados.');ac.pilots=copy(body.pilots);}
   if(body.slots){if(!Array.isArray(body.slots)||body.slots.length!==5||body.slots.some((s,i)=>s.id!=='b'+(i+1)))error('Se requieren los cinco bloques.');const reason=E.validateSlots(body.slots,true);if(reason)error(reason);d.blocks ||= {};d.blocks[id]=body.slots.map(({id,start,end})=>({id,start,end}));}
   if(body.release){if(typeof body.release.enabled!=='boolean'||!Number.isFinite(E.minutes(body.release.from)))error('Hora de disponibilidad no válida.');d.releases ||= {};d.releases[id]={enabled:body.release.enabled,from:body.release.from,date:dte};}
  }
  const fresh=stateFor(data,dte,now);storeFlights(data,fresh);
 }else if(action==='request'){
  if(!rights.request)error(rights.role==='pilot'&&!rights.pilot?'Vincula tu usuario con un expediente de piloto.':'El director debe habilitar «Solicitudes de vuelos» para tu cargo.');
  const old=d.requests.find(q=>q.id===body.id);if(body.id&&(!old||old.pilot!==rights.pilot||old.status==='approved'||d.cancelled.includes(old.id)))error('No puedes modificar esta solicitud.');
  let q=cleanFlight({...body.flight,pilot:rights.pilot},old?.id||'request-'+body.actionId,now,true);q.pilot=rights.pilot;q.created=old?.created||q.created;q.createdByUid=actor.user.uid;
  q=E.normalizeRequest(state,q);const reason=E.requestError(state,q);if(reason)error(reason);assertPilot(data,q,dte,now);q.sourceSlots=E.sourceSnapshot(state.aircraft.find(a=>a.id===q.aircraft),q);
  d.requests=d.requests.filter(x=>x.id!==q.id);d.requests.push(q);
 }else if(action==='cancel-request'){
  const q=d.requests.find(q=>q.id===body.id);if(!q||q.status==='approved'||state.published)error('La solicitud ya fue aprobada o publicada.');
  if(!rights.settings&&(!rights.request||q.pilot!==rights.pilot||E.reservationGate(state)))error('No puedes cancelar esta solicitud.');
  d.cancelled.push(q.id);q.status='cancelled';
 }else if(action==='approve'){
  requireDirector();const prepared=E.prepareApproval(state,body.id);if(prepared.error)error(prepared.error);assertPilot(data,prepared.flight,dte,now);
  const ac=state.aircraft.find(a=>a.id===prepared.flight.aircraft);if(ac.status!=='operativo'&&!body.acknowledge)error('Confirma la alerta de la aeronave no operativa.');
  state.confirmed.push(prepared.flight);const q=d.requests.find(q=>q.id===body.id);q.status='approved';q.approvedAt=now;q.approvedFlightId=prepared.flight.id;storeFlights(data,state);
 }else if(action==='flight'){
  if(!rights.create)error('Este cargo no puede agendar vuelos.');validateDateRange(dte,now);
  const oldDate=body.originalDate?date(body.originalDate):dte,source=stateFor(data,oldDate,now),old=body.id?source.confirmed.find(q=>q.id===body.id):null;
  if(body.id&&(!old||!rights.edit))error('Solo el director puede modificar este vuelo.');
  if(oldDate!==dte){checkExpected(day(data,oldDate),{revision:body.originalRevision});validateDateRange(oldDate,now);}
  const q={...old,...cleanFlight(body.flight,old?.id||'flight-'+body.actionId,now),fixed:true,createdByRole:rights.role};q.date=dte;
  assertPilot(data,q,dte,now);const reason=E.directorFlightError(state,q,oldDate===dte?old?.id:undefined,rights.role);if(reason)error(reason);
  const a=state.aircraft.find(a=>a.id===q.aircraft);if(a.status!=='operativo'&&!body.acknowledge)error('Confirma la alerta de la aeronave no operativa.');
  if(oldDate!==dte){source.confirmed=source.confirmed.filter(f=>f.id!==old.id);storeFlights(data,source);day(data,oldDate).revision++;if(source.published)queueModifiedEmail(data,oldDate,now);}
  state.confirmed=state.confirmed.filter(f=>f.id!==q.id);state.confirmed.push(q);storeFlights(data,state);
  changeNotice(data,old?{...old,date:oldDate}:null,q,state.published||source.published,now,receipt);
 }else if(action==='cancel-flight'){
  const q=state.confirmed.find(q=>q.id===body.id);if(!q)error('El vuelo ya no existe.');
  if(!rights.edit&&!(rights.role==='pilot'&&rights.pilot&&E.canCancelRelocated(state,q,rights.pilot,now)))error('Solo puedes cancelar tu propio vuelo antes de su inicio.');
  const reason=String(body.reason||'').trim();if(!reason||reason.length>500)error('Escribe el motivo de la cancelación (máximo 500 caracteres).');
  state.confirmed=state.confirmed.filter(f=>f.id!==q.id);d.cancelled.push(q.sourceRequestId||q.id);d.cancelledFlights ||= [];d.openSlots ||= [];
  d.cancelledFlights.push({id:'cancel-'+receipt,flightId:q.id,aircraft:q.aircraft,start:q.start,end:q.end,pilot:q.pilot,studentId:q.studentId,reason,cancelledAt:now});
  const cancellationAircraft=state.aircraft.find(a=>a.id===q.aircraft),reopen=E.canCancelRelocated(state,q,q.pilot,now)&&!!cancellationAircraft&&E.bookable(cancellationAircraft,dte)&&E.minutes(q.end)-E.minutes(q.start)>=E.MIN_ASSIGNMENT_MINUTES,open=reopen?{id:'open-'+receipt,aircraft:q.aircraft,start:q.start,end:q.end,flightType:E.typeOf(q),openedAt:now}:null;
  const duration=E.minutes(q.end)-E.minutes(q.start),waiting=d.requests.filter(r=>r.status!=='approved'&&!d.cancelled.includes(r.id)&&!state.confirmed.some(f=>f.sourceRequestId===r.id)).sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));
  for(const request of waiting){if(!open)break;const aircraft=state.aircraft.find(a=>a.id===q.aircraft),p=state.pilots.find(p=>p.id===request.pilot),requested=E.minutes(request.end)-E.minutes(request.start);if(duration<E.MIN_ASSIGNMENT_MINUTES||requested<E.MIN_ASSIGNMENT_MINUTES||!aircraft||!E.bookable(aircraft,dte)||!p?.valid||!p.categories.includes(aircraft.category)||!E.allowedForType(state,E.typeOf(request)).includes(aircraft.id))continue;
   const assignedDuration=Math.min(duration,requested),replacement={...request,id:'replacement-'+hash([receipt,request.id]).slice(0,18),sourceRequestId:request.id,aircraft:aircraft.id,start:open.start,end:timeFromMinutes(E.minutes(open.start)+assignedDuration),fixed:true,createdByRole:'director',reason:'Asignación de vuelo pendiente en espacio liberado por cancelación'};
   if(!E.flightAvailable(aircraft,replacement,dte)||E.directorFlightError(state,replacement,undefined,'director'))continue;assertPilot(data,replacement,dte,now);state.confirmed.push(replacement);const original=d.requests.find(r=>r.id===request.id);if(original){original.status='approved';original.approvedAt=now;original.approvedFlightId=replacement.id;}open.filledBy=replacement.id;open.reason='Asignado automáticamente a un vuelo que estaba pendiente';break;
  }
  if(open&&!open.filledBy)d.openSlots.push(open);storeFlights(data,state);changeNotice(data,{...q,date:dte},open?.filledBy?state.confirmed.find(f=>f.id===open.filledBy):null,state.published,now,receipt,true);
 }else if(action==='claim-open-slot'){
  if(!rights.request||rights.role!=='pilot'||!rights.pilot)error('Solo un piloto vinculado puede tomar un espacio disponible.');
  if(!state.published)error('El horario todavía no está publicado.');
  const open=d.openSlots.find(x=>x.id===body.id);if(!open)error('Este espacio ya fue tomado. Actualiza el itinerario.');
  const clock=E.panamaClock(now);if(dte<clock.date||dte===clock.date&&E.minutes(open.start)<=E.minutes(clock.time))error('Este espacio ya inició o ya pasó.');
  const flight=cleanFlight({...body.flight,pilot:rights.pilot,aircraft:open.aircraft,start:open.start,end:open.end},'claimed-'+body.actionId,now,true);flight.pilot=rights.pilot;flight.fixed=true;flight.createdByRole='pilot';flight.createdByUid=actor.user.uid;
  const aircraft=state.aircraft.find(a=>a.id===open.aircraft);if(!aircraft||!E.bookable(aircraft,dte)||!E.canChooseFlightType(state,typeOf(flight),'pilot',aircraft)||!E.compatible(state,flight,aircraft))error('No estás habilitado para este tipo de vuelo o aeronave.');const metadataError=E.flightDataError(state,flight);if(metadataError)error(metadataError);
  if(E.minutes(flight.end)-E.minutes(flight.start)<E.MIN_ASSIGNMENT_MINUTES)error('El espacio debe durar al menos 1 hora y 30 minutos.');if(!E.flightAvailable(aircraft,flight,dte)||state.confirmed.some(q=>(q.aircraft===flight.aircraft||q.pilot===flight.pilot)&&E.overlaps(q,flight)))error('El espacio ya no está disponible para todo el intervalo.');assertPilot(data,flight,dte,now);
  state.confirmed.push(flight);d.openSlots=d.openSlots.filter(x=>x.id!==open.id);storeFlights(data,state);changeNotice(data,null,flight,state.published,now,receipt,true);
 }else if(action==='publish'){requireDirector();validateDateRange(dte,now);const alreadyPublished=!!d.published;if(publish(data,dte,now)&&!alreadyPublished)emailPublication=publicationEmail(data,dte);}
 else error('Operación de itinerario no válida.');
 d.revision++;d.receipts.push({id:receipt,signature});d.receipts=d.receipts.slice(-250);
 const after=stateFor(data,dte,now).confirmed;
 if(state.published&&!eq(before,after)&&action==='settings')notice(data,{kind:'change',action:'night-update',date:dte,recipients:[{kind:'group',id:'all'}]},now,receipt);
 if(state.published&&!eq(before,after))queueModifiedEmail(data,dte,now);
 return {duplicate:false,...(emailPublication?{emailPublication}:{})};
}
function timeFromMinutes(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
// Preserve server-owned requests/config and reject bypass through the legacy generic saver.
function pilotNameKey(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
function pilotReference(value,migration){
 if(typeof value!=='string')return value;
 const id=migration?.pilotIdMap?.[value];if(id)return id;
 if(value.startsWith('legacy-name:')&&migration?.changed)return migration?.pilotNameMap?.[pilotNameKey(value.slice(12))]||value;
 return value;
}
function remapPilotReferences(value,migration){
 if(Array.isArray(value))return value.map(item=>remapPilotReferences(item,migration));
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [field,item]of Object.entries(value)){
  if((field==='pilot'||field==='pilotId')&&typeof item==='string'){
   const mapped=value.pilotIdentityUnresolved===true?item:pilotReference(item,migration);out[field]=mapped;
   if(migration?.changed&&item.startsWith('legacy-name:')&&mapped===item)out.pilotIdentityUnresolved=true;
  }else if(field==='pilots'&&Array.isArray(item))out[field]=item.map(id=>pilotReference(id,migration));
  else if(field==='id'&&value.kind==='pilot'&&typeof item==='string'){
   const mapped=value.pilotIdentityUnresolved===true?item:pilotReference(item,migration);out[field]=mapped;
   if(migration?.changed&&item.startsWith('legacy-name:')&&mapped===item)out.pilotIdentityUnresolved=true;
  }else out[field]=remapPilotReferences(item,migration);
 }
 return out;
}
function remapFlights(rows,migration){
 const dates=new Set(),flights=arr(rows).map(row=>{
  const flight=remapPilotReferences(row,migration);
  if(migration?.changed&&!flight.schedule?.pilot&&!flight.pilotId&&flight.pilotIdentityUnresolved!==true&&String(flight.piloto||'').trim()){
   const id=migration?.pilotNameMap?.[pilotNameKey(flight.piloto)];if(id)flight.pilotId=id;else flight.pilotIdentityUnresolved=true;
  }
  if(!eq(row,flight)){if(row.id==null)flight.id=legacyId(row);const date=iso(row.fecha);if(date)dates.add(date);}
  return flight;
 });
 return {flights,dates};
}
function protect(before,after,migration={}){
 if(before.itinerary?.version){
  if(!eq(before.itinerarios||[],after.itinerarios||[]))error('Actualiza el itinerario desde la nueva página para conservar las reglas y los avisos.');
  const mapped=remapFlights(before.itinerarios,migration),itinerary=remapPilotReferences(before.itinerary,migration);
  after.itinerarios=mapped.flights;
  const oldConfig=before.itinerary.config||{},newConfig=itinerary.config||{};
  if(!eq(oldConfig,newConfig)){itinerary.config ||= {};itinerary.config.revision=(Number(oldConfig.revision)||0)+1;}
  for(const date of mapped.dates){const old=before.itinerary.days?.[date],next=itinerary.days?.[date];if(next)next.revision=(Number(old?.revision)||0)+1;}
  for(const [date,old]of Object.entries(before.itinerary.days||{})){const next=itinerary.days?.[date];if(next&&!mapped.dates.has(date)&&!eq(old,next))next.revision=(Number(old.revision)||0)+1;}
  after.itinerary=itinerary;
 }else{delete after.itinerary;after.itinerarios=remapFlights(after.itinerarios,migration).flights;}
}
function reconcile(before,data,now){
 let changed=false;
 const today=E.panamaClock(now).date;
 // Keep operational alerts available even to users who do not have itinerary access.
 data.operationalNotices ||= [];
 for(const [registration,aircraft]of Object.entries(data.fleet||{})){
  const previous=before.fleet?.[registration]?.status||'';
  const previousStatus=previous==='aog'?'grounded':previous,status=aircraft?.status==='aog'?'grounded':aircraft?.status;
  if(previousStatus===status||!['mantenimiento','grounded'].includes(status))continue;
  const id='aircraft-status:'+hash([registration,previousStatus,status,now]);
  if(data.operationalNotices.some(n=>n.id===id))continue;
  data.operationalNotices.push({id,kind:'aircraft-status',aircraft:registration.replaceAll('_','-'),status,previous:previousStatus,createdAt:now,recipients:[{kind:'group',id:'all'}],message:'La aeronave '+registration.replaceAll('_','-')+' cambió a '+(status==='grounded'?'GROUNDED':'MANTENIMIENTO')+'.'});
  data.operationalNotices=data.operationalNotices.slice(-500);changed=true;
 }
 if(!data.itinerary?.version)return changed;
 // A forecast belongs to the restriction under which it was entered. A new
 // non-operational status requires a fresh forecast, including unpublished days.
 for(const dt of Object.keys(data.itinerary.days||{}).filter(d=>d>=today)){
  const state=stateFor(data,dt,now),old=stateFor(before,dt,now),stored=day(data,dt);let invalidated=false;
  for(const ac of state.aircraft){
   const previous=old.aircraft.find(a=>a.id===ac.id)?.status;
   if(ac.status===previous||ac.status==='operativo'||!stored.releases?.[ac.id]?.enabled)continue;
   stored.releases[ac.id]={...stored.releases[ac.id],enabled:false};invalidated=true;
  }
  if(invalidated){if(!stored.published)stored.revision++;changed=true;}
 }
 for(const dt of Object.keys(data.itinerary.days||{}).filter(d=>d>=today&&data.itinerary.days[d].published)){
  const state=stateFor(data,dt,now),old=stateFor(before,dt,now);let scheduleChanged=false;
  for(const ac of state.aircraft){const previous=old.aircraft.find(a=>a.id===ac.id)?.status;if(previous===ac.status)continue;
   const result=E.reallocatePublished(state,ac.id,previous,now);if(!result.changes.length)continue;state.confirmed=result.flights;scheduleChanged=true;
   for(const c of result.changes)notice(data,{kind:c.kind,date:dt,before:{...c.before,date:dt},after:{...c.after,date:dt},reason:c.reason,recipients:[{kind:'group',id:'all'}]},now,'status:'+hash([dt,c.before.id,now,c.after]));changed=true;
  }
  if(!eq(old.aircraft.map(a=>a.status),state.aircraft.map(a=>a.status))){storeFlights(data,state);day(data,dt).revision++;changed=true;if(scheduleChanged)queueModifiedEmail(data,dt,now);}
 }
 return changed;
}
function operational(data,now){const clock=E.panamaClock(now);return E.operationalAlerts([stateFor(data,clock.date,now),stateFor(data,clock.tomorrow,now)],now);}
function visibleNotices(data,actor,now){
 const rights=scope(data,actor),record=actor.account?.syncStatus==='matched'?actor.account.recordKind+':'+actor.account.recordId:null;
 return arr(data.itinerary?.notices).filter(n=>actor.director||n.recipients.some(r=>r.kind==='group'&&(r.id==='all'||r.id==='mechanics'&&actor.account?.role==='Mecánico')||r.kind==='pilot'&&r.id===rights.pilot||r.kind==='student'&&r.id===record)).slice(-100).reverse().map(n=>({id:n.id,kind:n.kind,action:n.action,date:n.date||n.after?.date||n.before?.date,createdAt:n.createdAt,flightCount:n.flightCount,...(actor.director||rights.view&&actor.account?.role!=='Estudiante'||n.recipients.some(r=>r.kind==='pilot'&&r.id===rights.pilot||r.kind==='student'&&r.id===record)||actor.account?.role==='Mecánico'?{before:n.before,after:n.after,reason:n.reason}:{})}));
}
function view(data,actor,d,now){
 const rights=scope(data,actor);if(!rights.view)error('No tienes permiso para consultar el itinerario.');const state=stateFor(data,d,now);
 if(!actor.director){state.aircraft.forEach(a=>{a.pilots=[];delete a.idleDays;});state.requests=rights.boxes.requests?state.requests.map(q=>{const own=q.pilot===rights.pilot;return own||rights.role==='admin'?q:{id:q.id,aircraft:q.aircraft,start:q.start,end:q.end,slot:q.slot,status:q.status,pilot:'',flightType:q.flightType};}):[];
  if(!rights.boxes.flights&&!rights.boxes.planner)state.confirmed=[];
  state.lastResults=state.lastResults.filter(q=>q.pilot===rights.pilot);
 }
 if(!actor.director&&actor.account?.role==='Estudiante'){
  const own=actor.account.syncStatus==='matched'?actor.account.recordKind+':'+actor.account.recordId:null;
  state.confirmed=state.confirmed.filter(q=>q.studentId===own);state.requests=[];state.lastResults=[];state.students=state.students.filter(p=>p.id===own);
 }
 if(!actor.director&&!rights.request&&!rights.create){const ids=new Set(state.confirmed.map(q=>q.pilot));state.pilots=state.pilots.filter(p=>ids.has(p.id));const people=new Set(state.confirmed.map(q=>q.studentId));state.students=state.students.filter(p=>people.has(p.id));}
 state.requests.forEach(q=>{delete q.createdByUid;});
 return {version:1,state,rights,notices:visibleNotices(data,actor,now),alerts:actor.director?operational(data,now):[]};
}
function calendar(data,actor,year,now){
 if(typeof year!=='string'||!/^[1-9]\d{3}$/.test(year))error('Selecciona un año válido.');
 date(year+'-01-01');scope(data,actor);if(!actor.director)error('Solo el director puede consultar el calendario anual.');
 const dates=new Set([...arr(data.itinerarios).map(f=>iso(f.fecha)),...Object.keys(data.itinerary?.days||{})]);
 const days=[];
 for(const d of [...dates].filter(d=>d.startsWith(year+'-')).sort()){
  try{date(d);}catch{continue;}
  const count=stateFor(data,d,now).confirmed.length;
  if(count)days.push({date:d,count});
 }
 return {version:1,year,days};
}
module.exports={E,date,key,day,setup,stateFor,scope,view,calendar,apply,publish,publicationEmail,queueModifiedEmail,flushModifiedEmail,protect,reconcile,operational,visibleNotices,storeFlights,assertPilot};

