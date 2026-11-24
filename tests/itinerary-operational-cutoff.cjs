'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../functions/itinerary-engine'),M=require('../functions/itinerary-model');

const request=(aircraft,flightType='privado')=>({id:'fictional-'+aircraft,pilot:'d',aircraft,slot:'b1',start:'06:30',end:'09:30',flightType,socioName:flightType==='socio'?'Socio de prueba':'',created:1});
const base=()=>{const s=require('./fixtures/itinerary-initial.cjs')();s.requests=[];s.confirmed=[];return s;};
function fixture(){
 const fleet=Object.fromEntries(E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo'}]));
 const pilot={id:'p1',nombre:'Piloto Uno',email:'piloto@example.test',medico:'2027-12-31'};
 return {fleet,pilotos:[pilot],itinerarios:[],school:{students:[{id:'s1',name:'Estudiante Uno'}],registry:{clients:[]},personnel:[]},itinerary:{version:1,config:{},days:{},notices:[]}};
}

test('operational and maintenance aircraft are requestable across the fleet; grounded is excluded',()=>{
 const s=base();
 for(const [id,,category] of E.fleet){
  const a=s.aircraft.find(row=>row.id===id),type=category==='Monomotor'?'privado':id==='HP880BL'?'multi':'socio';
  a.status='operativo';assert.equal(E.requestSelectable(a),true,id);assert.ok(E.requestSlots(a,s.date).length,id);
  const q=request(id,type);assert.equal(E.requestError(s,q),'',id+' operative request');
  a.status='mantenimiento';assert.equal(E.requestSelectable(a),true,id);assert.ok(E.requestSlots(a,s.date).length,id);
  assert.equal(E.requestError(s,q),'',id+' maintenance request');
  a.status='grounded';assert.equal(E.requestSelectable(a),false,id);assert.deepEqual(E.requestSlots(a,s.date),[],id);
  assert.match(E.requestError(s,q),/GROUNDED/);
 }
});

test('maintenance request can be reassigned to an operative compatible monomotor only',()=>{
 const s=base(),mono=s.aircraft.find(a=>a.id==='HP1907');mono.status='mantenimiento';
 const monoRequest=request('HP1907');assert.equal(E.requestError(s,monoRequest),'');s.requests=[monoRequest];
 const result=E.simulate(s),monoAssignment=result.assignments.find(f=>f.sourceRequestId===monoRequest.id);
 assert.ok(monoAssignment);assert.notEqual(monoAssignment.aircraft,'HP1907');assert.equal(s.aircraft.find(a=>a.id===monoAssignment.aircraft).status,'operativo');
 const multi=s.aircraft.find(a=>a.id==='HP880BL');multi.status='mantenimiento';s.requests=[request('HP880BL','multi')];
 const blocked=E.simulate(s);assert.equal(blocked.assignments.length,0);assert.equal(blocked.results[0].status,'waiting');assert.match(blocked.results[0].reason,/operativa al cierre de las 8:00 p\. m\./);
});

test('the server response warns a pilot when the selected aircraft is in maintenance',()=>{
 const data=fixture(),date='2026-11-25';data.fleet.HP_1907.status='mantenimiento';
 data.school.accessConfiguration={roles:{Piloto:{itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:false},create:{view:true,edit:true},requests:{view:true,edit:true}}}}}};
 const actor={user:{uid:'pilot-user',email:'piloto@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:'2026-11-24T10:00:00-05:00'}};
 assert.equal(M.scope(data,actor).view,true);
 const result=M.apply(data,actor,{date,command:'request',actionId:'maintenance-request-0001',revision:M.day(data,date).revision,flight:{...request('HP1907'),route:'MPMG - MPCE - MPMG',studentId:'student:s1',studentName:'Estudiante Uno',note:''}},'2026-11-24T10:00:00-05:00');
 assert.match(result.actionWarning,/está en mantenimiento/i);
 assert.equal(M.day(data,date).requests.length,1);
});

test('the 20:00 aircraft snapshot survives draft recalculation and publication',()=>{
 const data=fixture(),date='2026-11-25',atCutoff='2026-11-24T20:00:00-05:00';
 M.day(data,date).requests.push({...request('HP1907'),id:'pending-1',pilot:'p1',status:'pending',sourceSlots:E.sourceSnapshot(M.stateFor(data,date,atCutoff).aircraft.find(a=>a.id==='HP1907'),request('HP1907'))});
 data.fleet.HP_1907.status='mantenimiento';
 M.createDraftPlan(data,date,atCutoff);
 const plan=M.day(data,date).draftPlan,scheduled=plan.assignments.find(q=>q.sourceRequestId==='pending-1');
 assert.equal(plan.operationalSnapshotAt,atCutoff);
 assert.ok(!plan.operationalAircraftIds.includes('HP1907'));
 assert.ok(scheduled);assert.notEqual(scheduled.aircraft,'HP1907');
 const before=structuredClone(data);data.fleet.HP_1907.status='operativo';
 M.reconcile(before,data,'2026-11-24T20:05:00-05:00');
 assert.equal(M.day(data,date).draftPlan.operationalSnapshotAt,atCutoff,'recalculations retain the original 20:00 cutoff timestamp');
 assert.ok(!M.day(data,date).draftPlan.operationalAircraftIds.includes('HP1907'),'later operation does not expand the 20:00 snapshot');
 assert.notEqual(M.day(data,date).draftPlan.assignments.find(q=>q.sourceRequestId==='pending-1')?.aircraft,'HP1907');
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 assert.equal(M.day(data,date).published,true);assert.notEqual(data.itinerarios[0].schedule.aircraft,'HP1907');
});

test('publication rejects a plane that was operative at 20:00 but is grounded before 20:15',()=>{
 const data=fixture(),date='2026-11-25',atCutoff='2026-11-24T20:00:00-05:00';
 M.day(data,date).requests.push({...request('HP1907'),id:'pending-2',pilot:'p1',status:'pending'});
 M.createDraftPlan(data,date,atCutoff);
 const assigned=M.day(data,date).draftPlan.assignments.find(q=>q.sourceRequestId==='pending-2');assert.equal(assigned.aircraft,'HP1907');
 data.fleet.HP_1907.status='grounded';
 assert.throws(()=>M.publish(data,date,'2026-11-24T20:15:00-05:00'),/GROUNDED/);
 assert.equal(M.day(data,date).published,false);
});

test('a preconfirmed flight on a non-operational aircraft is held out of the 20:15 publication',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 M.apply(data,director,{date,command:'flight',actionId:'preconfirmed-flight-0001',revision:M.day(data,date).revision,flight:{...request('HP1907'),pilot:'p1',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 data.fleet.HP_1907.status='grounded';M.createDraftPlan(data,date,atCutoff);
 const plan=M.day(data,date).draftPlan,held=plan.assignments.find(q=>q.aircraft==='HP1907');
 assert.equal(held.operationalHold,true);assert.equal(held.publicationStatus,'held');assert.match(held.validationHold,/no estaba operativa/i);
 assert.ok(plan.warnings.some(message=>/previamente agendado/.test(message)));
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 assert.ok(!data.itinerarios.some(f=>M.key(f.aeronave)==='HP1907'));
 assert.ok(M.day(data,date).held.some(q=>q.operationalHold));
 assert.ok(!M.publicationEmail(data,date).flights.some(f=>M.key(f.aircraft)==='HP1907'));
 const beforeRestore=structuredClone(data),emails=[];data.fleet.HP_1907.status='operativo';
 assert.equal(M.reconcile(beforeRestore,data,'2026-11-24T20:30:00-05:00',emails),true);
 assert.ok(data.itinerarios.some(f=>M.key(f.aeronave)==='HP1907'),'the prior flight returns when the aircraft is operational again');
 assert.equal(M.day(data,date).held.length,0);assert.ok(emails.some(email=>email.notificationType==='aircraft-status'&&email.followups?.some(followup=>followup.action==='updated')));
});

test('Director cannot add an aircraft excluded by the saved cutoff; grounded selector is omitted',()=>{
 const data=fixture(),date='2026-11-25',now='2026-11-24T20:00:00-05:00';
 data.fleet.HP_1907.status='mantenimiento';M.createDraftPlan(data,date,now);
 const state=M.stateFor(data,date,'2026-11-24T20:05:00-05:00'),q={...request('HP1907'),createdByRole:'director'};
 assert.match(E.directorFlightError(state,q),/cierre de las 8:00 p\. m\./);
 const ui=require('node:fs').readFileSync(require.resolve('../itinerary-ui.js'),'utf8');
 assert.match(ui,/function flightAircraftChoices\(state,type,role\)\{return state\.aircraft\.filter\(a=>a\.status!=='grounded'/);
 assert.match(ui,/E\.requestSelectable\(a\)/);assert.match(ui,/MANTENIMIENTO\. Puedes enviar la solicitud/);
});
