'use strict';

const AIRCRAFT=['HP1784','HP1819','HP1930','HP1815','HP1579','HP1907','HP880BL','HP18BLM','HP1186','HP1805BLM','HP11BL'];
const aircraftKey=value=>String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const defaultRates=()=>Object.fromEntries(AIRCRAFT.map(id=>[id,{flightCents:['HP880BL','HP1805BLM'].includes(id)?5000:['HP18BLM','HP1186','HP11BL'].includes(id)?10000:3000,groundCents:id==='HP11BL'?10000:5000}]));
const list=v=>Array.isArray(v)?v:[];
const cents=(value,label)=>{if(!Number.isSafeInteger(value)||value<0||value>100000000)throw Error('Revisa la tarifa de '+label+'.');return value;};
function rates(data){return {...defaultRates(),...(data.school?.honorarios?.rates||{})};}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function utcDate(value){return new Date(value+'T12:00:00Z');}
function shift(value,days){const d=utcDate(value);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function period(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Fecha de honorarios no válida.');
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
 let start,end,label;
 if(day>=25){start=date.slice(0,8)+'25';const next=month===12?`${year+1}-01-10`:`${year}-${String(month+1).padStart(2,'0')}-10`;end=next;label='25 al 10';}
 else if(day<=10){const prev=month===1?`${year-1}-12-25`:`${year}-${String(month-1).padStart(2,'0')}-25`;start=prev;end=date.slice(0,8)+'10';label='25 al 10';}
 else{start=date.slice(0,8)+'11';end=date.slice(0,8)+'24';label='11 al 24';}
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
 after.school ||= {};after.school.registry ||= {entries:[],clients:[],destinations:[]};after.school.honorarios ||= {};
 const records=after.school.honorarios.records ||= [],tariffs=rates(after);
 for(const entry of list(after.school.registry.entries)){
  if(oldIds.has(entry.id))continue;
  const status=entry.bookStatus;
  if(!['flown','weather','maintenance','cancelled','no-show'].includes(status))throw Error('Selecciona el resultado de la bitácora.');
  if(!validDate(entry.date))throw Error('La fecha del registro de bitácora no es válida.');
  const aircraft=aircraftKey(entry.aircraft);if(status==='flown'?!AIRCRAFT.includes(aircraft)&&!['SIMULADOR','RPA'].includes(aircraft):!AIRCRAFT.includes(aircraft))throw Error('Selecciona una aeronave registrada para este resultado.');
  if(account.role==='Piloto'){
   if(account.syncStatus!=='matched'||account.recordKind!=='pilot'||!account.recordId)throw Error('Vincula tu usuario con un expediente de piloto.');
   entry.pilotId=String(account.recordId);entry.pilot=String(account.recordName||entry.pilot||'').trim();
  }else{
   const pilot=list(before.pilotos).find(p=>String(p.id)===String(entry.pilotId)||String(p.nombre||p.name||'').trim().toLocaleLowerCase('es')===String(entry.pilot||'').trim().toLocaleLowerCase('es'));
   if(!pilot)throw Error('Vincula el nombre con un expediente de piloto antes de guardar la bitácora.');entry.pilotId=String(pilot.id);entry.pilot=pilot.nombre||pilot.name;
  }
  if(status==='flown'){
   if(!String(entry.book||'').trim()||!(Number(entry.hours100)>0))throw Error('El número de bitácora y las horas son obligatorios para registrar el vuelo.');
   const rateKey=aircraftKey(entry.aircraft);if(!AIRCRAFT.includes(rateKey))continue;
   const rate=tariffs[rateKey];if(!rate)throw Error('No hay tarifa configurada para '+entry.aircraft+'.');
   const pay=addFlightPay(entry,rate);entry.pilotHonorarium={...pay,createdAt:new Date().toISOString()};
   records.push({id:'flight-'+entry.id,entryId:entry.id,pilotId:entry.pilotId,pilot:entry.pilot,date:entry.date,aircraft:entry.aircraft,kind:entry.operationType==='charter'?'charter':'flight',...pay,createdAt:entry.pilotHonorarium.createdAt});
  }else if(status==='cancelled'&&!String(entry.cancellationReason||'').trim())throw Error('La cancelación requiere un motivo.');
  if(status==='no-show'){
   if(entry.personKind!=='student')throw Error('El no show debe vincularse al expediente de un estudiante.');
   const student=activeStudents(after).find(s=>s.id===entry.personId);if(!student)throw Error('Selecciona el expediente del estudiante del vuelo.');
   student.expenses ||= [];const expenseId='no-show-'+entry.id;
   if(student.expenses.some(e=>e.noShowId===entry.id))throw Error('El cargo de no show ya existe.');
   student.expenses.push({id:expenseId,noShowId:entry.id,date:entry.date,cents:10000,description:'Cargo por no show',aircraft:entry.aircraft,source:'Bitácora '+(entry.book||entry.id),note:'Pendiente de aprobación del estudiante',createdAt:new Date().toISOString(),acceptance:null});
   const instructorPay={id:'no-show-'+entry.id,entryId:entry.id,pilotId:entry.pilotId,pilot:entry.pilot,date:entry.date,aircraft:entry.aircraft,kind:'no-show',totalCents:3000,createdAt:new Date().toISOString()};records.push(instructorPay);entry.instructorHonorariumCents=3000;
  }
 }
}
function report(data,pilotId,date){
 const selected=period(date),stored=rates(data),pilotRows=list(data.pilotos),pilots=new Map(pilotRows.map(p=>[String(p.id),p.nombre||p.name||'Piloto'])),records=list(data.school?.honorarios?.records),rows=records.filter(r=>r.date>=selected.start&&r.date<=selected.end&&(!pilotId||String(r.pilotId)===String(pilotId))).map(r=>({...r,pilot:r.pilot||pilots.get(String(r.pilotId))||'Piloto'}));
 // Include flown entries missing from the ledger to keep an interrupted migration visible.
 for(const entry of list(data.school?.registry?.entries)){
  if(typeof entry.date!=='string'||entry.date<selected.start||entry.date>selected.end||entry.bookStatus!=='flown'||!(Number(entry.hours100)>0)||!AIRCRAFT.includes(aircraftKey(entry.aircraft))||records.some(r=>r.entryId===entry.id))continue;
  const matches=pilotRows.filter(p=>String(p.nombre||p.name||'').trim().toLocaleLowerCase('es')===String(entry.pilot||'').trim().toLocaleLowerCase('es'));
  const linkedPilotId=entry.pilotId|| (matches.length===1?String(matches[0].id):''),displayName=entry.pilot||pilots.get(String(linkedPilotId))||'Piloto';if(pilotId&&String(linkedPilotId)!==String(pilotId))continue;
  const pay=entry.pilotHonorarium||addFlightPay(entry,stored[aircraftKey(entry.aircraft)]);
  rows.push({id:'flight-'+entry.id,entryId:entry.id,pilotId:linkedPilotId,pilot:displayName,date:entry.date,aircraft:entry.aircraft,kind:entry.operationType==='charter'?'charter':'flight',...pay});
 }
 const grouped=new Map();for(const row of rows){const kind=row.kind==='charter'?'charter':row.kind==='no-show'?'no-show':'flight',key=String(row.pilotId)+'|'+row.aircraft+'|'+kind;if(!grouped.has(key))grouped.set(key,{pilotId:row.pilotId,pilot:row.pilot,aircraft:row.aircraft,kind,flightHours100:0,groundHours100:0,totalCents:0,entries:0});const g=grouped.get(key);g.flightHours100+=Number(row.flightHours100||0);g.groundHours100+=Number(row.timeOnGround100||0);g.totalCents+=Number(row.totalCents||0);g.entries++;}
 return {period:selected,rates:stored,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||String(a.pilot).localeCompare(String(b.pilot),'es')),groups:[...grouped.values()].sort((a,b)=>a.pilot.localeCompare(b.pilot,'es')||a.aircraft.localeCompare(b.aircraft)||a.kind.localeCompare(b.kind))};
}
function validateRates(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(id=>!AIRCRAFT.includes(id)))throw Error('Tarifas de aeronaves no válidas.');
 const next=defaultRates();for(const id of AIRCRAFT){const row=value[id]||next[id];next[id]={flightCents:cents(row.flightCents,id),groundCents:cents(row.groundCents,id)};}
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
