'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),M=require('../functions/itinerary-model');
const now='2026-10-30T13:00:00-05:00',date='2026-10-31';
const policy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:false},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
const director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:now},director:true};
const pilot=id=>({user:{uid:id,email:id+'@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:now},director:false});
function fixture(){return {fleet:Object.fromEntries(M.E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo'}])),pilotos:[{id:'p1',nombre:'Piloto Uno',email:'p1@example.test',medico:'2027-12-31'},{id:'p2',nombre:'Piloto Dos',email:'p2@example.test',medico:'2027-12-31'}],itinerarios:[],school:{students:[{id:'fixture-student',name:'Estudiante Delegación'}],registry:{clients:[]},accessConfiguration:{roles:{Piloto:structuredClone(policy),Administrativo:structuredClone(policy)}}},itinerary:{version:1,config:{},days:{},notices:[]}};}
let sequence=0;
function apply(d,actor,command,fields={},at=now){return M.apply(d,actor,{date,command,actionId:'delegation-test-'+String(++sequence).padStart(4,'0'),revision:M.day(d,date).revision,configurationRevision:d.itinerary.config.revision||0,...fields},at);}
const flight=(pilotId='p1',aircraft='HP1907',extra={})=>({pilot:pilotId,aircraft,start:'06:30',end:'09:30',slot:'b1',flightType:'privado',route:'MPMG – Chitré',note:'',studentId:'student:fixture-student',studentName:'Estudiante Delegación',...extra});

test('the shared server rule accepts letters, digits, signs and internal spaces up to 30 trimmed characters',()=>{
 const state=M.stateFor(fixture(),date,now);
 for(const number of ['FAA-26 / 007 #A +B','A'.repeat(30),' '+('A'.repeat(30))+' '])assert.equal(M.E.flightDataError(state,{flightType:'examen',delegationNumber:number}),'',JSON.stringify(number));
 for(const number of [undefined,'','   ','A'.repeat(31),'AB\u0001CD','AB\u007fCD','AB\nCD'])assert.match(M.E.flightDataError(state,{flightType:'examen',delegationNumber:number}),/número de delegación válido/);
 assert.equal(M.E.flightDataError(state,{flightType:'privado',delegationNumber:''}),'');
});
test('request, Director and released-slot forms use the shared delegation validator',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../itinerary-ui.js'),'utf8');
 assert.equal((ui.match(/setCustomValidity\(exam\?E\.delegationNumberError\(form\.elements\.delegationNumber\.value\):''\)/g)||[]).length,2);
 assert.equal((ui.match(/name="delegationNumber" type="text" maxlength="30"/g)||[]).length,0);
 assert.equal((ui.match(/name="delegationNumber" type="text"/g)||[]).length,2);
});

test('pilot requests and modifications retain normalized alphanumeric delegation and blank observations',()=>{
 const d=fixture(),raw='  FAA-26 / 007 #A +B  ';
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:raw})});
 let request=M.day(d,date).requests[0];assert.equal(request.delegationNumber,'FAA-26 / 007 #A +B');assert.equal(request.note,'');
 assert.equal(M.view(d,pilot('p1'),date,now).state.requests[0].delegationNumber,request.delegationNumber);
 const updated='  89-REV/2 + CHECK #A  ';
 apply(d,pilot('p1'),'request',{id:request.id,flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:updated})});
 request=M.day(d,date).requests[0];assert.equal(request.delegationNumber,'89-REV/2 + CHECK #A');
 assert.equal(M.view(d,pilot('p1'),date,now).state.requests[0].delegationNumber,request.delegationNumber);
 apply(d,director,'approve',{id:request.id});
 assert.equal(d.itinerarios[0].schedule.delegationNumber,'89-REV/2 + CHECK #A');
 assert.equal(M.view(d,director,date,now).state.confirmed[0].delegationNumber,'89-REV/2 + CHECK #A');
 for(const invalid of ['   ','A'.repeat(31),'AB\u0001CD'])assert.throws(()=>apply(fixture(),pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:invalid})}),/número de delegación válido/);
});

test('Director can schedule and edit an exam without truncating its delegation',()=>{
 const d=fixture();
 apply(d,director,'flight',{flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:'  EX-26 / 004 #B +1  '})});
 let row=d.itinerarios[0];assert.equal(row.schedule.delegationNumber,'EX-26 / 004 #B +1');assert.equal(row.observaciones,'');
 assert.equal(M.view(d,director,date,now).state.confirmed[0].delegationNumber,'EX-26 / 004 #B +1');
 apply(d,director,'flight',{id:row.id,originalDate:date,originalRevision:M.day(d,date).revision,flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:'  REVISED / 2026 #7 +A  '})});
 row=d.itinerarios[0];assert.equal(row.schedule.delegationNumber,'REVISED / 2026 #7 +A');
 assert.equal(M.view(d,director,date,now).state.confirmed[0].delegationNumber,'REVISED / 2026 #7 +A');
 assert.throws(()=>apply(fixture(),director,'flight',{flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:'X'.repeat(31)})}),/número de delegación válido/);
});

test('exam requests keep priority over overlapping private requests after publication',()=>{
 const d=fixture();
 apply(d,director,'settings',{typeRules:{examen:['HP1907'],privado:['HP1907']},aircraft:'HP1907',slots:[{id:'b1',start:'06:30',end:'09:30'},{id:'b2',start:'10:00',end:'10:30'},{id:'b3',start:'11:00',end:'11:30'},{id:'b4',start:'12:00',end:'12:30'},{id:'b5',start:'13:00',end:'13:30'}]});
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'privado'})});
 apply(d,pilot('p2'),'request',{flight:flight('p2','HP1907',{flightType:'examen',delegationNumber:'FAA 2026 / EX-9 #1'})});
 M.publish(d,date,now);
 const exam=d.itinerarios.find(row=>row.schedule.flightType==='examen'),privateResult=M.day(d,date).results.find(row=>row.flightType==='privado');
 assert(exam);assert.equal(exam.schedule.delegationNumber,'FAA 2026 / EX-9 #1');
 assert.equal(exam.aeronave,'HP-1907');assert.equal(privateResult.status,'waiting');assert.match(privateResult.reason,/examen de vuelo tiene prioridad/i);
 assert.equal(M.view(d,pilot('p2'),date,now).state.confirmed.find(row=>row.flightType==='examen').delegationNumber,'FAA 2026 / EX-9 #1');
});

test('a pilot can take a released exam slot with the same server validation and full value',()=>{
 const d=fixture();
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'examen',delegationNumber:'EX-2026 / A #5 +B'})});
 M.publish(d,date,now);const published=d.itinerarios[0];assert.equal(published.schedule.delegationNumber,'EX-2026 / A #5 +B');
 apply(d,pilot('p1'),'cancel-flight',{id:published.id,reason:'Prueba ficticia'});
 const open=M.day(d,date).openSlots[0];assert(open);assert.equal(open.flightType,'examen');
 assert.throws(()=>apply(d,pilot('p2'),'claim-open-slot',{id:open.id,flight:flight('p2',open.aircraft,{flightType:'examen',delegationNumber:'AB\u0001CD'})}),/número de delegación válido/);
 assert.equal(M.day(d,date).openSlots[0].id,open.id,'invalid claim leaves the synthetic slot available');
 apply(d,pilot('p2'),'claim-open-slot',{id:open.id,flight:flight('p2',open.aircraft,{flightType:'examen',delegationNumber:'  CLAIM / 26 #2 +A  '})});
 const claimed=d.itinerarios.find(row=>row.piloto==='Piloto Dos');assert.equal(claimed.schedule.delegationNumber,'CLAIM / 26 #2 +A');
 assert.equal(M.view(d,pilot('p2'),date,now).state.confirmed.find(row=>row.pilot==='p2').delegationNumber,'CLAIM / 26 #2 +A');
});
