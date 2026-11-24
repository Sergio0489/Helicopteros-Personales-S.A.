'use strict';
const identityReview=require('./identity-review');
const identityMerge=require('./identity-merge');
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
function registrationLabel(data,value){const id=key(value),stored=Object.keys(data.fleet||{}).find(candidate=>key(candidate)===id);if(stored)return stored.replaceAll('_','-');return id==='HP1186'||!/^HP\d{4}$/.test(id)?id:id.replace(/^HP/,'HP-');}
const error=s=>{throw Error(s);};
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)error('Selecciona una fecha válida.');return value;}
function setup(data){return data.itinerary ||= {version:1,config:{},days:{},notices:[]};}
function day(data,d){date(d);const s=setup(data);s.days ||= {};return s.days[d] ||= {revision:0,nightEnabled:false,requests:[],held:[],cancelled:[],cancelledFlights:[],openSlots:[],published:false};}
function compareSpanishNames(a,b){const left=String(a||''),right=String(b||'');return left.localeCompare(right,'es',{sensitivity:'base'})||left.localeCompare(right,'es');}
function pilots(data){return arr(data.pilotos).map((p,i)=>({id:String(p.id||'legacy-pilot-'+i),name:p.nombre||p.name||'',categories:['Monomotor','Multimotor','Helicóptero'],valid:true})).sort((a,b)=>compareSpanishNames(a.name,b.name)||a.id.localeCompare(b.id));}
function hasPendingNoShow(student){return arr(student?.expenses).some(e=>e?.noShowId&&!e.voidedAt&&!e.acceptance?.acceptedAt);}
function students(data){return [...arr(data.school?.students).map(p=>({id:'student:'+p.id,name:p.name,kind:'student',blockedForFlights:hasPendingNoShow(p)})),...arr(data.school?.registry?.clients).map(p=>({id:'client:'+p.id,name:p.name,kind:'client',blockedForFlights:false}))].sort((a,b)=>compareSpanishNames(a.name,b.name)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));}
function personNameKey(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
function identityKey(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,'');}
function validInternationalPhone(value){const raw=String(value||'').trim();return /^[+0-9().\s-]+$/.test(raw)&&/^\+?\d{7,15}$/.test(raw.replace(/[().\s-]/g,''));}
function resolvePerson(data,input,actor,actionId,now){
 const submitted=String(input?.studentName||'').trim().replace(/\s+/g,' '),studentId=String(input?.studentId||''),normalized=personNameKey(submitted);
 if(submitted.length>120)error('Escribe el nombre completo del estudiante o cliente (máximo 120 caracteres).');
 let person=null;
 const all=[...arr(data.school?.students).map(record=>({kind:'student',record})),...arr(data.school?.registry?.clients).map(record=>({kind:'client',record}))];
 if(studentId){
  const split=studentId.indexOf(':'),kind=studentId.slice(0,split),id=studentId.slice(split+1);
  person=all.find(row=>row.kind===kind&&String(row.record.id)===id)||null;
  if(!person)error('El expediente seleccionado ya no existe. Actualiza la página y vuelve a elegirlo.');
 }else{
  if(!normalized)error('Escribe el nombre completo del estudiante o cliente.');
  const matches=all.filter(row=>personNameKey(row.record.name)===normalized);
  if(matches.length>1)error('Hay más de un expediente con ese nombre. Selecciona uno de la lista.');
  if(matches.length)person=matches[0];
 }
 if(person){
  const canonicalName=String(person.record.name||'').trim();
  if(!canonicalName||canonicalName.length>120)error('El expediente seleccionado no tiene un nombre válido.');
  if(submitted&&personNameKey(canonicalName)!==normalized)error('El nombre no coincide con el expediente seleccionado.');
  if(person.record.identity&&input.personIdentity&&identityKey(person.record.identity)!==identityKey(input.personIdentity))error('La cédula no coincide con el expediente seleccionado.');
  return {studentId:person.kind+':'+person.record.id,personName:canonicalName,socioName:input.flightType==='socio'?canonicalName:String(input.socioName||'').trim()};
 }
 if(!submitted||submitted.length>120)error('Escribe el nombre completo (máximo 120 caracteres).');
 const kind=String(input.newPersonKind||'');
 if(!['student','client'].includes(kind))error('Selecciona si el expediente nuevo será de estudiante o cliente.');
 const identity=String(input.personIdentity||'').trim(),email=String(input.personEmail||'').trim().toLowerCase(),phone=String(input.personPhone||'').trim();
 if(!identity||identity.length>40)error('Escribe la cédula del estudiante o cliente (máximo 40 caracteres).');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)error('Escribe un correo válido (máximo 200 caracteres).');
 if(!validInternationalPhone(phone))error('Escribe un celular válido de Panamá o del extranjero, con 7 a 15 dígitos.');
 const identityValue=identityKey(identity),records=[...arr(data.school?.students).map(record=>({kind:'student',record})),...arr(data.school?.registry?.clients).map(record=>({kind:'client',record})),...arr(data.school?.personnel).map(record=>({kind:'personnel',record})),...arr(data.pilotos).map(record=>({kind:'pilot',record}))],identityMatches=records.filter(row=>identityKey(row.record.identity)===identityValue);
 if(identityMatches.some(row=>['student','client'].includes(row.kind)))error('Ya existe un expediente de estudiante o cliente con esa cédula. Busca el nombre registrado.');
 for(const row of identityMatches){const existingName=row.record.nombre||row.record.name||'';if(personNameKey(existingName)!==normalized)error('La cédula ya pertenece a otro expediente con un nombre distinto. Dirección debe revisar la coincidencia.');const existingEmail=String(row.record.email||'').trim().toLowerCase(),existingPhone=String(row.record.celular||row.record.phone||'').trim();if(existingEmail&&existingEmail!==email||existingPhone&&existingPhone!==phone)error('Los datos de contacto no coinciden con el expediente existente. Dirección debe revisar la coincidencia.');}
 const before=copy(data),id='itinerary-person-'+hash([actor.user.uid,actionId,kind,identityValue]);
 data.school ||= {};data.school.registry ||= {clients:[],entries:[]};
 const createdDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const canonicalName=String(identityMatches[0]?.record.nombre||identityMatches[0]?.record.name||submitted).trim(),record={id,name:canonicalName,identity,email,phone,createdAt:now,createdDate};
 for(const row of identityMatches){if(!row.record.email)row.record.email=email;const phoneField=['pilot','personnel'].includes(row.kind)?'celular':'phone';if(!row.record[phoneField])row.record[phoneField]=phone;}
 if(kind==='student'){data.school.students ||= [];Object.assign(record,{courses:[],stage:'Interesado'});data.school.students.push(record);}
 else{data.school.registry.clients ||= [];data.school.registry.clients.push(record);}
 const linkedRecords=identityMatches.filter(row=>row.record.id).map(row=>({kind:row.kind,id:String(row.record.id)}));
 if(linkedRecords.length){
  data.school.identityLinks ||= {};
  const entries=Object.entries(data.school.identityLinks).filter(([,link])=>(link.records||[]).some(ref=>linkedRecords.some(found=>found.kind===ref.kind&&found.id===ref.id)));
  if(entries.length>1)error('Hay varias vinculaciones para esta identidad. Dirección debe unificarlas antes de crear el expediente.');
  const linkId=entries[0]?.[0]||'person-itinerary-'+hash(identityValue);if(!entries.length&&data.school.identityLinks[linkId])error('La identidad ya tiene una vinculación que Dirección debe revisar.');const link=entries[0]?.[1]||(data.school.identityLinks[linkId]={records:[]});
  for(const ref of [...linkedRecords,{kind,id}])if(!link.records.some(old=>old.kind===ref.kind&&old.id===ref.id))link.records.push(ref);
 }
 identityMerge.assertUnique(before,data);
 return {studentId:kind+':'+id,personName:canonicalName,socioName:input.flightType==='socio'?canonicalName:String(input.socioName||'').trim()};
}
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
function itineraryPeriod(dateValue,mode){
 const [year,month,day]=dateValue.split('-').map(Number),stamp=(offset,dayOfMonth)=>new Date(Date.UTC(year,month-1+offset,dayOfMonth)).toISOString().slice(0,10);
 if(mode==='month')return {start:stamp(0,1),end:stamp(1,0)};
 if(day<=10)return {start:stamp(-1,26),end:stamp(0,10)};
 if(day<=25)return {start:stamp(0,11),end:stamp(0,25)};
 return {start:stamp(0,26),end:stamp(1,10)};
}
function pilotScheduleMinutes(data,dateValue,ps,mode){
 const period=itineraryPeriod(dateValue,mode),totals=new Map(ps.map(p=>[p.id,0])),prior=new Map(ps.map(p=>[p.id,0]));
 const byName=new Map(ps.map(p=>[pilotNameKey(p.name),p.id]));
 for(const flight of arr(data.itinerarios)){
  const flightDate=iso(flight.fecha);if(!flightDate||flightDate<period.start||flightDate>dateValue)continue;
  const rawId=flight.schedule?.pilot||flight.pilotId,pilotId=totals.has(rawId)?rawId:byName.get(pilotNameKey(flight.piloto));
  if(!totals.has(pilotId))continue;
  const start=E.minutes(flight.horaInicio||flight.hora||flight.schedule?.start),end=E.minutes(flight.horaFin||flight.schedule?.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  const value=end-start;totals.set(pilotId,totals.get(pilotId)+value);if(flightDate<dateValue)prior.set(pilotId,prior.get(pilotId)+value);
 }
 return {period,totals,prior};
}
function inspectionPlanning(aircraft,dateValue){
 if(!aircraft||typeof aircraft!=='object')return null;
 const read=(field,alias)=>{const raw=aircraft[field]==null||aircraft[field]===''?aircraft[alias]:aircraft[field],value=Number(raw);return Number.isFinite(value)&&value>=0?value:null;};
 const accumulated50=read('horas_acum_50','horas_totales'),accumulated100=read('horas_acum_100','horas_limite');
 if(accumulated50===null||accumulated100===null)return null;
 const sums=Array(7).fill(0),observations=Array(7).fill(0),dayHours=new Map(),logs=Array.isArray(aircraft.bitacora_horas)?aircraft.bitacora_horas:Object.values(aircraft.bitacora_horas||{});
 for(const log of logs){const logged=iso(log?.fecha),hours=Number(log?.hv);if(!logged||!Number.isFinite(hours)||hours<=0||logged>=dateValue)continue;dayHours.set(logged,(dayHours.get(logged)||0)+hours);}
 const target=Date.parse(dateValue+'T12:00:00Z');if(!Number.isFinite(target))return null;
 for(let offset=1;offset<=56;offset++){
  const stamp=new Date(target-offset*DAY_MS),key=stamp.toISOString().slice(0,10),weekday=stamp.getUTCDay();
  sums[weekday]+=dayHours.get(key)||0;observations[weekday]++;
 }
 const weekdayHours=sums.map((value,index)=>observations[index]?value/observations[index]:0);
 if(!weekdayHours.some(value=>value>0))return null;
 return {remaining50:Math.max(0,50-accumulated50),remaining100:Math.max(0,100-accumulated100),weekdayHours};
}
function stateFor(data,d,now){
 date(d);const config=data.itinerary?.config||{},stored=data.itinerary?.days?.[d]||{},ps=pilots(data),scheduleWindow=stored.scheduleWindow==null?null:copy(stored.scheduleWindow);
 if(scheduleWindow!==null&&(!scheduleWindow||typeof scheduleWindow!=='object'||Array.isArray(scheduleWindow)||!E.validWindow(scheduleWindow)))error('El rango horario guardado para esta fecha no es válido.');
 const savedPriorities=config.prioritySettings||{},hourPeriod=savedPriorities.hourPeriod==='month'?'month':'honorarios',hourPeriods={honorarios:pilotScheduleMinutes(data,d,ps,'honorarios'),month:pilotScheduleMinutes(data,d,ps,'month')};
 for(const p of ps){p.periodMinutesHonorarios=hourPeriods.honorarios.totals.get(p.id)||0;p.periodPriorMinutesHonorarios=hourPeriods.honorarios.prior.get(p.id)||0;p.periodMinutesMonth=hourPeriods.month.totals.get(p.id)||0;p.periodPriorMinutesMonth=hourPeriods.month.prior.get(p.id)||0;}
 const pilotIds=ps.map(p=>p.id),configuredOrder=arr(savedPriorities.pilotOrder).filter(id=>pilotIds.includes(id)),prioritySettings={aircraftMode:savedPriorities.aircraftMode==='priority'?'priority':'balanced',pilotMode:savedPriorities.pilotMode==='manual'?'manual':'hours',hourPeriod,pilotOrder:[...configuredOrder,...pilotIds.filter(id=>!configuredOrder.includes(id))]};
 const aircraft=E.fleet.map(([id,model,category,color],i)=>{const entry=Object.entries(data.fleet||{}).find(([k])=>key(k)===id),ac=config.aircraft?.[id]||{},order=config.aircraftOrder||[];return {id,registration:entry?.[0].replaceAll('_','-')||(id==='HP1186'?id:id.replace(/^HP/,'HP-')),model,category,color,status:status(entry?.[1]?.status),rank:order.includes(id)?order.indexOf(id)+1:i+1,idleDays:idleDays(data,id,d),inspectionPlan:inspectionPlanning(entry?.[1],d),pilots:arr(ac.pilots),slots:copy(stored.blocks?.[id]||ac.slots||E.slots),night:!!stored.nightEnabled,release:stored.releases?.[id],scheduleWindow:scheduleWindow&&category==='Monomotor'?copy(scheduleWindow):null};});
 const confirmed=[...arr(data.itinerarios).filter(f=>iso(f.fecha)===d).map(f=>fromFlight(f,ps)),...copy(arr(stored.held)).map(q=>({...q,publicationStatus:'held'}))];
 const defaults=E.defaultTypeRules();if(config.aircraftOrder)for(const type of ['privado','xc','maniobras'])defaults[type]=copy(config.aircraftOrder);
 const typeRules={...defaults,...copy(config.typeRules||{})};
 return {date:d,now,published:!!stored.published,nightEnabled:!!stored.nightEnabled,scheduleWindow:scheduleWindow?copy(scheduleWindow):null,pilotHoursRange:hourPeriods[hourPeriod].period,pilotHoursRanges:{honorarios:hourPeriods.honorarios.period,month:hourPeriods.month.period},prioritySettings,aircraft,pilots:ps,students:students(data),typeRules,requests:copy(arr(stored.requests)),confirmed,cancelled:copy(arr(stored.cancelled)),cancelledFlights:copy(arr(stored.cancelledFlights)),openSlots:copy(arr(stored.openSlots)),maxBlocks:0,revision:stored.revision||0,configurationRevision:config.revision||0,lastResults:copy(arr(stored.results)),assignmentAircraftIds:!stored.published&&Array.isArray(stored.draftPlan?.operationalAircraftIds)?copy(stored.draftPlan.operationalAircraftIds):null,draftPlan:stored.draftPlan&&!stored.published?copy(stored.draftPlan):null};
}
function scope(data,actor){
 if(identityReview.pending(actor.account))error(identityReview.message);
 if(!actor.user?.emailVerified||actor.user.disabled||actor.account?.mergedInto)error('Verifica el correo e inicia sesión con una cuenta activa.');
 const linked=arr(data.pilotos).map((p,i)=>({...p,id:String(p.id||'legacy-pilot-'+i)})).filter(p=>p.authUid===actor.user.uid||!p.authUid&&String(p.email||'').trim().toLowerCase()===actor.user.email.toLowerCase());
 const pilot=linked.length===1?linked[0].id:null;
 if(actor.director)return {role:'director',view:true,request:false,create:true,edit:true,settings:true,pilot};
 const p=policyFor(data,actor.account),box=id=>permissions(p,'itinerario',id);
 const view=['planner','calendar','flights','create','requests'].some(id=>box(id).view);
 const role=actor.account?.role==='Piloto'?'pilot':actor.account?.role==='Administrativo'?'admin':'reader';
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
 return {...original,id:q.id,fecha:state.date,aeronave:ac?.registration||q.aircraft,piloto:pilot?.name||original?.piloto||'',estudiante:person?.name||'',personId:person?parts.join(':'):'',personKind:person?kind:'',horaInicio:q.start,horaFin:q.end,tipo:E.flightTypeLabel(E.typeOf(q),q.aircraft),observaciones:q.note||'',ruta:q.route||'',schedule};
}
function storeFlights(data,state){
 for(const q of state.confirmed.filter(q=>!q.legacy)){try{assertPilot(data,q,state.date,state.now);if(!q.operationalHold)delete q.validationHold;}catch(e){q.validationHold=e.message;}}
 const d=day(data,state.date),old=arr(data.itinerarios),night=E.nightPublication(state,state.confirmed.filter(q=>!q.validationHold)),held=new Set([...night.blockedIds.filter(id=>!state.confirmed.find(q=>q.id===id)?.legacy),...state.confirmed.filter(q=>q.validationHold).map(q=>q.id)]);
 d.held=state.confirmed.filter(q=>held.has(q.id));
 data.itinerarios=[...old.filter(f=>iso(f.fecha)!==state.date),...state.confirmed.filter(q=>!held.has(q.id)).map(q=>{const original=old.find(f=>legacyId(f)===q.id);return q.legacy&&original&&eq(fromFlight(original,state.pilots),q)?original:toFlight(q,state,original);})];
 return night;
}
function notice(data,event,now,id){if(!event)return;const s=setup(data);s.notices ||= [];if(s.notices.some(n=>n.id===id))return;s.notices.push({...copy(event),id,createdAt:now});s.notices=s.notices.slice(-500);}
function changeNotice(data,before,after,published,now,id,all=false){const n=E.publishedChange(before,after,published);if(n){if(all)n.recipients=[{kind:'group',id:'all'}];notice(data,n,now,id);}}
function cleanFlight(input,id,now){
 if(!input||typeof input!=='object'||Array.isArray(input))error('Vuelo no válido.');
 for(const [field,label,max]of [['aircraft','Aeronave',40],['pilot','Piloto',200],['start','Hora de inicio',5],['end','Hora de culminación',5],['flightType','Tipo de vuelo',40],['route','Ruta o destino',200]]){
  if(typeof input[field]!=='string'||!input[field].trim())error('Completa el campo '+label+'.');
  if(input[field].trim().length>max)error(label+': máximo '+max+' caracteres.');
 }
 const routeProblem=E.routeError(input.route);if(routeProblem)error(routeProblem);
 if(input.note!=null&&(typeof input.note!=='string'||input.note.trim().length>1000))error('Observaciones: máximo 1000 caracteres.');
 if(!Object.hasOwn(E.flightTypes,input.flightType))error('Vuelo no válido.');
 const flight={id,aircraft:key(input.aircraft),pilot:String(input.pilot||''),studentId:String(input.studentId||''),studentName:String(input.studentName||input.personName||'').trim().replace(/\s+/g,' ').slice(0,120),start:String(input.start||''),end:String(input.end||''),slot:String(input.slot||'b1'),flightType:String(input.flightType||'privado'),socioName:String(input.socioName||'').trim().slice(0,120),route:E.normalizeRoute(input.route),note:String(input.note||'').trim().slice(0,1000),created:Date.parse(now)};
 if(input.flightType==='examen')flight.delegationNumber=String(input.delegationNumber||'').trim();
 return flight;
}
function checkExpected(d,body){if(body.revision!==d.revision)error('El horario cambió. Actualiza y revisa antes de volver a guardar.');}
function publicationEmail(data,dateValue){
 const scheduled=arr(data.itinerarios).filter(f=>iso(f.fecha)===dateValue).map(f=>{const entry=Object.entries(data.fleet||{}).find(([id])=>key(id)===key(f.aeronave));return {aircraft:f.aeronave||'',model:E.fleet.find(x=>x[0]===key(f.aeronave))?.[1]||'',aircraftStatus:status(entry?.[1]?.status),relocationFrom:f.schedule?.relocation?.from?registrationLabel(data,f.schedule.relocation.from):'',pilot:f.piloto||'',student:f.estudiante||'',start:f.horaInicio||f.hora||'',end:f.horaFin||'',type:f.tipo||f.schedule?.flightType||'Privado',route:f.ruta||'',notes:f.observaciones||''};}).sort((a,b)=>E.fleet.findIndex(x=>x[0]===key(a.aircraft))-E.fleet.findIndex(x=>x[0]===key(b.aircraft))||a.start.localeCompare(b.start));
 const mechanicRecipients=arr(data.school?.personnel).filter(p=>['mecanico','mecanica','mechanic','mechanics'].includes(String(p.position||p.role||p.cargo||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').trim())).map(p=>p.email||'').filter(Boolean);
 return {id:'publication-'+dateValue,date:dateValue,publishedAt:data.itinerary?.days?.[dateValue]?.publishedAt||'',pilotRecipients:arr(data.pilotos).map(p=>p.email||'').filter(Boolean),mechanicRecipients,flights:scheduled};
}
function relocateFixedFlights(state,now){
 const displaced=[];
 for(const q of state.confirmed){
  const a=state.aircraft.find(a=>a.id===q.aircraft);
  if(!E.assignmentEligible(a,state)&&!(q.restoredAfterCutoff===a?.id&&a?.status==='operativo')){
   q.operationalHold=true;q.publicationStatus='held';q.validationHold=E.typeOf(q)==='charter'?'No se publica automáticamente: los vuelos chárter conservan su aeronave y requieren revisión manual de Dirección.':'No se publica: '+q.aircraft+' no estaba operativa a las 8:00 p. m. o ahora no está operativa.';q.relocationPending=true;displaced.push(copy(q));
  }else if(q.operationalHold){delete q.operationalHold;delete q.validationHold;delete q.relocationPending;if(q.publicationStatus==='held')delete q.publicationStatus;}
 }
 // Move flights with fewer eligible alternatives first so flexible flights do
 // not consume the only aircraft that can take a constrained flight.
 displaced.sort((a,b)=>{
  const alternatives=q=>E.typeOf(q)==='charter'?0:E.allowedForType(state,E.typeOf(q)).filter(id=>id!==q.aircraft&&E.assignmentEligible(state.aircraft.find(a=>a.id===id),state)&&E.compatible(state,q,state.aircraft.find(a=>a.id===id))).length;
  return alternatives(a)-alternatives(b)||E.minutes(a.start)-E.minutes(b.start)||String(a.id).localeCompare(String(b.id));
 });
 let relocated=0;
 for(const original of displaced){
  if(E.typeOf(original)==='charter')continue;
  const options=E.allowedForType(state,E.typeOf(original)).map(id=>state.aircraft.find(a=>a.id===id)).filter(a=>a&&a.id!==original.aircraft&&E.assignmentEligible(a,state)&&E.compatible(state,original,a));
  let replacement=null;
  for(const aircraft of options){
   const candidate={...copy(original),aircraft:aircraft.id,operationalHold:false};
   const reason=E.directorFlightError(state,candidate,original.id,'director');
   if(!reason&&E.covers(aircraft,candidate,state.date)){replacement=candidate;break;}
  }
  if(!replacement)continue;
  const from=original.relocation?.from||original.aircraft,reason='Reubicado automáticamente desde '+from+': la aeronave no estaba operativa al cierre de las 8:00 p. m.';
  replacement.fixed=true;replacement.conditional=false;replacement.reason=reason;replacement.relocation={from,to:replacement.aircraft,at:now,reason,cause:'maintenance-cutoff'};
  replacement.relocationHistory=[...(replacement.relocationHistory||[]),{from,to:replacement.aircraft,at:now,reason}];
  delete replacement.operationalHold;delete replacement.validationHold;delete replacement.relocationPending;delete replacement.publicationStatus;
  const index=state.confirmed.findIndex(q=>q.id===original.id);if(index>=0)state.confirmed[index]=replacement;
  relocated++;
 }
 return {held:state.confirmed.filter(q=>q.operationalHold),relocated};
}
function calculatedDraftPlan(data,dateValue,now,baseAssignments=[],removedFlightIds=[],baseFlightIds=null,operationalAircraftIds=null,operationalSnapshotAt=null){
 const state=stateFor(data,dateValue,now),warnings=[],baseline=Array.isArray(baseFlightIds)?copy(baseFlightIds):state.confirmed.filter(q=>q.fixed).map(q=>q.id),removed=new Set(arr(removedFlightIds));
 const cutoffAircraft=Array.isArray(operationalAircraftIds)?copy(operationalAircraftIds):state.aircraft.filter(a=>a.status==='operativo').map(a=>a.id),snapshotAt=operationalSnapshotAt||now;state.assignmentAircraftIds=cutoffAircraft;
 state.confirmed=state.confirmed.filter(q=>!removed.has(q.id));
 for(const q of baseAssignments)if(q?.fixed){const index=state.confirmed.findIndex(current=>current.id===q.id);if(index>=0)state.confirmed[index]=copy(q);else state.confirmed.push(copy(q));}
 state.pilots.forEach(p=>{try{for(const q of [...state.requests,...state.confirmed].filter(q=>q.pilot===p.id))assertPilot(data,q,dateValue,now);}catch{p.valid=false;}});
 const {held:cutoffHeld,relocated}=relocateFixedFlights(state,now);
 const result=E.simulate(state);result.assignments.push(...cutoffHeld.map(copy));
 const outside=result.assignments.find(q=>{const a=state.aircraft.find(a=>a.id===q.aircraft);return !q.operationalHold&&(E.operatingHoursError(q)||E.scheduleWindowError(a,q)||a?.release?.enabled&&a.release.date===dateValue&&!E.covers(a,q,dateValue));});
 if(outside)warnings.push('Al menos un vuelo quedaría fuera del horario permitido o de la disponibilidad prevista; corrígelo antes de publicar.');
 if(relocated)warnings.push(relocated+' vuelo(s) previamente agendado(s) se reubicaron automáticamente a aeronaves operativas compatibles, conservando piloto y horario. Dirección puede revisar o editar esos cambios en el borrador.');
 if(cutoffHeld.length)warnings.push(cutoffHeld.length+' vuelo(s) previamente agendado(s) no pudieron reubicarse automáticamente en una aeronave operativa compatible y libre; quedarán sin publicar hasta que Dirección los revise o reubique antes de las 8:15 p. m.');
 const unresolved=result.results.filter(row=>['review','waiting'].includes(row.status));
 if(unresolved.length){const labels=unresolved.map(row=>(state.pilots.find(p=>p.id===row.pilot)?.name||'Piloto')+' · '+(row.aircraft||'sin aeronave')+' · '+row.start+'–'+row.end);warnings.push(unresolved.length+' solicitud(es) aún no tienen asignación confirmada: '+labels.join('; ')+'. Dirección debe resolverlas o eliminarlas antes de publicar.');}
 const unusual=result.assignments.filter(q=>!q.operationalHold&&E.operatingHoursWarning(q));if(unusual.length)warnings.push('Alerta: '+unusual.map(q=>(state.pilots.find(p=>p.id===q.pilot)?.name||'Piloto')+' · '+q.aircraft+' · '+q.start+'–'+q.end).join('; ')+'. El horario habitual es 6:30 a. m.–6:30 p. m.; confirma que cada vuelo nocturno esté habilitado.');
 const activeAssignments=result.assignments.filter(q=>!q.operationalHold),collisionState={...state,confirmed:activeAssignments,requests:[],cancelled:[]},studentCollision=activeAssignments.find(q=>E.studentConflicts(collisionState,q).length);
 if(studentCollision){const name=state.students.find(p=>p.id===studentCollision.studentId)?.name||'Un estudiante';warnings.push(name+' tiene vuelos propuestos que se cruzan. Corrige el borrador antes de las 8:15 p. m.');}
 const assignments=result.assignments.map(q=>({...q,id:q.fixed?q.id:'scheduled-'+q.id,sourceRequestId:q.sourceRequestId||(!q.fixed?q.id:undefined)}));
 const savedAssignments=JSON.parse(JSON.stringify(assignments)),previewData=copy(data),previewState=stateFor(previewData,dateValue,now);
 previewState.confirmed=copy(savedAssignments);previewState.lastResults=copy(result.results);previewState.published=true;storeFlights(previewData,previewState);
 const email=publicationEmail(previewData,dateValue);email.id='draft-'+dateValue;email.action='draft';email.draft=true;email.publishedAt='';email.draftedAt=now;email.pilotRecipients=[];email.mechanicRecipients=[];email.draftWarnings=warnings;
 return {plan:{date:dateValue,createdAt:now,updatedAt:now,sourceRevision:state.revision,revision:1,assignments:savedAssignments,results:copy(result.results),warnings,baseFlightIds:baseline,removedFlightIds:[...removed],operationalAircraftIds:cutoffAircraft,operationalSnapshotAt:snapshotAt},email};
}
function createDraftPlan(data,dateValue,now){
 const d=day(data,dateValue);if(d.published||d.draftPlan)return null;
 const calculated=calculatedDraftPlan(data,dateValue,now);d.draftPlan=calculated.plan;return calculated.email;
}
function restoreCutoffRelocations(state,assignments,cutoffAircraftIds,now){
 const cutoff=new Set(arr(cutoffAircraftIds)),next=copy(assignments),restored=[],reviewed=[];
 for(const aircraft of state.aircraft.filter(a=>a.status==='operativo'&&!cutoff.has(a.id))){
  const ids=new Set(next.filter(q=>q.relocation?.cause==='maintenance-cutoff'&&q.relocation.from===aircraft.id).map(q=>q.id));
  if(!ids.size)continue;
  const working={...state,published:true,confirmed:next.map(q=>{const flight=copy(q);if(!ids.has(q.id)){delete flight.relocation;delete flight.relocationOrigin;}return flight;})};
  const result=E.restorePublished(working,aircraft.id,'mantenimiento',now),resultById=new Map(result.flights.map(q=>[q.id,q])),restoredIds=new Set(result.changes.filter(change=>change.kind==='restored').map(change=>change.after.id));
  for(let index=0;index<next.length;index++){
   const q=next[index];if(!ids.has(q.id))continue;
   const flight=resultById.get(q.id);if(!flight)continue;
   const change=result.changes.find(change=>change.after.id===q.id);if(change?.kind==='restored'){flight.restoredAfterCutoff=aircraft.id;restored.push(q.id);}else if(change?.kind==='review')reviewed.push(q.id);
   next[index]=flight;
  }
 }
 return {assignments:next,restored:[...new Set(restored)],reviewed:[...new Set(reviewed)]};
}
function recalculateDraftPlan(data,d,dateValue,now){
 if(!d.draftPlan||d.published)return;
 const current=d.draftPlan,base=arr(current.assignments).filter(q=>q.fixed),baseline=Array.isArray(current.baseFlightIds)?current.baseFlightIds:stateFor(data,dateValue,now).confirmed.filter(q=>q.fixed).map(q=>q.id),removed=Array.isArray(current.removedFlightIds)?current.removedFlightIds:baseline.filter(id=>!current.assignments.some(q=>q.id===id)),calculated=calculatedDraftPlan(data,dateValue,now,base,removed,baseline,current.operationalAircraftIds,current.operationalSnapshotAt).plan;
 const restored=restoreCutoffRelocations(stateFor(data,dateValue,now),calculated.assignments,current.operationalAircraftIds,now),warnings=copy(calculated.warnings);
 if(restored.restored.length)warnings.push(restored.restored.length+' vuelo'+(restored.restored.length===1?' volvió':'s volvieron')+' a su aeronave original al restablecerse sus operaciones antes de la publicación.');
 if(restored.reviewed.length)warnings.push(restored.reviewed.length+' vuelo'+(restored.reviewed.length===1?' requiere':'s requieren')+' revisión: la aeronave original volvió a operar, pero no había un espacio libre compatible para restaurar ese horario.');
 d.draftPlan={...calculated,assignments:restored.assignments,warnings,createdAt:current.createdAt||calculated.createdAt,updatedAt:now,revision:(current.revision||0)+1};
}
function refreshDraftPlan(data,d,dateValue,assignments,now){
 if(!d.draftPlan)return;
 const current=d.draftPlan,baseline=Array.isArray(current.baseFlightIds)?current.baseFlightIds:stateFor(data,dateValue,now).confirmed.filter(q=>q.fixed).map(q=>q.id),removed=new Set(Array.isArray(current.removedFlightIds)?current.removedFlightIds:baseline.filter(id=>!current.assignments.some(q=>q.id===id))),keptFixed=new Set(assignments.filter(q=>q.fixed).map(q=>q.id));
 for(const id of baseline)if(!keptFixed.has(id))removed.add(id);
 const byRequest=new Map(assignments.filter(q=>q.sourceRequestId).map(q=>[q.sourceRequestId,q]));
 d.draftPlan.results=arr(d.draftPlan.results).map(row=>{
  const flight=byRequest.get(row.id);
  if(flight)return {...row,pilot:flight.pilot,start:flight.start,end:flight.end,assignedAircraft:flight.aircraft,status:'assigned',reason:flight.reason||'Ajustado por Dirección en el borrador.'};
  if(row.status==='assigned'){const next={...row,status:'review',reason:'Vuelo retirado del borrador por Dirección.'};delete next.assignedAircraft;return next;}
  return row;
 });
 d.draftPlan.assignments=copy(assignments);d.draftPlan.baseFlightIds=copy(baseline);d.draftPlan.removedFlightIds=[...removed];d.draftPlan.updatedAt=now;d.draftPlan.revision=(d.draftPlan.revision||0)+1;
}
function publish(data,dateValue,now){
 const d=day(data,dateValue);if(d.published)return false;
 if(!d.draftPlan)d.draftPlan=calculatedDraftPlan(data,dateValue,now).plan;
 const state=stateFor(data,dateValue,now);state.confirmed=copy(d.draftPlan.assignments);state.lastResults=copy(d.draftPlan.results);
 const cutoffAircraft=arr(d.draftPlan.operationalAircraftIds),ineligible=state.confirmed.find(q=>{const a=state.aircraft.find(a=>a.id===q.aircraft);return !q.operationalHold&&(!cutoffAircraft.includes(q.aircraft)&&q.restoredAfterCutoff!==q.aircraft||a?.status!=='operativo');});
 if(ineligible){const a=state.aircraft.find(a=>a.id===ineligible.aircraft),label=a?.status==='grounded'?'GROUNDED':a?.status==='mantenimiento'?'en mantenimiento':'no operativa';error('No se puede publicar: '+ineligible.aircraft+' está '+label+' o no estaba operativa al cierre de las 8:00 p. m. Retira o reasigna ese vuelo en el borrador.');}
 const outside=state.confirmed.find(q=>{const a=state.aircraft.find(a=>a.id===q.aircraft);return !q.operationalHold&&(E.operatingHoursError(q)||E.scheduleWindowError(a,q)||a?.release?.enabled&&a.release.date===dateValue&&!E.covers(a,q,dateValue));});
 if(outside)error('No se puede publicar: '+(state.pilots.find(p=>p.id===outside.pilot)?.name||'Un piloto')+' quedaría fuera de 6:30 a. m.–8:00 p. m., del horario permitido o de la disponibilidad prevista.');
 const activeAssignments=state.confirmed.filter(q=>!q.operationalHold),collisionState={...state,confirmed:activeAssignments,requests:[],cancelled:[]},studentCollision=activeAssignments.find(q=>E.studentConflicts(collisionState,q).length);
 if(studentCollision){const name=state.students.find(p=>p.id===studentCollision.studentId)?.name||'un estudiante';error('No se puede publicar: '+name+' tiene vuelos asignados que se cruzan. Corrige la programación antes de publicar.');}
 for(const q of state.confirmed)delete q.restoredAfterCutoff;d.draftPlan.assignments=copy(state.confirmed);d.published=true;d.publishedAt=now;d.results=copy(d.draftPlan.results);d.revision++;state.published=true;storeFlights(data,state);notice(data,E.publicationNotice(state),now,'publication:'+dateValue);return true;
}
function previewPublicationEmail(data,dateValue,now){
 if(day(data,dateValue).published)return null;
 return calculatedDraftPlan(data,dateValue,now).email;
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
 const state=stateFor(data,dte,now),before=copy(state.confirmed);let emailPublication=null,actionWarning='';
 const requireDirector=()=>{if(!rights.settings)error('Solo un director puede realizar esta operación.');};
 if(action==='settings'){
  requireDirector();validateDateRange(dte,now);const c=setup(data).config ||= {};
  if((body.configurationRevision||0)!==(c.revision||0))error('Las prioridades cambiaron. Actualiza antes de guardar.');c.revision=(c.revision||0)+1;
  if(Object.hasOwn(body,'scheduleWindow')){
   const next=body.scheduleWindow===null?null:body.scheduleWindow;
   if(next!==null&&(!next||typeof next!=='object'||Array.isArray(next)||!E.validWindow(next)))error('Elige una hora inicial anterior a la hora final.');
   if(next!==null&&E.minutes(next.end)-E.minutes(next.start)<E.MIN_ASSIGNMENT_MINUTES)error('El rango debe permitir vuelos de al menos 1 hora y 30 minutos.');
   const normalized=next===null?null:{start:next.start,end:next.end},changed=JSON.stringify(state.scheduleWindow||null)!==JSON.stringify(normalized);
   if(d.published&&changed)error('El horario del día no se puede cambiar después de publicarlo.');
   if(normalized){
    const start=E.minutes(normalized.start),end=E.minutes(normalized.end);
    if(state.confirmed.some(q=>state.aircraft.find(a=>a.id===q.aircraft)?.category==='Monomotor'&&(E.minutes(q.start)<start||E.minutes(q.end)>end)))error('Hay vuelos monomotor ya confirmados fuera del nuevo rango. Revisa esos vuelos antes de cambiarlo.');
    d.scheduleWindow=normalized;
   }else delete d.scheduleWindow;
  }
  if(typeof body.nightEnabled==='boolean')d.nightEnabled=body.nightEnabled;
  if(body.aircraftOrder){const known=state.aircraft.filter(a=>a.category==='Monomotor').map(a=>a.id);if(!Array.isArray(body.aircraftOrder)||body.aircraftOrder.length!==known.length||new Set(body.aircraftOrder).size!==known.length||body.aircraftOrder.some(id=>!known.includes(id)))error('Revisa el orden de monomotores.');c.aircraftOrder=copy(body.aircraftOrder);}
  if(body.typeRules){for(const [type,ids]of Object.entries(body.typeRules)){if(!Object.hasOwn(E.flightTypes,type))error('Tipo de vuelo no válido.');const allowed=E.typeConfigAircraft(state,type).map(a=>a.id);if(!Array.isArray(ids)||ids.length>11||new Set(ids).size!==ids.length||ids.some(id=>!allowed.includes(id)))error('Revisa las aeronaves de cada tipo.');}(c.typeRules ||= copy(state.typeRules));Object.assign(c.typeRules,copy(body.typeRules));}
  if(body.prioritySettings){const settings=body.prioritySettings,pilotIds=state.pilots.map(p=>p.id);if(!settings||!['balanced','priority'].includes(settings.aircraftMode)||!['hours','manual'].includes(settings.pilotMode)||!['honorarios','month'].includes(settings.hourPeriod)||!Array.isArray(settings.pilotOrder)||settings.pilotOrder.length!==pilotIds.length||new Set(settings.pilotOrder).size!==pilotIds.length||settings.pilotOrder.some(id=>!pilotIds.includes(id)))error('Revisa las prioridades de aeronaves y pilotos.');c.prioritySettings={aircraftMode:settings.aircraftMode,pilotMode:settings.pilotMode,hourPeriod:settings.hourPeriod,pilotOrder:copy(settings.pilotOrder)};}
  if(body.aircraft){const id=key(body.aircraft),a=state.aircraft.find(a=>a.id===id);if(!a)error('Aeronave no válida.');c.aircraft ||= {};const ac=c.aircraft[id] ||= {};
   if(body.pilots){if(!Array.isArray(body.pilots)||new Set(body.pilots).size!==body.pilots.length||body.pilots.some(id=>!state.pilots.some(p=>p.id===id)))error('Selecciona pilotos existentes sin duplicados.');ac.pilots=copy(body.pilots);}
   if(body.slots){if(!Array.isArray(body.slots)||body.slots.length!==5||body.slots.some((s,i)=>s.id!=='b'+(i+1)))error('Se requieren los cinco bloques.');const reason=E.validateSlots(body.slots,true);if(reason)error(reason);d.blocks ||= {};d.blocks[id]=body.slots.map(({id,start,end})=>({id,start,end}));}
   if(body.release){const from=String(body.release.from||''),until=String(body.release.until||'18:30'),window={start:from,end:until};if(typeof body.release.enabled!=='boolean'||!E.validWindow(window)||body.release.enabled&&E.minutes(until)-E.minutes(from)<E.MIN_ASSIGNMENT_MINUTES)error('El horario de disponibilidad previsto requiere una hora inicial y final válidas, con al menos 1 hora y 30 minutos.');d.releases ||= {};d.releases[id]={enabled:body.release.enabled,from,until,date:dte};}
  }
  if(d.draftPlan&&!d.published)recalculateDraftPlan(data,d,dte,now);
  const fresh=stateFor(data,dte,now);storeFlights(data,fresh);
 }else if(action==='request'){
  if(!rights.request)error(rights.role==='pilot'&&!rights.pilot?'Vincula tu usuario con un expediente de piloto.':'El director debe habilitar «Solicitudes de vuelos» para tu cargo.');
  const old=d.requests.find(q=>q.id===body.id);if(body.id&&(!old||old.pilot!==rights.pilot||old.status==='approved'||d.cancelled.includes(old.id)))error('No puedes modificar esta solicitud.');
  const resolved=resolvePerson(data,body.flight,actor,body.actionId,now);state.students=students(data);
  let q=cleanFlight({...body.flight,...resolved,pilot:rights.pilot},old?.id||'request-'+body.actionId,now);q.pilot=rights.pilot;q.created=old?.created||q.created;q.createdByUid=actor.user.uid;
  q=E.normalizeRequest(state,q);const reason=E.requestError(state,q,{allowClosedEdit:!!old});if(reason)error(reason);assertPilot(data,q,dte,now);q.sourceSlots=E.sourceSnapshot(state.aircraft.find(a=>a.id===q.aircraft),q);
  const requestWarnings=[];
  if(E.studentConflicts(state,q).length)requestWarnings.push('Este estudiante ya tiene otro vuelo o solicitud en ese horario. La solicitud se guardó; Dirección ajustará el horario al publicar.');
  if(state.aircraft.find(a=>a.id===q.aircraft)?.status==='mantenimiento')requestWarnings.push('La aeronave seleccionada está en mantenimiento. La solicitud se guardó; al preparar y publicar el horario, Dirección solo podrá asignarla a una aeronave operativa.');
  actionWarning=requestWarnings.join(' ');
  d.requests=d.requests.filter(x=>x.id!==q.id);d.requests.push(q);if(d.draftPlan&&!d.published)recalculateDraftPlan(data,d,dte,now);
 }else if(action==='cancel-request'){
  const q=d.requests.find(q=>q.id===body.id);if(!q||q.status==='approved'||state.published)error('La solicitud ya fue aprobada o publicada.');
  if(!rights.settings&&(!rights.request||q.pilot!==rights.pilot))error('No puedes cancelar esta solicitud.');
  d.cancelled.push(q.id);q.status='cancelled';if(d.draftPlan&&!d.published)recalculateDraftPlan(data,d,dte,now);
 }else if(action==='approve'){
   requireDirector();const editingDraft=!!(!state.published&&d.draftPlan);if(editingDraft)state.confirmed=copy(d.draftPlan.assignments);
   const prepared=E.prepareApproval(state,body.id);if(prepared.error)error(prepared.error);assertPilot(data,prepared.flight,dte,now);
   const ac=state.aircraft.find(a=>a.id===prepared.flight.aircraft);if(ac.status!=='operativo'&&!body.acknowledge)error('Confirma la alerta de la aeronave no operativa.');
   state.confirmed.push(prepared.flight);const q=d.requests.find(q=>q.id===body.id);q.status='approved';q.approvedAt=now;q.approvedFlightId=prepared.flight.id;if(editingDraft)refreshDraftPlan(data,d,dte,state.confirmed,now);else storeFlights(data,state);
  }else if(action==='flight'){
   if(!rights.create)error('Este cargo no puede agendar vuelos.');validateDateRange(dte,now);
   const oldDate=body.originalDate?date(body.originalDate):dte,sourceDay=day(data,oldDate),source=stateFor(data,oldDate,now),draftSource=!!(sourceDay.draftPlan&&!sourceDay.published),editingDraft=!!(draftSource&&oldDate===dte&&d.draftPlan&&!d.published&&rights.settings);
   if(draftSource&&oldDate!==dte)error('Edita el vuelo del borrador en la misma fecha antes de publicarlo.');
   if(draftSource&&!rights.settings)error('Solo Dirección puede modificar el borrador.');
   const old=body.id?(editingDraft?sourceDay.draftPlan.assignments.find(q=>q.id===body.id):source.confirmed.find(q=>q.id===body.id)):null;
   if(body.id&&(!old||!rights.edit))error('Solo el director puede modificar este vuelo.');
   if(oldDate!==dte){checkExpected(day(data,oldDate),{revision:body.originalRevision});validateDateRange(oldDate,now);}
   if(editingDraft)state.confirmed=copy(d.draftPlan.assignments);
   const resolved=resolvePerson(data,body.flight,actor,body.actionId,now);state.students=students(data);
   const q={...old,...cleanFlight({...body.flight,...resolved},old?.id||'flight-'+body.actionId,now),fixed:true,createdByRole:rights.role};q.date=dte;
   assertPilot(data,q,dte,now);const reason=E.directorFlightError(state,q,oldDate===dte?old?.id:undefined,rights.role);if(reason)error(reason);
   const a=state.aircraft.find(a=>a.id===q.aircraft);if(editingDraft&&E.assignmentEligible(a,state)){delete q.operationalHold;delete q.validationHold;delete q.relocationPending;delete q.publicationStatus;}if(a.status!=='operativo'&&!body.acknowledge)error('Confirma la alerta de la aeronave no operativa.');
   if(oldDate!==dte){source.confirmed=source.confirmed.filter(f=>f.id!==old.id);storeFlights(data,source);day(data,oldDate).revision++;if(source.published)queueModifiedEmail(data,oldDate,now);}
   state.confirmed=state.confirmed.filter(f=>f.id!==q.id);if(editingDraft)q.reason='Ajustado por Dirección en el borrador.';state.confirmed.push(q);
   if(editingDraft)refreshDraftPlan(data,d,dte,state.confirmed,now);else storeFlights(data,state);
   changeNotice(data,old?{...old,date:oldDate}:null,q,state.published||source.published,now,receipt);
  }else if(action==='cancel-flight'){
  const editingDraft=!!(rights.settings&&!state.published&&d.draftPlan);if(editingDraft)state.confirmed=copy(d.draftPlan.assignments);
  const q=state.confirmed.find(q=>q.id===body.id);if(!q)error('El vuelo ya no existe.');
  if(!rights.edit&&!(rights.role==='pilot'&&rights.pilot&&E.canCancelRelocated(state,q,rights.pilot,now)))error('Solo puedes cancelar tu propio vuelo antes de su inicio.');
  const reason=String(body.reason||'').trim();if(!reason||reason.length>500)error('Escribe el motivo de la cancelación (máximo 500 caracteres).');
  state.confirmed=state.confirmed.filter(f=>f.id!==q.id);
  if(editingDraft){
   if(q.sourceRequestId){const original=d.requests.find(r=>r.id===q.sourceRequestId);if(original){original.status='pending';delete original.approvedAt;delete original.approvedFlightId;}}
   refreshDraftPlan(data,d,dte,state.confirmed,now);
  }else{
   d.cancelled.push(q.sourceRequestId||q.id);d.cancelledFlights ||= [];d.openSlots ||= [];
   d.cancelledFlights.push({id:'cancel-'+receipt,flightId:q.id,aircraft:q.aircraft,start:q.start,end:q.end,pilot:q.pilot,studentId:q.studentId,reason,cancelledAt:now});
   const cancellationAircraft=state.aircraft.find(a=>a.id===q.aircraft),reopen=E.canCancelRelocated(state,q,q.pilot,now)&&!!cancellationAircraft&&E.bookable(cancellationAircraft,dte)&&E.minutes(q.end)-E.minutes(q.start)>=E.MIN_ASSIGNMENT_MINUTES,open=reopen?{id:'open-'+receipt,aircraft:q.aircraft,start:q.start,end:q.end,flightType:E.typeOf(q),openedAt:now}:null;
   const duration=E.minutes(q.end)-E.minutes(q.start),waiting=d.requests.filter(r=>r.status!=='approved'&&!d.cancelled.includes(r.id)&&!state.confirmed.some(f=>f.sourceRequestId===r.id)).sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));
   for(const request of waiting){if(!open)break;const aircraft=state.aircraft.find(a=>a.id===q.aircraft),p=state.pilots.find(p=>p.id===request.pilot),requested=E.minutes(request.end)-E.minutes(request.start);if(duration<E.MIN_ASSIGNMENT_MINUTES||requested<E.MIN_ASSIGNMENT_MINUTES||!aircraft||!E.bookable(aircraft,dte)||!p?.valid||!p.categories.includes(aircraft.category)||!E.allowedForType(state,E.typeOf(request)).includes(aircraft.id))continue;
    const assignedDuration=Math.min(duration,requested),replacement={...request,id:'replacement-'+hash([receipt,request.id]).slice(0,18),sourceRequestId:request.id,aircraft:aircraft.id,start:open.start,end:timeFromMinutes(E.minutes(open.start)+assignedDuration),fixed:true,createdByRole:'director',reason:'Asignación de vuelo pendiente en espacio liberado por cancelación'};
    if(!E.flightAvailable(aircraft,replacement,dte)||E.directorFlightError(state,replacement,undefined,'director'))continue;assertPilot(data,replacement,dte,now);state.confirmed.push(replacement);const original=d.requests.find(r=>r.id===request.id);if(original){original.status='approved';original.approvedAt=now;original.approvedFlightId=replacement.id;}open.filledBy=replacement.id;open.reason='Asignado automáticamente a un vuelo que estaba pendiente';break;
   }
   if(open&&!open.filledBy)d.openSlots.push(open);storeFlights(data,state);changeNotice(data,{...q,date:dte},open?.filledBy?state.confirmed.find(f=>f.id===open.filledBy):null,state.published,now,receipt,true);
  }
 }else if(action==='claim-open-slot'){
  if(!rights.request||rights.role!=='pilot'||!rights.pilot)error('Solo un piloto vinculado puede tomar un espacio disponible.');
  if(!state.published)error('El horario todavía no está publicado.');
  const open=d.openSlots.find(x=>x.id===body.id);if(!open)error('Este espacio ya fue tomado. Actualiza el itinerario.');
  const clock=E.panamaClock(now);if(dte<clock.date||dte===clock.date&&E.minutes(open.start)<=E.minutes(clock.time))error('Este espacio ya inició o ya pasó.');
  const resolved=resolvePerson(data,body.flight,actor,body.actionId,now);state.students=students(data);
  const flight=cleanFlight({...body.flight,...resolved,pilot:rights.pilot,aircraft:open.aircraft,start:open.start,end:open.end},'claimed-'+body.actionId,now);flight.pilot=rights.pilot;flight.fixed=true;flight.createdByRole='pilot';flight.createdByUid=actor.user.uid;
  const aircraft=state.aircraft.find(a=>a.id===open.aircraft);if(!aircraft||!E.bookable(aircraft,dte)||!E.canChooseFlightType(state,E.typeOf(flight),'pilot',aircraft)||!E.compatible(state,flight,aircraft))error('No estás habilitado para este tipo de vuelo o aeronave.');const metadataError=E.flightDataError(state,flight);if(metadataError)error(metadataError);
  if(E.minutes(flight.end)-E.minutes(flight.start)<E.MIN_ASSIGNMENT_MINUTES)error('El espacio debe durar al menos 1 hora y 30 minutos.');if(!E.flightAvailable(aircraft,flight,dte)||state.confirmed.some(q=>(q.aircraft===flight.aircraft||q.pilot===flight.pilot)&&E.overlaps(q,flight))||E.sameStudentConflict(state.confirmed,flight))error('El espacio ya no está disponible para todo el intervalo o el estudiante tiene otro vuelo.');assertPilot(data,flight,dte,now);
  state.confirmed.push(flight);d.openSlots=d.openSlots.filter(x=>x.id!==open.id);storeFlights(data,state);changeNotice(data,null,flight,state.published,now,receipt,true);
 }else if(action==='publish'){requireDirector();validateDateRange(dte,now);const alreadyPublished=!!d.published;if(publish(data,dte,now)&&!alreadyPublished)emailPublication=publicationEmail(data,dte);}
 else error('Operación de itinerario no válida.');
 d.revision++;if(d.draftPlan&&!d.published)d.draftPlan.sourceRevision=d.revision;d.receipts.push({id:receipt,signature});d.receipts=d.receipts.slice(-250);
 const after=stateFor(data,dte,now).confirmed;
 if(state.published&&!eq(before,after)&&action==='settings')notice(data,{kind:'change',action:'night-update',date:dte,recipients:[{kind:'group',id:'all'}]},now,receipt);
 if(state.published&&!eq(before,after))queueModifiedEmail(data,dte,now);
 return {duplicate:false,...(emailPublication?{emailPublication}:{}),...(actionWarning?{actionWarning}:{})};
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
function reconcile(before,data,now,emailEvents=[]){
 let changed=false;const today=E.panamaClock(now).date;data.operationalNotices ||= [];
 for(const [registration,aircraft]of Object.entries(data.fleet||{})){
  const previous=before.fleet?.[registration]?.status||'',previousStatus=previous==='aog'?'grounded':previous,status=aircraft?.status==='aog'?'grounded':aircraft?.status;
  if(previousStatus===status)continue;
  const restoring=status==='operativo'&&['mantenimiento','grounded'].includes(previousStatus),entering=['mantenimiento','grounded'].includes(status);
  if(!restoring&&!entering)continue;
  const aircraftName=registrationLabel(data,registration),id='aircraft-status:'+hash([registration,previousStatus,status,now]);
  if(!data.operationalNotices.some(n=>n.id===id)){
   const statusLabel=status==='operativo'?'OPERATIVA':status==='grounded'?'GROUNDED':'MANTENIMIENTO';
   data.operationalNotices.push({id,kind:'aircraft-status',aircraft:aircraftName,status,previous:previousStatus,createdAt:now,recipients:[{kind:'group',id:'all'}],message:'La aeronave '+aircraftName+' '+(restoring?'restableció sus operaciones.':'cambió a '+statusLabel+'.')});
   data.operationalNotices=data.operationalNotices.slice(-500);changed=true;
  }
  const eventDate=E.panamaClock(now).date;
  const mechanicRecipients=arr(data.school?.personnel).filter(p=>['mecanico','mecanica','mechanic','mechanics'].includes(String(p.position||p.role||p.cargo||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').trim())).map(p=>p.email||'').filter(Boolean);
  emailEvents.push({id:'aircraft-status-'+eventDate+'-'+hash([registration,previousStatus,status,now]),date:eventDate,notificationType:'aircraft-status',notificationRoles:['Director','Piloto','Mecánico'],pilotRecipients:arr(data.pilotos).map(p=>p.email||'').filter(Boolean),mechanicRecipients,aircraftStatus:{aircraft:aircraftName,status,previous:previousStatus,restoring},flights:[]});
 }
 if(!data.itinerary?.version)return changed;
 for(const dt of Object.keys(data.itinerary.days||{}).filter(d=>d>=today).sort()){
  const state=stateFor(data,dt,now),old=stateFor(before,dt,now),stored=day(data,dt);let invalidated=false;
  for(const ac of state.aircraft){const previous=old.aircraft.find(a=>a.id===ac.id)?.status;if(ac.status===previous||ac.status==='operativo'||!stored.releases?.[ac.id]?.enabled)continue;stored.releases[ac.id]={...stored.releases[ac.id],enabled:false};invalidated=true;}
  if(invalidated){if(!stored.published)stored.revision++;changed=true;}
  const statusChanged=state.aircraft.some(ac=>old.aircraft.find(a=>a.id===ac.id)?.status!==ac.status);
  if(statusChanged&&stored.draftPlan&&!stored.published){recalculateDraftPlan(data,stored,dt,now);stored.revision++;changed=true;}
 }
 for(const dt of Object.keys(data.itinerary.days||{}).filter(d=>d>=today&&data.itinerary.days[d].published).sort()){
  const state=stateFor(data,dt,now),old=stateFor(before,dt,now);let scheduleChanged=false;const changedAircraft=[];
  for(const ac of state.aircraft){const previous=old.aircraft.find(a=>a.id===ac.id)?.status;if(previous===ac.status)continue;
   const result=ac.status==='operativo'?E.restorePublished(state,ac.id,previous,now):E.reallocatePublished(state,ac.id,previous,now);if(!result.changes.length)continue;
   state.confirmed=result.flights;scheduleChanged=true;changedAircraft.push(ac.id);
   for(const c of result.changes)notice(data,{kind:c.kind,date:dt,before:{...c.before,date:dt},after:{...c.after,date:dt},reason:c.reason,recipients:[{kind:'group',id:'all'}]},now,'status:'+hash([dt,c.before.id,now,c.after]));changed=true;
  }
  if(!eq(old.aircraft.map(a=>a.status),state.aircraft.map(a=>a.status))){
   storeFlights(data,state);day(data,dt).revision++;changed=true;
   if(scheduleChanged){
    const email=publicationEmail(data,dt);email.id='modified-'+dt+'-'+hash(['aircraft-status',dt,now,JSON.stringify(state.confirmed.map(q=>[q.id,q.aircraft,q.start,q.end]))]);email.action='updated';email.updatedAt=now;email.notificationRoles=['Director','Piloto','Mecánico'];email.maintenanceChange=true;
    const statusEmail=emailEvents.find(event=>event.notificationType==='aircraft-status'&&changedAircraft.some(id=>key(id)===key(event.aircraftStatus?.aircraft)));
    if(statusEmail){statusEmail.followups||=[];statusEmail.followups.push(email);}else emailEvents.push(email);
    delete day(data,dt).modifiedEmail;
   }
  }
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
 if(actor.director&&state.draftPlan&&!state.published){state.confirmed=copy(state.draftPlan.assignments);state.lastResults=copy(state.draftPlan.results);state.draftMode=true;state.draftUpdatedAt=state.draftPlan.updatedAt;state.draftRevision=state.draftPlan.revision;}else delete state.draftPlan;
 if(!actor.director){if(!['Piloto','Administrativo'].includes(actor.account?.role))state.students=[];state.aircraft.forEach(a=>{a.pilots=[];delete a.idleDays;delete a.inspectionPlan;});state.pilots.forEach(p=>{delete p.periodMinutesHonorarios;delete p.periodPriorMinutesHonorarios;delete p.periodMinutesMonth;delete p.periodPriorMinutesMonth;});delete state.prioritySettings;delete state.pilotHoursRange;delete state.pilotHoursRanges;state.confirmed.forEach(q=>{if(q.pilot!==rights.pilot)delete q.delegationNumber;});state.requests=rights.boxes.requests?state.requests.map(q=>{const own=q.pilot===rights.pilot,row=own||rights.role==='admin'?q:{id:q.id,aircraft:q.aircraft,start:q.start,end:q.end,slot:q.slot,status:q.status,pilot:'',flightType:q.flightType};if(!own)delete row.delegationNumber;return row;}):[];
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
module.exports={E,date,key,day,setup,stateFor,scope,view,calendar,apply,publish,publicationEmail,createDraftPlan,previewPublicationEmail,queueModifiedEmail,flushModifiedEmail,protect,reconcile,operational,visibleNotices,storeFlights,assertPilot};

