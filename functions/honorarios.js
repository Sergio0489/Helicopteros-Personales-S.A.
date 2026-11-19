'use strict';

const {createHash}=require('node:crypto');
const {legacyId,normalized}=require('./pilot-identities');

const AIRCRAFT=['HP1784','HP1819','HP1930','HP1815','HP1579','HP1907','HP880BL','HP18BLM','HP1186','HP1805BLM','HP11BL'];
const aircraftKey=value=>String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const defaultRates=()=>Object.fromEntries(AIRCRAFT.map(id=>[id,{flightCents:['HP880BL','HP1805BLM'].includes(id)?5000:['HP18BLM','HP1186','HP11BL'].includes(id)?10000:3000,groundCents:id==='HP11BL'?10000:5000,noShowCents:3000}]));
const list=v=>Array.isArray(v)?v:[];
const cents=(value,label)=>{if(!Number.isSafeInteger(value)||value<0||value>100000000)throw Error('Revisa la tarifa de '+label+'.');return value;};
function rates(data){const defaults=defaultRates(),saved=data.school?.honorarios?.rates||{};return Object.fromEntries(AIRCRAFT.map(id=>[id,{...defaults[id],...(saved[id]||{})}]));}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function utcDate(value){return new Date(value+'T12:00:00Z');}
function shift(value,days){const d=utcDate(value);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function period(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Fecha de honorarios no válida.');
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
 let start,end,label;
 if(day>=26){start=date.slice(0,8)+'26';const next=month===12?`${year+1}-01-10`:`${year}-${String(month+1).padStart(2,'0')}-10`;end=next;label='26 al 10';}
 else if(day<=10){const prev=month===1?`${year-1}-12-26`:`${year}-${String(month-1).padStart(2,'0')}-26`;start=prev;end=date.slice(0,8)+'10';label='26 al 10';}
 else{start=date.slice(0,8)+'11';end=date.slice(0,8)+'25';label='11 al 25';}
 return {id:start+'_'+end,start,end,label};
}
function addFlightPay(entry,rate){
 const hours=Number(entry.hours100||0),ground=entry.operationType==='charter'?Number(entry.timeOnGround100||0):0;
 if(!Number.isSafeInteger(hours)||hours<0||!Number.isSafeInteger(ground)||ground<0)throw Error('Revisa las horas del registro.');
 const flightCents=cents(rate.flightCents,entry.aircraft),groundCents=cents(rate.groundCents,entry.aircraft),flightPay=Math.round(hours*flightCents/100),groundPay=Math.round(ground*groundCents/100);
 if(!Number.isSafeInteger(flightPay+groundPay))throw Error('El honorario excede el rango permitido.');
 return {flightRateCents:flightCents,flightPayCents:flightPay,flightHours100:hours,groundRateCents:groundCents,groundPayCents:groundPay,timeOnGround100:ground,totalCents:flightPay+groundPay};
}
function activeStudents(data){return list(data.school?.students);}
function applyNewEntries(before,after,account){
 const oldIds=new Set(list(before.school?.registry?.entries).map(e=>e.id));
 const tariffs=rates(after);let records;
 const addRecord=record=>{after.school ||= {};after.school.honorarios ||= {};records ||= after.school.honorarios.records ||= [];records.push(record);};
 for(const entry of list(after.school?.registry?.entries)){
  if(oldIds.has(entry.id))continue;
  const status=entry.bookStatus;
  if(!['flown','weather','maintenance','cancelled','no-show'].includes(status))throw Error('Selecciona el resultado de la bitácora.');
  if(!validDate(entry.date))throw Error('La fecha del registro de bitácora no es válida.');
  const aircraft=aircraftKey(entry.aircraft);if(status==='flown'?!AIRCRAFT.includes(aircraft)&&!['SIMULADOR','RPA'].includes(aircraft):!AIRCRAFT.includes(aircraft))throw Error('Selecciona una aeronave registrada para este resultado.');
  if(account.role==='Piloto'){
   if(account.syncStatus!=='matched'||account.recordKind!=='pilot'||!account.recordId)throw Error('Vincula tu usuario con un expediente de piloto.');
   entry.pilotId=String(account.recordId);entry.pilot=String(account.recordName||entry.pilot||'').trim();
  }
  const pilots=list(after.pilotos),matches=pilots.filter(p=>entry.pilotId?String(p.id||'')===String(entry.pilotId):normalized(p.nombre||p.name,'name')===normalized(entry.pilot,'name'));
  if(matches.length!==1||!matches[0].id||legacyId(matches[0].id))throw Error('Vincula la bitácora con un expediente de piloto con identificador permanente.');
  const pilot=matches[0];entry.pilotId=String(pilot.id);entry.pilot=pilot.nombre||pilot.name;
  if(status==='flown'){
   if(!String(entry.book||'').trim()||!(Number(entry.hours100)>0))throw Error('El número de bitácora y las horas son obligatorios para registrar el vuelo.');
   const rateKey=aircraftKey(entry.aircraft);if(!AIRCRAFT.includes(rateKey))continue;
   const rate=tariffs[rateKey];if(!rate)throw Error('No hay tarifa configurada para '+entry.aircraft+'.');
   const pay=addFlightPay(entry,rate);entry.pilotHonorarium={...pay,createdAt:new Date().toISOString()};
   addRecord({id:'flight-'+entry.id,entryId:entry.id,pilotId:entry.pilotId,pilot:entry.pilot,date:entry.date,aircraft:entry.aircraft,kind:entry.operationType==='charter'?'charter':'flight',...pay,createdAt:entry.pilotHonorarium.createdAt});
  }else if(status==='cancelled'&&!String(entry.cancellationReason||'').trim())throw Error('La cancelación requiere un motivo.');
  if(status==='no-show'){
   if(entry.personKind!=='student')throw Error('El no show debe vincularse al expediente de un estudiante.');
   const student=activeStudents(after).find(s=>s.id===entry.personId);if(!student)throw Error('Selecciona el expediente del estudiante del vuelo.');
   student.expenses ||= [];const expenseId='no-show-'+entry.id;
   if(student.expenses.some(e=>e.noShowId===entry.id))throw Error('El cargo de no show ya existe.');
   student.expenses.push({id:expenseId,noShowId:entry.id,date:entry.date,cents:10000,description:'Cargo por no show',aircraft:entry.aircraft,source:'Bitácora '+(entry.book||entry.id),note:'Pendiente de aprobación del estudiante',createdAt:new Date().toISOString(),acceptance:null});
   const noShowCents=cents(tariffs[aircraft]?.noShowCents??3000,entry.aircraft),instructorPay={id:'no-show-'+entry.id,entryId:entry.id,pilotId:entry.pilotId,pilot:entry.pilot,date:entry.date,aircraft:entry.aircraft,kind:'no-show',noShowCents,totalCents:noShowCents,createdAt:new Date().toISOString()};addRecord(instructorPay);entry.instructorHonorariumCents=noShowCents;
  }
 }
}
function report(data,pilotId,date){
 const selected=period(date),stored=rates(data),registryEntries=list(data.school?.registry?.entries),records=list(data.school?.honorarios?.records),basePilots=list(data.pilotos),nameCounts=new Map();
 for(const p of basePilots){const name=normalized(p.nombre||p.name,'name');if(name)nameCounts.set(name,(nameCounts.get(name)||0)+1);}
 const pilotRows=basePilots.map(p=>{const name=String(p.nombre||p.name||'Piloto'),key=normalized(name,'name'),storedId=String(p.id||''),id=storedId&&!legacyId(storedId)?storedId:((nameCounts.get(key)===1&&key)?'legacy-name-'+createHash('sha256').update(key).digest('hex').slice(0,24):'');return {...p,id,name};});
 const pilotIds=new Set();for(const p of pilotRows)if(p.id){if(pilotIds.has(p.id))throw Error('Hay identificadores de piloto duplicados. Revisa los expedientes antes de consultar Honorarios.');pilotIds.add(p.id);}
 const pilots=new Map(pilotRows.filter(p=>p.id).map(p=>[p.id,p.name]));
 const resolveName=name=>{const key=normalized(name,'name'),matches=pilotRows.filter(p=>p.id&&normalized(p.name,'name')===key);return matches.length===1?matches[0].id:'';};
 const resolvePilotId=(id,name)=>{const value=String(id||'');return value&&!legacyId(value)?value:resolveName(name);};
 // Retain queryable history for deleted dossiers whose ledger records already
 // carry permanent IDs. Positional legacy IDs never become historical identities.
 for(const row of [...records,...registryEntries]){const id=String(row.pilotId||'');if(id&&!legacyId(id)&&!pilots.has(id)){const name=String(row.pilot||'Piloto histórico');pilots.set(id,name);pilotRows.push({id,name,historical:true});}}
 const rows=records.filter(r=>r.date>=selected.start&&r.date<=selected.end).map(r=>{const linkedPilotId=resolvePilotId(r.pilotId,r.pilot);return {...r,pilotId:linkedPilotId,pilot:r.pilot||pilots.get(linkedPilotId)||'Piloto'};}).filter(r=>!pilotId||String(r.pilotId)===String(pilotId));
 // Include flown entries missing from the ledger to keep an interrupted migration visible.
 for(const entry of registryEntries){
  if(typeof entry.date!=='string'||entry.date<selected.start||entry.date>selected.end||entry.bookStatus!=='flown'||!(Number(entry.hours100)>0)||!AIRCRAFT.includes(aircraftKey(entry.aircraft))||records.some(r=>r.entryId===entry.id))continue;
  const linkedPilotId=resolvePilotId(entry.pilotId,entry.pilot),displayName=entry.pilot||pilots.get(linkedPilotId)||'Piloto';if(pilotId&&String(linkedPilotId)!==String(pilotId))continue;
  const pay=entry.pilotHonorarium||addFlightPay(entry,stored[aircraftKey(entry.aircraft)]);
  rows.push({id:'flight-'+entry.id,entryId:entry.id,pilotId:linkedPilotId,pilot:displayName,date:entry.date,aircraft:entry.aircraft,kind:entry.operationType==='charter'?'charter':'flight',...pay});
 }
 const entryById=new Map(registryEntries.map(e=>[String(e.id),e]));
 const detailedRows=rows.map(row=>{const entry=entryById.get(String(row.entryId))||{};return {...row,origin:entry.origin||'',destination:list(entry.destinations).join(' → '),book:entry.book||'',personName:entry.personName||'',bookStatus:entry.bookStatus||'',operationType:entry.operationType||'',noShowCount:row.kind==='no-show'?1:0};});
 const grouped=new Map();for(const row of detailedRows){const kind=row.kind==='charter'?'charter':row.kind==='no-show'?'no-show':'flight',pilotKey=String(row.pilotId||'unresolved:'+row.id),key=pilotKey+'|'+row.aircraft+'|'+kind;if(!grouped.has(key))grouped.set(key,{pilotId:row.pilotId,pilot:row.pilot,aircraft:row.aircraft,kind,flightHours100:0,groundHours100:0,noShowCount:0,totalCents:0,entries:0});const g=grouped.get(key);g.flightHours100+=Number(row.flightHours100||0);g.groundHours100+=Number(row.timeOnGround100||0);g.noShowCount+=Number(row.noShowCount||0);g.totalCents+=Number(row.totalCents||0);g.entries++;}
 const totals=new Map();for(const row of detailedRows){const key=String(row.pilotId||'unresolved:'+row.id);if(!totals.has(key))totals.set(key,{totalCents:0,flightHours100:0,groundHours100:0,noShowCount:0});const value=totals.get(key);value.totalCents+=Number(row.totalCents||0);value.flightHours100+=Number(row.flightHours100||0);value.groundHours100+=Number(row.timeOnGround100||0);value.noShowCount+=Number(row.noShowCount||0);}
 const pilotList=pilotRows.filter(p=>p.id&&(!pilotId||String(p.id)===String(pilotId))).map(p=>({id:String(p.id),name:p.nombre||p.name||'Piloto',license:p.numeroLicencia||p.licenseNumber||p.licencia||'',...(totals.get(String(p.id))||{totalCents:0,flightHours100:0,groundHours100:0,noShowCount:0})})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return {period:selected,rates:stored,pilots:pilotList,rows:detailedRows.sort((a,b)=>a.date.localeCompare(b.date)||String(a.pilot).localeCompare(String(b.pilot),'es')),groups:[...grouped.values()].sort((a,b)=>a.pilot.localeCompare(b.pilot,'es')||a.aircraft.localeCompare(b.aircraft)||a.kind.localeCompare(b.kind))};
}
function validateRates(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(id=>!AIRCRAFT.includes(id)))throw Error('Tarifas de aeronaves no válidas.');
 const next=defaultRates();for(const id of AIRCRAFT){const row=value[id]||next[id];next[id]={flightCents:cents(row.flightCents,id),groundCents:cents(row.groundCents,id),noShowCents:cents(row.noShowCents??next[id].noShowCents,id)};}
 return next;
}
function protect(before,after){
 const oldNoShows=new Map();for(const [kind,people]of [['student',list(before.school?.students)],['client',list(before.school?.registry?.clients)]])for(const person of people)for(const expense of list(person.expenses))if(expense.noShowId)oldNoShows.set(expense.noShowId,{owner:kind+':'+person.id,value:JSON.stringify(expense)});
 for(const [kind,people]of [['student',list(after.school?.students)],['client',list(after.school?.registry?.clients)]])for(const person of people)for(const expense of list(person.expenses))if(expense.noShowId){const old=oldNoShows.get(expense.noShowId);if(!old||old.owner!==kind+':'+person.id||old.value!==JSON.stringify(expense))throw Error('Los cargos de no show y sus firmas solo cambian desde sus operaciones autorizadas.');oldNoShows.delete(expense.noShowId);}
 if(oldNoShows.size)throw Error('No se pueden eliminar cargos o firmas de no show.');
 if(JSON.stringify(before.school?.honorarios?.rates||{})!==JSON.stringify(after.school?.honorarios?.rates||{})||JSON.stringify(before.school?.honorarios?.records||[])!==JSON.stringify(after.school?.honorarios?.records||[])||JSON.stringify(before.school?.honorarios?.rateHistory||[])!==JSON.stringify(after.school?.honorarios?.rateHistory||[]))throw Error('Tarifas y movimientos históricos solo cambian desde Honorarios.');
 const oldEntries=new Map(list(before.school?.registry?.entries).map(e=>[String(e.id),e]));
 for(const entry of list(after.school?.registry?.entries)){const old=oldEntries.get(String(entry.id));if(!old)continue;
  if(old.bookStatus==='no-show'&&JSON.stringify(old)!==JSON.stringify(entry))throw Error('La bitácora del no show no se puede modificar después de guardar el cargo.');
  if(old.pilotHonorarium&&['date','aircraft','book','operationType','hours100','timeOnGround100','pilot','pilotId','pilotHonorarium'].some(field=>JSON.stringify(old[field])!==JSON.stringify(entry[field])))throw Error('Una bitácora con honorarios registrados no se puede modificar.');
  for(const field of ['bookStatus','pilotId','pilotHonorarium','instructorHonorariumCents','cancellationReason'])if(JSON.stringify(old[field])!==JSON.stringify(entry[field]))throw Error('El resultado de bitácora y sus honorarios registrados no se pueden cambiar desde esta operación.');
  oldEntries.delete(String(entry.id));
 }
 if([...oldEntries.values()].some(e=>e.bookStatus==='no-show'||e.pilotHonorarium||e.instructorHonorariumCents))throw Error('No se puede eliminar una bitácora que ya registró honorarios o un no show.');
}
module.exports={AIRCRAFT,aircraftKey,defaultRates,rates,period,validDate,addFlightPay,applyNewEntries,report,validateRates,protect};
