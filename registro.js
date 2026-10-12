/* Registro: one cloud commit for aircraft, person and flight record. */
(function(){'use strict';
const flightHours=n=>(Number(n||0)/100).toFixed(1);
const esc=escapeRecord,arr=x=>Array.isArray(x)?x:[],uid=()=>crypto.randomUUID(),fmt=n=>(Number(n||0)/100).toFixed(2);
const airports=`Achutupo|MPAC
Ailigandí|MPAI
Aguadulce (histórico)|
Aguadulce · Ofelina|MPIO
Marcos Gelabert|MPMG
Arenas|MPAR
Barú|MPBR
Bocas del Toro|MPBO
Caledonia|MPCA
Calzada Larga|MPCL
Cartí (histórico)|
Casaya|MPCS
Chame|MPCM
Chame Mayor|MPMC
Changuinola|MPCH
Changuinola · Finca 67|MPSS
Chitré|MPCE
Coiba|MPCO
Colón|MPEJ
Contadora|MPRA
Corazón de Jesús|MPCJ
David|MPDA
El Porvenir|MPVR
El Real|MPRE
El Roble · Santa Rosa|MPSR
Finca 45|MPFC
Finca Fátima|
Garachiné|MPGA
Guararé|MPGU
Guayabito (histórico)|MPGS
Islas Secas|MPSE
Jaqué|MPJE
La Cabezona (histórico)|MPCB
La Especial|MPES
La Palma (histórico)|MPLP
La Palma · Miraflores|MPMF
Lagartero · Lago Bay|MPLY
Las Lajas|MPLA
Las Lajas · Missions Beyond|MPMB
Las Moras (histórico)|MPMO
Mamitupo|MPMA
Mansucum|MPMN
Mulatupo|MPMU
Ogobsucum|MPOG
Panamá Pacífico|MPPA
Pedasí|MPPD
Pedro González|MPFE
Penonomé|MPPN
Pixvae|MPPX
Playón Chico|MPPH
Puerto Obaldía|MPOA
Puerto Piña|MPPI
Punta Barco|
Punta Cocos|MPPU
Punta Patiño|MPRP
Río Azúcar|MPRZ
Río Hato|MPSM
Río Sidra|MPRS
Sambú|MPSB
San José|MPSJ
San Miguel|MPMI
Santa Fe|MPRG
Santiago|MPSA
Sherman (histórico)|MPFS
Ticantikí|MPTI
Tocumen|MPTO
Tonosí (histórico)|
Tubualá|MPTU
Ustupo|MPUP
Viveros (histórico)|MPVI
Volcán|MPVC
Wannukandí|MPWN
Yaviza (histórico)|`.split('\n').map(line=>{const [name,code]=line.split('|');return {name,code};});
// Initial name catalogue: AAC AIP AD 1.3 index and List of airports in Panama, consulted 12 Oct 2026.
const sourceURL='https://www.aeronautica.gob.pa/ais-aip/';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function number100(s,max=99999.99){s=String(s??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>max)return null;const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
function registry(data=previewData){return {entries:[],clients:[],destinations:[],...data.school?.registry};}
function people(data=previewData){return [...arr(data.school?.students).map(s=>({...s,kind:'student',label:s.name+' · Estudiante · '+(s.identity||s.id.slice(0,8))})),...arr(registry(data).clients).map(s=>({...s,kind:'client',label:s.name+' · Cliente · '+s.id.slice(0,8)}))];}
function resolvePerson(value,data=previewData){const all=people(data),exact=all.find(s=>s.label===value);if(exact)return exact;const matches=all.filter(s=>norm(s.name)===norm(value));if(matches.length>1)throw Error('Hay varias personas con ese nombre. Selecciona el expediente de la lista.');return matches[0]||null;}
function destinations(data=previewData){return [...new Set([...airports.map(a=>a.name+(a.code?(['MPCL','MPMG'].includes(a.code)?' - ':' · ')+a.code:'')),...arr(registry(data).destinations)])].sort((a,b)=>a.localeCompare(b,'es'));}
const isRPA=reg=>reg==='RPA';
const isSim=reg=>reg==='Simulador';
const isVirtual=reg=>isRPA(reg)||isSim(reg);
const equipmentName=reg=>isRPA(reg)?'RPA (Drone)':reg;
const isMono=reg=>fleet.some(a=>a.reg===reg&&a.type==='fixed')&&!isMultimotor(reg);
const suggestedHours=(reg,delta)=>isMono(reg)&&delta!==null?Math.round(delta*1275/10000)*10:null;
function assignedCourse(person,reg){if(person?.kind!=='student')return null;const courses=arr(person.courses).filter(c=>!c.licenseDate&&!/^(Licencia|Habilitación)/i.test(c.status||'')).filter(c=>isSim(reg)?c.type==='ifr':isRPA(reg)?c.type==='rpa':c.type!=='rpa');return courses.length===1?courses[0]:null;}
function findPerson(data,entry){return entry.personKind==='student'?arr(data.school?.students).find(s=>s.id===entry.personId):arr(registry(data).clients).find(s=>s.id===entry.personId);}
function personFlight(data,entry){const person=findPerson(data,entry);if(!person)throw Error('El expediente vinculado ya no existe.');const flights=entry.courseId?arr(person.courses).find(c=>c.id===entry.courseId)?.flights:entry.personKind==='student'?person.registryFlights:person.flights;const flight=arr(flights).find(f=>f.registryId===entry.id);if(!flight)throw Error('No se encontró la sesión vinculada.');return flight;}
function prepareRegistration(base,f,id){
 const next=structuredClone(base);next.school ||= {version:1,students:[],rates:{},intakes:[]};next.school.students ||= [];next.school.registry=structuredClone(registry(next));const r=next.school.registry;
 if(r.entries.some(e=>e.id===id))return {next:base,duplicate:true};
 const operationType=f.operationType||'instruction';if(!['instruction','charter'].includes(operationType))throw Error('Selecciona Instrucción o Charter.');
 const rpa=isVirtual(f.aircraft),aircraft=rpa?{reg:f.aircraft}:fleet.find(a=>a.reg===f.aircraft);if(!aircraft)throw Error('Selecciona una aeronave.');
 if(!String(f.book||'').trim())throw Error('Ingresa el número de bitácora.');if(!Number.isFinite(dayNumber(f.date)))throw Error('Revisa la fecha DD/MM/AAAA.');
 if(!String(f.pilot||'').trim())throw Error('Ingresa o selecciona el piloto / instructor.');if(!String(f.person||'').trim())throw Error('Ingresa o selecciona el estudiante / cliente.');
 const origin=String(f.origin||'').trim();if(!origin)throw Error('Ingresa el aeropuerto de origen.');
 const route=arr(f.destinations).map(s=>String(s).trim()).filter(Boolean);if(!route.length)throw Error('Ingresa al menos un destino.');
 const key=aircraftKey(aircraft.reg),before=decodeAircraft(next.fleet[key]||{}),d=structuredClone(before),prior=rpa?null:number100(f.previous),current=rpa?null:number100(f.current),hours=number100(f.hours),stored=number100(before.tac_anterior);
 if(!rpa&&(prior===null||current===null||current<prior))throw Error('Ingresa TAC válidos; el actual no puede ser menor al anterior.');
 if(!rpa&&before.tac_anterior!==''&&before.tac_anterior!=null&&stored!==prior)throw Error('El TAC de la aeronave cambió. Vuelve a seleccionarla antes de guardar.');
 if(hours===null||hours<=0)throw Error('El tiempo de vuelo debe ser mayor que cero, en horas decimales.');
 const pax=key=>{const raw=String(f[key]??'');if(!/^\d{1,3}$/.test(raw))throw Error('Ingresa la cantidad de pasajeros de ida y vuelta (0 si no hay).');return Number(raw);};
 const paxOut=pax('out'),paxBack=pax('back'),date=isoFecha(f.date),book=f.book.trim();
 if(r.entries.some(e=>e.aircraft===aircraft.reg&&e.date===date&&norm(e.book)===norm(book)&&e.tacCurrent100===current))throw Error('Ya existe ese registro de bitácora y tacómetro. Revisa el historial para evitar duplicarlo.');
 let person=resolvePerson(f.person,next),newPerson=false;
 if(!person){const kind=operationType==='charter'?'client':'student',record={id:uid(),name:f.person.trim(),createdDate:date,...(kind==='student'?{stage:'Interesado',funding:'Propio',interests:[],courses:[],registryFlights:[]}:{flights:[]})};if(kind==='student')next.school.students.push(record);else r.clients.push(record);person={...record,kind};newPerson=true;}
 const target=person.kind==='student'?next.school.students.find(s=>s.id===person.id):r.clients.find(s=>s.id===person.id);
 const course=operationType==='charter'?null:assignedCourse({...target,kind:person.kind},aircraft.reg);
 const charge=!!f.charge,rate=charge?number100(f.rate,999999999.99):0;if(charge&&(rate===null||rate<=0))throw Error('Ingresa la tarifa por hora para registrar el cargo.');
 const cost=Math.round(hours*rate/100);if(!Number.isSafeInteger(cost))throw Error('El cargo excede el rango permitido.');
 const delta=rpa?0:current-prior,fecha=fechaVista(date),hora=getHoraPanama(),createdAt=new Date().toISOString();
 if(!rpa){
 const add=k=>{const raw=d[k];if(raw!==''&&raw!=null&&!Number.isFinite(Number(raw)))throw Error('Revisa las horas actuales de la aeronave.');const val=Math.round(Number(raw||0)*100)+delta;d[k]=fmt(val);};
 for(const field of ['horas_acum_50','horas_acum_100','ciclos_totales','ciclos_limite',...(isMultimotor(aircraft.reg)?['helice1_ciclos','helice2_ciclos']:[])])add(field);
 d.horas_totales=d.horas_acum_50;d.horas_limite=d.horas_acum_100;d.tac_anterior=fmt(current);d.horas_diarias='';d.fecha_diaria=fecha+' '+hora;d.ultimo_venc_hv=fmt(delta);d.ultimo_venc_fecha=fecha+' '+hora;d.ultimo_venc_registry_id=id;
 d.bitacora_horas ||= [];d.bitacora_tac ||= [];const tacId='registro-'+id;
 d.bitacora_tac.push({id:tacId,registryId:id,hour_index:d.bitacora_horas.length,fecha,hora,anterior:fmt(prior),actual:fmt(current),hv:fmt(delta),modificaciones:[]});
 d.bitacora_horas.push({registryId:id,tac_id:tacId,fecha,hora,hv:fmt(delta),acum:d.horas_acum_100});
 for(const [kind]of vencimientoComponents(aircraft.reg))d[kind==='motor'?'fecha_motor':kind==='helices'?'fecha_helices':'fecha_'+kind]=fecha+' '+hora;
 appendVencimientoRecord(aircraft.reg,before,d);const venc=d.bitacora_vencimientos?.at(-1);if(venc&&d.bitacora_vencimientos.length>arr(before.bitacora_vencimientos).length)Object.assign(venc,{registryId:id,fecha,hora});
 next.undoFleet ||= {};const undo=next.undoFleet[key] ||= [];undo.push(before);if(undo.length>20)undo.shift();next.fleet[key]=d;
 }
 const observation=String(f.observation||'').trim();
 const flight={id:uid(),registryId:id,observation,operationType,book,pilot:f.pilot.trim(),origin,destinations:route,fee:isSim(aircraft.reg)?'simulador':'vuelo',date,aircraft:aircraft.reg,equipmentKind:isSim(aircraft.reg)?'simulador':isRPA(aircraft.reg)?'rpa':'vuelo',hours100:hours,rateCents:rate,costCents:cost,instructor:f.pilot.trim(),note:'Bitácora '+book+' · '+[origin,...route].join(' → ')+(charge?'':' · Registro de horas sin cargo')+(observation?' · Observación: '+observation:''),createdAt};
 if(course){course.flights ||= [];course.flights.push(flight);}else if(person.kind==='student'){target.registryFlights ||= [];target.registryFlights.push(flight);}else{target.flights ||= [];target.flights.push(flight);}
 const entry={id,observation,operationType,aircraftBefore:rpa?null:Object.fromEntries(['tac_anterior','horas_acum_50','horas_acum_100','ciclos_totales','ciclos_limite','helice1_ciclos','helice2_ciclos','fecha_diaria','fecha_motor','fecha_helices','fecha_helice1','fecha_helice2','ultimo_venc_hv','ultimo_venc_fecha'].filter(k=>before[k]!==undefined).map(k=>[k,before[k]])),aircraft:aircraft.reg,equipmentKind:isSim(aircraft.reg)?'simulador':isRPA(aircraft.reg)?'rpa':'vuelo',book,date,pilot:f.pilot.trim(),copilot:String(f.copilot||'').trim(),personId:person.id,personKind:person.kind,personName:person.name,courseId:course?.id||'',origin,destinations:route,tacPrevious100:prior,tacCurrent100:current,aircraftHours100:delta,hours100:hours,rateCents:rate,costCents:cost,charge,paxOut,paxBack,createdAt,modifications:[]};r.entries.push(entry);
 r.destinations=[...new Set([...arr(r.destinations),origin,...route])];return {next,entry,newPerson,idx:rpa?-1:fleet.indexOf(aircraft)};
}
function prepareCorrection(base,id,f){
 const next=structuredClone(base),entry=registry(next).entries.find(e=>e.id===id);if(!entry)throw Error('No se encontró el registro.');if(!String(f.reason||'').trim())throw Error('Indica el motivo de la corrección.');
 const rpa=isVirtual(entry.aircraft),hours=number100(f.hours),current=rpa?null:number100(f.current);if(hours===null||hours<=0||(!rpa&&(current===null||current<entry.tacPrevious100)))throw Error('Revisa el tiempo de vuelo y el tacómetro.');
 const idx=fleet.findIndex(a=>a.reg===entry.aircraft),key=aircraftKey(entry.aircraft),before=decodeAircraft(next.fleet[key]||{}),d=structuredClone(before),tac=arr(d.bitacora_tac).find(t=>t.registryId===id);if(!rpa&&!tac)throw Error('No se encontró el tacómetro vinculado.');
 const flight=personFlight(next,entry);if(flight.voidedAt)throw Error('La sesión vinculada fue anulada.');
 const prior={hours100:entry.hours100,tacCurrent100:entry.tacCurrent100,costCents:entry.costCents},delta=rpa?0:current-entry.tacCurrent100;
 if(delta){if(d.bitacora_tac.at(-1)!==tac||number100(d.tac_anterior)!==entry.tacCurrent100)throw Error('Hay lecturas posteriores. Solo se puede corregir el TAC del último registro; el tiempo de vuelo sí se puede modificar.');d.audit_aircraft_reg=entry.aircraft;adjustRecordedHours(d,tac,delta/100);delete d.audit_aircraft_reg;tac.actual=fmt(current);tac.hv=fmt(current-entry.tacPrevious100);d.tac_anterior=fmt(current);tac.modificaciones ||= [];tac.modificaciones.push({fecha:getFechaPanama(),hora:getHoraPanama(),razon:f.reason.trim(),antes:{actual:fmt(entry.tacCurrent100)},despues:{actual:fmt(current)}});appendVencimientoRecord(entry.aircraft,before,d);const last=d.bitacora_vencimientos.at(-1);Object.assign(last,{registryId:id});if(d.ultimo_venc_registry_id===id)d.ultimo_venc_hv=tac.hv;next.undoFleet ||= {};const undo=next.undoFleet[key] ||= [];undo.push(before);if(undo.length>20)undo.shift();next.fleet[key]=d;}
 entry.tacCurrent100=current;entry.aircraftHours100=rpa?0:current-entry.tacPrevious100;entry.hours100=hours;entry.costCents=Math.round(hours*entry.rateCents/100);if(!Number.isSafeInteger(entry.costCents))throw Error('El cargo excede el rango permitido.');flight.hours100=hours;flight.costCents=entry.costCents;entry.modifications ||= [];entry.modifications.push({at:new Date().toISOString(),reason:f.reason.trim(),before:prior,after:{hours100:hours,tacCurrent100:current,costCents:entry.costCents}});return {next,entry,idx};
}
const deletionNeedsKey=(entry,now=Date.now())=>{const created=Date.parse(entry.createdAt);return !Number.isFinite(created)||created>now||now-created>=86400000;};
function reverseAircraftRecord(reg,source,entry,baseline){
 const d=decodeAircraft(source),tac=arr(d.bitacora_tac).find(t=>t.registryId===entry.id);if(!tac)return d;
 const hi=arr(d.bitacora_horas).findIndex(h=>h.registryId===entry.id||h.tac_id===tac.id);if(hi<0)throw Error('Falta la bitácora de horas vinculada. No se eliminó el registro.');
 const amount=Number(tac.hv);if(!Number.isFinite(amount)||amount<0)throw Error('Revisa las horas del registro antes de eliminarlo.');tac.hour_index=hi;
 d.audit_aircraft_reg=reg;adjustRecordedHours(d,tac,-amount);delete d.audit_aircraft_reg;
 const contribution=(field,total,offset)=>{const starting=Number(baseline?.[field]);if(!Number.isFinite(starting))return amount;const following=arr(d.bitacora_horas).slice(hi+1,offset).reduce((n,h)=>n+Number(h.hv||0),0),candidates=[amount,...arr(entry.modifications).flatMap(m=>[m.before?.tacCurrent100,m.after?.tacCurrent100]).filter(Number.isFinite).map(v=>(v-entry.tacPrevious100)/100)];return candidates.find(n=>Math.abs(starting+n+following-Number(total))<0.005)??amount;};
 let reset50=false,reset100=false;
 for(const inspection of arr(d.bitacora_inspecciones))if(inspection.hour_offset>hi){
  if(!reset50&&inspection.before50!==undefined)inspection.before50=Math.max(0,Number(inspection.before50||0)-contribution('horas_acum_50',inspection.before50,inspection.hour_offset)).toFixed(2);
  if(!reset100&&inspection.before100!==undefined)inspection.before100=Math.max(0,Number(inspection.before100||0)-contribution('horas_acum_100',inspection.before100,inspection.hour_offset)).toFixed(2);
  if(Number(inspection.tipo)===50||Number(inspection.tipo)===100)reset50=true;if(Number(inspection.tipo)===100)reset100=true;inspection.hour_offset--;
 }
 const wasLast=d.bitacora_tac.at(-1)===tac;
 d.bitacora_horas.splice(hi,1);d.bitacora_tac=d.bitacora_tac.filter(t=>t!==tac);
 for(const t of d.bitacora_tac){const index=d.bitacora_horas.findIndex(h=>h.tac_id===t.id||h.registryId&&h.registryId===t.registryId);if(index>=0)t.hour_index=index;else if(Number.isInteger(t.hour_index)&&t.hour_index>hi)t.hour_index--;}
 if(wasLast)d.tac_anterior=d.bitacora_tac.at(-1)?.actual??baseline?.tac_anterior??fmt(entry.tacPrevious100);
 const shifts={},venc=[];for(const record of arr(d.bitacora_vencimientos)){
  if(record.registryId===entry.id){for(const c of arr(record.componentes))shifts[c.key]=(shifts[c.key]||0)+Number(c.ingresadas||0);continue;}
  for(const c of arr(record.componentes))if(c.total!==null&&c.total!==undefined&&shifts[c.key]){c.total=+(Number(c.total)-shifts[c.key]).toFixed(2);c.remanentes=c.limite!=null?+(c.limite-c.total).toFixed(2):null;}
  venc.push(record);
 }
 d.bitacora_vencimientos=venc;
 if(d.ultimo_venc_registry_id===entry.id){const latest=venc.at(-1),values=arr(latest?.componentes).map(c=>Number(c.ingresadas));const same=values.length&&values.every(n=>Number.isFinite(n)&&n===values[0]&&n>=0);d.ultimo_venc_hv=same?values[0].toFixed(2):'';d.ultimo_venc_fecha=latest?[latest.fecha,latest.hora].filter(Boolean).join(' '):baseline?.ultimo_venc_fecha||'';if(latest?.registryId)d.ultimo_venc_registry_id=latest.registryId;else delete d.ultimo_venc_registry_id;
  if(!latest)d.ultimo_venc_hv=baseline?.ultimo_venc_hv||'';
 }
 if(wasLast){const last=d.bitacora_horas.at(-1);d.fecha_diaria=last?[last.fecha,last.hora].filter(Boolean).join(' '):baseline?.fecha_diaria||'';}
 const lastVenc=venc.at(-1);for(const [kind]of vencimientoComponents(reg)){const field=kind==='motor'?'fecha_motor':kind==='helices'?'fecha_helices':'fecha_'+kind;if(!arr(source.bitacora_vencimientos).length||arr(source.bitacora_vencimientos).at(-1)?.registryId===entry.id)d[field]=lastVenc?[lastVenc.fecha,lastVenc.hora].filter(Boolean).join(' '):baseline?.[field]||'';}
 for(const field of ['horas_acum_50','horas_acum_100','ciclos_totales','ciclos_limite','helice1_ciclos','helice2_ciclos'])if(baseline&&Object.hasOwn(baseline,field)&&Number(d[field]||0)===Number(baseline[field]||0))d[field]=baseline[field];d.horas_totales=d.horas_acum_50;d.horas_limite=d.horas_acum_100;
 return d;
}
function prepareDeletion(base,id,now=Date.now()){
 const next=structuredClone(base),r=registry(next),entry=r.entries.find(e=>e.id===id);if(!entry)throw Error('El registro ya no existe.');const idx=fleet.findIndex(a=>a.reg===entry.aircraft),key=aircraftKey(entry.aircraft);
 if(!isVirtual(entry.aircraft)){
  const current=decodeAircraft(next.fleet[key]),history=arr(next.undoFleet?.[key]);if(!arr(current.bitacora_tac).some(t=>t.registryId===id))throw Error('No se encontró el TAC vinculado. No se eliminó el registro.');
  const firstContaining=history.findIndex(h=>arr(h.bitacora_tac).some(t=>t.registryId===id));let baseline=entry.aircraftBefore||(firstContaining>0?history[firstContaining-1]:firstContaining===-1?history.at(-1):null);
  const earlierDeleted=arr(r.deletedEntries).filter(e=>e.aircraft===entry.aircraft&&Number.isFinite(e.tacPrevious100));if(!arr(current.bitacora_tac).some(t=>t.registryId!==id)&&earlierDeleted.length){const earliest=[entry,...earlierDeleted].sort((a,b)=>a.tacPrevious100-b.tacPrevious100)[0];baseline={...(earliest.aircraftBefore||{}),tac_anterior:fmt(earliest.tacPrevious100)};}
  next.fleet[key]=reverseAircraftRecord(entry.aircraft,current,entry,baseline);
  next.undoFleet ||= {};next.undoFleet[key]=history.flatMap(h=>{try{return [reverseAircraftRecord(entry.aircraft,h,entry,baseline)];}catch{return [];}});
 }
 const person=findPerson(next,entry);if(person){if(entry.courseId){const course=[...arr(person.courses),...arr(person.deletedCourses)].find(c=>c.id===entry.courseId);if(course)course.flights=arr(course.flights).filter(f=>f.registryId!==id);}else {const field=entry.personKind==='student'?'registryFlights':'flights';person[field]=arr(person[field]).filter(f=>f.registryId!==id);}}
 r.entries=r.entries.filter(e=>e.id!==id);r.deletedEntries ||= [];r.deletedEntries.push({...entry,deletedAt:new Date(now).toISOString()});next.school.registry=r;return {next,entry,idx};
}
function deleteEntry(id){
 const entry=registry().entries.find(e=>e.id===id);if(!entry)return;const idx=fleet.findIndex(a=>a.reg===entry.aircraft);if(aircraftDirty.has(idx)){alert('Guarda los cambios pendientes de la aeronave antes de eliminar el registro.');return;}
 const needsKey=deletionNeedsKey(entry),body='<p class="school-full">¿Eliminar el registro de '+esc(equipmentName(entry.aircraft))+' · Bitácora '+esc(entry.book)+' · '+esc(entry.personName)+' · '+flightHours(entry.hours100)+' h? Se revertirán sus horas y su cargo de '+window.School.money(entry.costCents)+', conservando los demás registros.</p>'+(needsKey?field('deletionKey','Clave de eliminación','','type="password" required autocomplete="off"'):'<p class="school-full school-muted">Guardado hace menos de 24 horas. No requiere clave.</p>');
 window.School.modal('Eliminar registro',body,async f=>{if(pending)throw Error('Hay otro guardado en proceso.');pending=true;try{
  const current=registry().entries.find(e=>e.id===id);if(!current||JSON.stringify(current)!==JSON.stringify(entry))throw Error('El registro cambió. Cierra y vuelve a abrir la eliminación.');
  if(deletionNeedsKey(current)&&!await window.School.verifyDeletionKey(f.deletionKey||''))throw Error(needsKey?'Clave incorrecta. No se eliminó el registro.':'Ya se cumplieron 24 horas. Cierra y vuelve a abrir para ingresar la clave.');
  if(aircraftDirty.has(idx))throw Error('Guarda primero los cambios pendientes de la aeronave.');const result=prepareDeletion(previewData,id);if(!await commitPreview(result.next))throw Error('No se pudo eliminar. El registro anterior se conserva.');refreshAircraft(result.idx);renderHistory();
 }finally{pending=false;}},dialog=>{const button=dialog.querySelector('[type="submit"]');button.textContent='Eliminar registro';button.classList.add('school-danger');});
}

function nextBook(reg,data=previewData){const previous=arr(registry(data).entries).filter(e=>e.aircraft===reg).at(-1);if(!previous)return '1';const book=String(previous.book||'').trim(),match=book.match(/^(.*?)(\d+)$/);return match?match[1]+String(BigInt(match[2])+1n).padStart(match[2].length,'0'):'';}
let pending=false,dirty=false,draftId=uid(),lastAircraft='',typedHours=false;
const panel=document.createElement('div');panel.className='aircraft-panel';panel.id='panel-registro';contentEl.appendChild(panel);
const tab=document.createElement('div');tab.className='aircraft-tab';tab.id='tab-registro-bitacora';tab.innerHTML='<div class="tab-reg" style="font-size:10px">📖 REGISTRO DE BITÁCORA</div>';(document.getElementById('tab-registro-pago')||itinerariosTab).insertAdjacentElement('beforebegin',tab);
tab.addEventListener('click',()=>{document.querySelectorAll('.aircraft-tab,.aircraft-panel').forEach(e=>e.classList.remove('active'));tab.classList.add('active');panel.classList.add('active');if(!dirty)render();else refreshLists();});
const field=(name,label,value='',attrs='')=>'<label>'+label+'<input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
const input=name=>panel.querySelector('[name="'+name+'"]');
function refreshLists(){const pilots=arr(previewData.pilotos).map(p=>p.nombre).filter(Boolean);panel.querySelector('#registro-pilots').innerHTML=pilots.map(p=>'<option value="'+esc(p)+'"></option>').join('');panel.querySelector('#registro-people').innerHTML=people().map(p=>'<option value="'+esc(p.label)+'"></option>').join('');panel.querySelector('#registro-destinations').innerHTML=destinations().map(p=>'<option value="'+esc(p)+'"></option>').join('');}
function routeStops(e){return [e.origin,...arr(e.destinations)].filter(Boolean);}
function renumberRoutes(){panel.querySelectorAll('[data-route-label]').forEach((label,i)=>{label.textContent='Destino'+(i?' '+(i+1):'');});}
function routeField(value='Marcos Gelabert - MPMG',number=1){return '<div class="registro-route">'+field('destination','<span data-route-label>Destino'+(number>1?' '+number:'')+'</span>',value,'list="registro-destinations" maxlength="160" required')+'<button type="button" class="record-btn" data-remove-route aria-label="Quitar destino">×</button></div>';}
function personFields(){let person;try{person=resolvePerson(input('person').value);}catch(e){panel.querySelector('[data-person-hint]').textContent=e.message;return;}
 const charter=input('operationType').value==='charter',course=charter?null:assignedCourse(person,input('aircraft').value);
 panel.querySelector('[data-person-hint]').textContent=person?'Horas vinculadas al expediente de '+person.name+'.'+(person.kind==='student'?(course?' Cargo asociado a '+window.School.courseName(course.type)+'.':' El cargo se registrará en su estado de cuenta general.'):''):input('person').value.trim()?'Se creará automáticamente un expediente de '+(charter?'cliente':'estudiante')+' con este nombre al guardar.':'Selecciona un expediente existente o escribe un nombre nuevo.';
}
function updateEstimate(){const reg=input('aircraft').value,rpa=isVirtual(reg),a=number100(input('previous').value),b=number100(input('current').value),delta=!rpa&&a!==null&&b!==null&&b>=a?b-a:null;panel.querySelector('[data-aircraft-hours]').textContent=delta===null?'—':flightHours(delta)+' h';const calculated=suggestedHours(reg,delta);if(!typedHours)input('hours').value=calculated===null?'':flightHours(calculated);const h=number100(input('hours').value),rate=number100(input('rate').value,999999999.99);panel.querySelector('[data-charge]').textContent=input('charge').checked&&h!==null&&rate!==null?'Cargo: '+window.School.money(Math.round(h*rate/100)):input('charge').checked?'Completa el tiempo y la tarifa por hora.':'Sin cargo económico';input('rate').required=input('charge').checked;input('rate').disabled=!input('charge').checked;
 panel.querySelector('[data-time-hint]').textContent=isMono(reg)?'Tiempo sugerido = horas para la aeronave × 1.275. Puedes modificarlo. 1.5 h = 1 hora 30 minutos.':isSim(reg)?'Simulador: ingresa manualmente las horas de SIM. Tarifa inicial US$90 por hora, editable.':rpa?'RPA: ingresa manualmente las horas. Tarifa por hora vinculada al curso RPA (Drone), editable en Tarifas de cursos.':'Ingresa manualmente el tiempo de vuelo en horas decimales. 1.5 h = 1 hora 30 minutos.';
}
function selectAircraft(){lastAircraft=input('aircraft').value;input('book').value=lastAircraft?nextBook(lastAircraft):'';const rpa=isVirtual(lastAircraft),d=decodeAircraft(previewData.fleet[aircraftKey(lastAircraft)]||{}),has=d.tac_anterior!==''&&d.tac_anterior!=null;input('previous').value=has?d.tac_anterior:'';input('previous').readOnly=has;input('current').value='';for(const name of ['previous','current']){input(name).required=!rpa;input(name).disabled=rpa;input(name).closest('label').hidden=rpa;}panel.querySelector('[data-aircraft-hours]').closest('.registro-hours').hidden=rpa;
 const rate=previewData.school?.rates?.[lastAircraft]?.cents??(isSim(lastAircraft)?9000:null);input('rate').value=rate!=null?fmt(rate):'';typedHours=false;input('hours').value='';personFields();updateEstimate();}
function refreshAircraft(idx){if(idx<0){window.School.refresh();return;}state[idx]={...defaultAc(fleet[idx]),...decodeAircraft(previewData.fleet[aircraftKey(fleet[idx].reg)])};const old=document.getElementById('panel-'+idx),replacement=buildPanel(fleet[idx],state[idx],idx);replacement.className=old.className;old.replaceWith(replacement);refreshPanel(idx);setupDates();updateSummary();buildResumen();updateUndoButtons();window.School.refresh();}
function renderHistory(){if(!panel.querySelector('[data-registry-history]'))return;const r=registry(),entries=[...r.entries].reverse();panel.querySelector('[data-registry-history]').innerHTML=entries.length?entries.map(e=>'<div class="registro-entry"><div class="school-row"><strong>'+esc(fechaVista(e.date))+' · '+esc(equipmentName(e.aircraft))+' · '+(e.operationType==='charter'?'Charter':'Instrucción')+' · Bitácora '+esc(e.book)+'</strong><button type="button" class="record-btn" data-edit-registry="'+esc(e.id)+'">Corregir horas / TAC</button><button type="button" class="record-btn school-danger" data-delete-registry="'+esc(e.id)+'">Eliminar</button></div><p>'+esc(e.personName)+' · '+esc(e.pilot)+(e.copilot?' / '+esc(e.copilot):'')+'</p><p>'+routeStops(e).map(esc).join(' → ')+'</p><p>'+(isVirtual(e.aircraft)?equipmentName(e.aircraft)+' · ':('TAC: '+fmt(e.tacPrevious100)+' → '+fmt(e.tacCurrent100)+' · Aeronave: '+flightHours(e.aircraftHours100)+' h · '))+'Persona: '+flightHours(e.hours100)+' h · Pasajeros: '+e.paxOut+' ida / '+e.paxBack+' vuelta</p><p>'+ (e.charge?'Cargo: '+window.School.money(e.costCents):'Sin cargo económico')+'</p>'+(e.observation?'<p><b>Observación:</b> '+esc(e.observation)+'</p>':'')+arr(e.modifications).map(m=>'<p class="school-muted">Corrección: '+esc(m.reason)+' · Tiempo: '+flightHours(m.before.hours100)+' → '+flightHours(m.after.hours100)+' h</p>').join('')+'</div>').join(''):'<p class="school-muted">Todavía no hay registros.</p>';panel.querySelector('[data-clients]').innerHTML=arr(r.clients).map(c=>'<div class="school-rate"><b>'+esc(c.name)+'</b><span>Horas de vuelo: '+flightHours(arr(c.flights).filter(f=>!f.voidedAt&&!isVirtual(f.aircraft)).reduce((n,f)=>n+f.hours100,0))+' h</span><span>Horas de RPA: '+flightHours(arr(c.flights).filter(f=>!f.voidedAt&&isRPA(f.aircraft)).reduce((n,f)=>n+f.hours100,0))+' h</span><span>Horas de simulador: '+flightHours(arr(c.flights).filter(f=>!f.voidedAt&&isSim(f.aircraft)).reduce((n,f)=>n+f.hours100,0))+' h</span><span>Cargos registrados: '+window.School.money(arr(c.flights).filter(f=>!f.voidedAt).reduce((n,f)=>n+f.costCents,0))+'</span></div>').join('')||'<p class="school-muted">Los clientes nuevos aparecerán aquí después de guardar.</p>';}
function render(){
 panel.innerHTML='<div class="school-header"><div><div class="aircraft-reg">REGISTRO DE BITÁCORA</div><p class="school-muted">Aeronave, bitácora y horas del estudiante o cliente</p></div></div><section class="card"><form id="registro-form"><div class="school-form registro-form"><label>Aeronave<select name="aircraft" required><option value="">Seleccionar…</option>'+fleet.map(a=>'<option value="'+esc(a.reg)+'">'+esc(a.reg)+' · '+esc(a.model)+'</option>').join('')+'<option value="RPA">RPA (Drone)</option><option value="Simulador">Simulador</option></select></label>'+field('book','Número de bitácora','','required maxlength="80"')+field('date','Fecha',fechaVista(panamaISO()),'placeholder="DD/MM/AAAA" required')+field('pilot','Piloto / Instructor','','list="registro-pilots" required maxlength="160"')+field('copilot','Copiloto <span style="color:#808080;font-weight:400">(opcional)</span>','','placeholder="(opcional)" list="registro-pilots" maxlength="160"')+field('person','Estudiante / Cliente','','list="registro-people" required maxlength="240"')+'<label>Tipo de servicio<select name="operationType" required><option value="instruction" selected>Instrucción</option><option value="charter">Charter</option></select></label><p class="school-full school-muted" data-person-hint></p><div class="school-full registro-route-passengers"><fieldset><legend>Ruta de vuelo</legend>'+field('origin','Aeropuerto de origen','Marcos Gelabert - MPMG','list="registro-destinations" maxlength="160" required')+'<div data-route>'+routeField('Calzada Larga - MPCL',1)+routeField('Marcos Gelabert - MPMG',2)+'</div><button type="button" class="record-btn" data-add-route>+ Agregar destino</button><p class="school-muted">Escribe un destino nuevo para agregarlo a la lista al guardar. Catálogo de nombres; no indica disponibilidad operativa. <a href="'+sourceURL+'" target="_blank" rel="noopener">Consultar AIP</a></p></fieldset><fieldset class="registro-passengers"><legend>Cantidad de pasajeros</legend>'+field('out','Ida','0','type="number" min="0" max="999" step="1" required')+field('back','Vuelta','0','type="number" min="0" max="999" step="1" required')+'</fieldset></div>'+field('previous','TAC anterior','','type="number" min="0" max="99999.99" step="0.01" required')+field('current','Tacómetro actual','','type="number" min="0" max="99999.99" step="0.01" required')+'<div class="registro-hours"><small>Horas para la aeronave</small><strong data-aircraft-hours>—</strong></div>'+field('hours','Tiempo de vuelo · horas decimales','','type="number" min="0.1" max="99999.9" step="0.1" required')+'<p class="school-full school-muted" data-time-hint></p><label class="school-check"><input type="checkbox" name="charge" checked>Registrar cargo por horas</label>'+field('rate','Tarifa por hora (USD)','','type="number" min="0.01" max="999999999.99" step="0.01" required')+'<label class="school-full">Observación<textarea name="observation" maxlength="2000" rows="3"></textarea></label><p data-charge class="school-muted">Sin cargo económico</p></div><p class="record-error" role="alert" data-registry-error></p><p class="registro-success" role="status" data-registry-success></p><div class="school-actions registro-save-actions"><button type="button" class="record-btn" data-reset-registry>Limpiar</button><button class="save-btn" type="submit">Guardar registro</button></div></form><datalist id="registro-pilots"></datalist><datalist id="registro-people"></datalist><datalist id="registro-destinations"></datalist></section><section class="card"><h3>Registros guardados</h3><div data-registry-history></div></section><section class="card"><h3>Clientes · horas registradas</h3><div class="school-rate-grid" data-clients></div></section>';
 refreshLists();renderHistory();setupDates();personFields();updateEstimate();const form=panel.querySelector('form');form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});input('aircraft').onchange=selectAircraft;input('person').oninput=personFields;input('person').onchange=personFields;input('operationType').onchange=personFields;
 for(const name of ['previous','current'])input(name).addEventListener('input',()=>{if(isMono(input('aircraft').value))typedHours=false;updateEstimate();});for(const name of ['rate','charge'])input(name).addEventListener('input',updateEstimate);input('hours').addEventListener('input',()=>{typedHours=true;updateEstimate();});
 form.onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;const button=form.querySelector('[type="submit"]');button.disabled=true;form.inert=true;form.setAttribute('aria-busy','true');const error=panel.querySelector('[data-registry-error]');error.textContent='';try{
  const fields=Object.fromEntries(new FormData(form));fields.destinations=[...form.querySelectorAll('[name="destination"]')].map(x=>x.value);fields.charge=input('charge').checked;
  const idx=fleet.findIndex(a=>a.reg===fields.aircraft);if(aircraftDirty.has(idx))throw Error('Hay cambios pendientes en la aeronave. Guárdalos primero y vuelve a seleccionarla.');
  const baseline=JSON.stringify(previewData),result=prepareRegistration(previewData,fields,draftId);if(!result.duplicate){if(!await confirmRegistration(result.entry))return;if(JSON.stringify(previewData)!==baseline||aircraftDirty.has(idx))throw Error('Los datos cambiaron mientras confirmabas. Revisa el registro y vuelve a guardarlo.');}if(!result.duplicate&&!await commitPreview(result.next))throw Error('No se pudo guardar. Los datos anteriores se conservan; revisa la conexión.');
  dirty=false;draftId=uid();typedHours=false;if(!result.duplicate)refreshAircraft(result.idx);render();panel.querySelector('[data-registry-success]').textContent='Registro guardado. Aeronave y horas de la persona sincronizadas.';
 }catch(e){error.textContent=e.message||'No se pudo guardar.';}finally{pending=false;form.inert=false;form.removeAttribute('aria-busy');if(button.isConnected)button.disabled=false;}};
}
function confirmRegistration(e){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='record-dialog registro-confirm';
 const row=(label,value,red=false)=>'<div><dt>'+label+'</dt><dd'+(red?' class="registro-confirm-red"':'')+'>'+esc(value)+'</dd></div>';
 dialog.innerHTML='<h3>¿Quieres guardar este registro?</h3><p>Revisa los datos antes de confirmar.</p><dl>'+row('Servicio',e.operationType==='charter'?'Charter':'Instrucción')+row('Aeronave',equipmentName(e.aircraft),true)+row('Tiempo de vuelo',flightHours(e.hours100)+' h',true)+row('Estudiante / Cliente',e.personName,true)+row('Piloto / Instructor',e.pilot,true)+row('Copiloto',e.copilot||'—')+row('Observación',e.observation||'')+row('Fecha',fechaVista(e.date))+row('Número de bitácora',e.book)+row('Aeropuerto de origen',e.origin)+row('Destinos',e.destinations.join(' → '))+(!isVirtual(e.aircraft)?row('Tacómetro',fmt(e.tacPrevious100)+' → '+fmt(e.tacCurrent100))+row('Horas para la aeronave',flightHours(e.aircraftHours100)+' h'):'')+row('Pasajeros','Ida: '+e.paxOut+' · Vuelta: '+e.paxBack)+row('Cargo',e.charge?window.School.money(e.costCents)+' · '+window.School.money(e.rateCents)+'/h':'Sin cargo económico')+row('Asignación',e.courseId?'Curso: '+window.School.courseName(findPerson(previewData,e)?.courses?.find(c=>c.id===e.courseId)?.type||''):'Estado de cuenta general')+'</dl><div class="record-actions"><button type="button" class="record-btn" data-cancel>Cancelar</button><button type="button" class="save-btn" data-confirm>Sí, guardar registro</button></div>';
 document.body.appendChild(dialog);let accepted=false;dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-confirm]').onclick=()=>{accepted=true;dialog.close();};dialog.addEventListener('close',()=>{dialog.remove();resolve(accepted);},{once:true});dialog.showModal();dialog.querySelector('[data-cancel]').focus();
 });}
panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-add-route')){panel.querySelector('[data-route]').insertAdjacentHTML('beforeend',routeField());renumberRoutes();dirty=true;}if(b.hasAttribute('data-remove-route')){if(window.confirm('¿Quitar este destino del formulario?')){b.closest('.registro-route').remove();renumberRoutes();dirty=true;}}if(b.hasAttribute('data-reset-registry')&&(!dirty||window.confirm('¿Descartar los datos sin guardar del formulario?'))){dirty=false;typedHours=false;draftId=uid();render();}if(b.dataset.editRegistry)edit(b.dataset.editRegistry);if(b.dataset.deleteRegistry)deleteEntry(b.dataset.deleteRegistry);});
function edit(id){const entry=registry().entries.find(e=>e.id===id);if(!entry)return;const idx=fleet.findIndex(a=>a.reg===entry.aircraft);if(aircraftDirty.has(idx)){alert('Guarda los cambios pendientes de la aeronave antes de corregir este registro.');return;}
 window.School.modal('Corregir registro · '+equipmentName(entry.aircraft),(isVirtual(entry.aircraft)?'':field('current','Tacómetro actual',fmt(entry.tacCurrent100),'type="number" min="0" max="99999.99" step="0.01" required'))+field('hours','Tiempo de vuelo · horas decimales',flightHours(entry.hours100),'type="number" min="0.1" max="99999.9" step="0.1" required')+'<p class="school-full school-muted">El tiempo modifica las horas y el cargo de la persona. En aeronaves con TAC, solo se permite corregir la última lectura.</p><label class="school-full">Motivo de la corrección<textarea name="reason" required maxlength="2000"></textarea></label>',async f=>{if(pending)throw Error('Hay otro guardado en proceso.');pending=true;try{const current=registry().entries.find(e=>e.id===id);if(JSON.stringify(current)!==JSON.stringify(entry))throw Error('El registro cambió. Cierra y vuelve a abrir la corrección.');const result=prepareCorrection(previewData,id,f);if(!await commitPreview(result.next))throw Error('No se pudo guardar la corrección.');refreshAircraft(result.idx);renderHistory();}finally{pending=false;}});
}

function airportCode(value){
 const text=String(value||'').trim(),code=text.toUpperCase().match(/(?:^|[\s·-])([A-Z]{4})$/);
 if(code)return code[1];
 const name=norm(text).replace(/^aeropuerto\s+(?:de\s+)?/,'');
 const airport=airports.find(a=>norm(a.name)===name);
 if(airport?.code)return airport.code;
 if(['albrook','marcos a. gelabert','marcos gelabert'].includes(name))return 'MPMG';
 return text?'Sin código: '+text:'Origen sin registrar';
}
function transportReport(data=previewData){
 const groups=new Map();
 for(const e of arr(registry(data).entries)){
  if(e.voidedAt||e.deletedAt||isSim(e.aircraft))continue;
  const service=e.operationType==='charter'?'Charter':'Adiestramiento',key=e.date+'|'+service;
  if(!groups.has(key))groups.set(key,{date:e.date,service,hours100:0,flights:[]});
  const group=groups.get(key);group.hours100+=Number(e.hours100||0);
  group.flights.push({id:e.id,aircraft:e.aircraft,book:e.book,route:[airportCode(e.origin),...arr(e.destinations).map(airportCode)].join(' → ')});
 }
 return [...groups.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.service.localeCompare(b.service));
}
let aacFrom='',aacTo='',aacService='all';
function aacReport(data=previewData,from=aacFrom,to=aacTo,service=aacService){
 const copy={school:{registry:{entries:arr(registry(data).entries).filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)&&(service==='all'||(e.operationType==='charter'?'charter':'instruction')===service))}}};
 return transportReport(copy).sort((a,b)=>a.date.localeCompare(b.date)||a.service.localeCompare(b.service)).map(g=>({...g,service:g.service.toUpperCase(),flights:g.flights.map(f=>({...f,route:f.route.replaceAll(' → ','-')}))}));
}
function renderReport(){
 renderPersonalReport();
 const target=document.getElementById('registro-transport-report');if(!target)return;
 if(!aacFrom)aacFrom=panamaISO().slice(0,7)+'-01';if(!aacTo)aacTo=panamaISO();
 const groups=aacReport(),count=Math.max(1,...groups.map(g=>g.flights.length)),flights=groups.reduce((n,g)=>n+g.flights.length,0),hours=groups.reduce((n,g)=>n+g.hours100,0);
 target.innerHTML='<div class="school-row"><h3>Estadísticas para AAC</h3><button type="button" class="save-btn" data-aac-download'+(!groups.length?' disabled':'')+'>Descargar Excel</button></div><form data-aac-filters class="school-row"><label>Tipo de servicio<select name="service"><option value="all"'+(aacService==='all'?' selected':'')+'>Todos</option><option value="instruction"'+(aacService==='instruction'?' selected':'')+'>Adiestramiento</option><option value="charter"'+(aacService==='charter'?' selected':'')+'>Charter</option></select></label><label>Desde<input name="from" value="'+esc(fechaVista(aacFrom))+'" placeholder="DD/MM/AAAA" required></label><label>Hasta<input name="to" value="'+esc(fechaVista(aacTo))+'" placeholder="DD/MM/AAAA" required></label><button type="submit" class="record-btn">Aplicar filtros</button><p data-aac-error class="record-error" role="alert"></p></form><p class="school-muted">Todas las aeronaves. Un registro de bitácora = un vuelo. Horas según tiempo de vuelo registrado. No incluye simulador ni registros eliminados.</p><div style="overflow-x:auto"><table class="aac-table"><thead><tr><th>FECHA</th><th>CANTIDAD<br>DE VUELOS</th><th>HORAS<br>VOLADAS</th><th>TIPO DE SERVICIO DE TRANSPORTE<br>AÉREO EFECTUADO</th>'+Array.from({length:count},(_,i)=>'<th>VUELO '+(i+1)+'</th>').join('')+'</tr></thead><tbody>'+groups.map(g=>'<tr><td>'+esc(fechaVista(g.date))+'</td><td>'+g.flights.length+'</td><td>'+flightHours(g.hours100)+'</td><td><em>'+g.service+'</em></td>'+Array.from({length:count},(_,i)=>'<td class="aac-route">'+(g.flights[i]?esc(g.flights[i].route):'')+'</td>').join('')+'</tr>').join('')+'</tbody><tfoot><tr><th>TOTALES</th><td>'+flights+'</td><td>'+flightHours(hours)+'</td><td colspan="'+(count+1)+'"></td></tr></tfoot></table></div>'+(!groups.length?'<p class="school-muted">Sin vuelos registrados con los filtros seleccionados.</p>':'')+(groups.some(g=>g.flights.some(f=>/Sin código|sin registrar/.test(f.route)))?'<p class="school-muted">Revisa las rutas señaladas sin código OACI o sin origen antes de presentar el reporte.</p>':'');
 target.querySelector('[data-aac-filters]').onsubmit=e=>{
  e.preventDefault();const form=e.currentTarget,from=isoFecha(form.elements.from.value),to=isoFecha(form.elements.to.value);
  if(!Number.isFinite(dayNumber(from))||!Number.isFinite(dayNumber(to))||from>to){target.querySelector('[data-aac-error]').textContent='Revisa las fechas: Desde debe ser anterior o igual a Hasta.';return;}
  aacFrom=from;aacTo=to;aacService=form.elements.service.value;renderReport();
 };
 target.querySelector('[data-aac-download]').onclick=()=>{
  const blob=new Blob([aacWorkbook(aacReport(),aacFrom,aacTo,aacService)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Estadisticas_AAC_'+aacService+'_'+aacFrom+'_a_'+aacTo+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 };
}
// Small, dependency-free OOXML export. Text is always stored as text, never as a formula.
function aacWorkbook(groups,from,to,service,detail=null){
 const xml=s=>String(s??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const col=n=>{let r='';for(n++;n;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;};
 const count=detail?3:Math.max(1,...groups.map(g=>g.flights.length)),last=col(3+count),rows=[];
 const text=(r,c,v,style=0)=>'<c r="'+col(c)+r+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';
 const num=(r,c,v,style=2,formula='')=>'<c r="'+col(c)+r+'" s="'+style+'">'+(formula?'<f>'+formula+'</f>':'')+'<v>'+v+'</v></c>';
 rows.push('<row r="1" ht="25" customHeight="1">'+text(1,0,detail?'Estadísticas Helicópteros Personales':'Estadísticas para AAC',4)+'</row>');
 rows.push('<row r="2" ht="22" customHeight="1">'+text(2,0,(detail&&detail.aircraft!=='all'?equipmentName(detail.aircraft):'Todas las aeronaves')+' · '+fechaVista(from)+' a '+fechaVista(to)+' · '+(service==='instruction'?'Adiestramiento':service==='charter'?'Charter':'Todos los servicios'),4)+'</row>');
 rows.push('<row r="3" ht="40" customHeight="1">'+(detail?['FECHA','NÚMERO DE BITÁCORA','AERONAVE','INSTRUCTOR','ESTUDIANTE / CLIENTE','TIEMPO DE VUELO','OBSERVACIONES']:['FECHA','CANTIDAD DE VUELOS','HORAS VOLADAS','TIPO DE SERVICIO DE TRANSPORTE AÉREO EFECTUADO',...Array.from({length:count},(_,i)=>'VUELO '+(i+1))]).map((v,c)=>text(3,c,v,1)).join('')+'</row>');
 if(detail){
 detail.entries.forEach((e,i)=>{const r=i+4,date=(Date.parse(e.date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000,lines=String(e.observation||'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/44)),0);
 rows.push('<row r="'+r+'" ht="'+Math.min(409,Math.max(30,lines*15))+'" customHeight="1">'+num(r,0,date,3)+text(r,1,e.book)+text(r,2,equipmentName(e.aircraft))+text(r,3,e.pilot||'')+text(r,4,e.personName||'')+num(r,5,Number(e.hours100||0)/100,5)+text(r,6,e.observation||'')+'</row>');});
 const r=detail.entries.length+4,total=detail.entries.reduce((n,e)=>n+Number(e.hours100||0),0)/100;
 rows.push('<row r="'+r+'" ht="24" customHeight="1">'+text(r,0,'TOTAL',1)+num(r,5,total,8,detail.entries.length?'SUM(F4:F'+(r-1)+')':'')+'</row>');
 }else{
 groups.forEach((g,i)=>{const r=i+4,date=(Date.parse(g.date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;rows.push('<row r="'+r+'" ht="24" customHeight="1">'+num(r,0,date,3)+num(r,1,g.flights.length)+num(r,2,g.hours100/100,5)+text(r,3,g.service,6)+Array.from({length:count},(_,c)=>text(r,c+4,g.flights[c]?.route||'')).join('')+'</row>');});
 const r=groups.length+4,totalFlights=groups.reduce((n,g)=>n+g.flights.length,0),totalHours=groups.reduce((n,g)=>n+g.hours100,0)/100;
 rows.push('<row r="'+r+'" ht="24" customHeight="1">'+text(r,0,'TOTALES',1)+num(r,1,totalFlights,7,groups.length?'SUM(B4:B'+(r-1)+')':'')+num(r,2,totalHours,8,groups.length?'SUM(C4:C'+(r-1)+')':'')+'</row>');
 }
 const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const files={
 '[Content_Types].xml':prefix+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':prefix+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+(detail?'Helicópteros Personales':'Estadísticas para AAC')+'" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':prefix+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><i/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2875A5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9">'+[[0,0,0,1],[0,1,2,1],[0,0,0,1],[164,0,0,1],[0,2,0,0],[165,0,0,1],[0,3,0,1],[0,2,0,1],[165,2,0,1]].map(([n,f,fill,b])=>'<xf numFmtId="'+n+'" fontId="'+f+'" fillId="'+fill+'" borderId="'+b+'" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>').join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
 'xl/worksheets/sheet1.xml':prefix+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+(detail?[15,20,20,30,32,20,48].map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join(''):'<col min="1" max="1" width="15" customWidth="1"/><col min="2" max="3" width="16" customWidth="1"/><col min="4" max="4" width="43" customWidth="1"/>'+Array.from({length:count},(_,i)=>'<col min="'+(i+5)+'" max="'+(i+5)+'" width="'+Math.max(28,...groups.map(g=>Math.min(80,(g.flights[i]?.route.length||0)+3)))+'" customWidth="1"/>').join(''))+'</cols><sheetData>'+rows.join('')+'</sheetData><mergeCells count="2"><mergeCell ref="A1:'+last+'1"/><mergeCell ref="A2:'+last+'2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0" footer="0"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>'
 };
 return aacZip(files);
}
function aacZip(files){
 const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
 const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const header=(size)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
 for(const [name,value] of Object.entries(files)){
  const filename=encoder.encode(name),data=encoder.encode(value),sum=crc(data),h=header(30),v=h.view;
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);
  parts.push(h.bytes,filename,data);
  const c=header(46),w=c.view;w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,33,true);w.setUint32(16,sum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,filename.length,true);w.setUint32(42,offset,true);central.push(c.bytes,filename);offset+=30+filename.length+data.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=header(22),v=end.view,n=Object.keys(files).length;v.setUint32(0,0x06054b50,true);v.setUint16(8,n,true);v.setUint16(10,n,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+size+22);let pos=0;for(const bytes of [...parts,...central,end.bytes]){result.set(bytes,pos);pos+=bytes.length;}return result;
}

let hpFrom='',hpTo='',hpAircraft='all',hpService='all';
function personalReport(data=previewData,from=hpFrom,to=hpTo,aircraft=hpAircraft,service=hpService){
 return arr(registry(data).entries).filter(e=>!e.voidedAt&&!e.deletedAt&&(!from||e.date>=from)&&(!to||e.date<=to)&&(aircraft==='all'||e.aircraft===aircraft)&&(service==='all'||(e.operationType==='charter'?'charter':'instruction')===service)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.book).localeCompare(String(b.book),'es',{numeric:true}));
}
function renderPersonalReport(){
 const anchor=document.getElementById('registro-transport-report');if(!anchor)return;
 let target=document.getElementById('registro-personal-report');
 if(!target){target=document.createElement('section');target.id='registro-personal-report';target.className='card';target.style.cssText='margin-top:18px;padding:18px';anchor.insertAdjacentElement('afterend',target);}
 if(!hpFrom)hpFrom=panamaISO().slice(0,7)+'-01';if(!hpTo)hpTo=panamaISO();
 const aircrafts=[...new Set([...fleet.map(a=>a.reg),'RPA','Simulador',...arr(registry().entries).map(e=>e.aircraft).filter(Boolean)])];
 const entries=personalReport(),hours=entries.reduce((n,e)=>n+Number(e.hours100||0),0);
 target.innerHTML='<div class="school-row"><h3>Estadísticas Helicópteros Personales</h3><button type="button" class="save-btn" data-hp-download'+(!entries.length?' disabled':'')+'>Descargar Excel</button></div><form data-hp-filters class="school-row"><label>Desde<input name="from" value="'+esc(fechaVista(hpFrom))+'" placeholder="DD/MM/AAAA" required></label><label>Hasta<input name="to" value="'+esc(fechaVista(hpTo))+'" placeholder="DD/MM/AAAA" required></label><label>Aeronave<select name="aircraft"><option value="all">Todas</option>'+aircrafts.map(a=>'<option value="'+esc(a)+'"'+(hpAircraft===a?' selected':'')+'>'+esc(equipmentName(a))+'</option>').join('')+'</select></label><label>Tipo de servicio<select name="service"><option value="all"'+(hpService==='all'?' selected':'')+'>Todos</option><option value="instruction"'+(hpService==='instruction'?' selected':'')+'>Adiestramiento</option><option value="charter"'+(hpService==='charter'?' selected':'')+'>Charter</option></select></label><button type="submit" class="record-btn">Aplicar filtros</button><p data-hp-error class="record-error" role="alert"></p></form><p class="school-muted">Una fila por bitácora guardada. '+entries.length+' registros · Tiempo total: '+flightHours(hours)+' h.</p><div style="overflow-x:auto"><table class="aac-table"><thead><tr>'+['Fecha','Número de bitácora','Aeronave','Instructor','Estudiante / Cliente','Tiempo de vuelo','Observaciones'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+entries.map(e=>'<tr><td>'+esc(fechaVista(e.date))+'</td><td>'+esc(e.book)+'</td><td>'+esc(equipmentName(e.aircraft))+'</td><td>'+esc(e.pilot||'')+'</td><td>'+esc(e.personName||'')+'</td><td>'+flightHours(e.hours100)+'</td><td style="min-width:220px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(e.observation||'')+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="5">TOTAL</th><td>'+flightHours(hours)+'</td><td></td></tr></tfoot></table></div>'+(!entries.length?'<p class="school-muted">Sin registros con los filtros seleccionados.</p>':'');
 target.querySelector('[data-hp-filters]').onsubmit=e=>{
  e.preventDefault();const form=e.currentTarget,from=isoFecha(form.elements.from.value),to=isoFecha(form.elements.to.value);
  if(!Number.isFinite(dayNumber(from))||!Number.isFinite(dayNumber(to))||from>to){target.querySelector('[data-hp-error]').textContent='Revisa las fechas: Desde debe ser anterior o igual a Hasta.';return;}
  hpFrom=from;hpTo=to;hpAircraft=form.elements.aircraft.value;hpService=form.elements.service.value;renderPersonalReport();
 };
 target.querySelector('[data-hp-download]').onclick=()=>{
  const blob=new Blob([personalWorkbook(personalReport(),hpFrom,hpTo,hpAircraft,hpService)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Estadisticas_Helicopteros_Personales_'+hpFrom+'_a_'+hpTo+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 };
}
function personalWorkbook(entries,from,to,aircraft,service){return aacWorkbook([],from,to,service,{entries,aircraft});}

window.Registro={renderReport,edit,deleteEntry,hasDraft:()=>dirty||pending,refresh:()=>{if(!dirty)render();},math:{personalReport,personalWorkbook,aacReport,aacWorkbook,airportCode,transportReport,prepareRegistration,prepareCorrection,number100,resolvePerson,suggestedHours,assignedCourse,nextBook,prepareDeletion,reverseAircraftRecord,deletionNeedsKey}};
const previousDraft=window.hasDraftChanges;window.hasDraftChanges=()=>!!previousDraft?.()||dirty||pending;
render();renderReport();window.REGISTRO_READY=true;
})();











