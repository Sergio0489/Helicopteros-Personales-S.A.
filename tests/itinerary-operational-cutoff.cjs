'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../functions/itinerary-engine'),M=require('../functions/itinerary-model');

const request=(aircraft,flightType='privado')=>({id:'fictional-'+aircraft,pilot:'d',aircraft,slot:'b1',start:'06:30',end:'09:30',flightType,socioName:flightType==='socio'?'Socio de prueba':'',created:1});
const base=()=>{const s=require('./fixtures/itinerary-initial.cjs')();s.requests=[];s.confirmed=[];return s;};
function fixture(){
 const fleet=Object.fromEntries(E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo'}]));
 const pilot={id:'p1',nombre:'Piloto Uno',email:'piloto@example.test',medico:'2027-12-31'};
 const policy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:true},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
 return {fleet,pilotos:[pilot],itinerarios:[],school:{students:[{id:'s1',name:'Estudiante Uno'},{id:'s2',name:'Estudiante Dos'}],registry:{clients:[]},personnel:[],accessConfiguration:{roles:{Piloto:policy}}},itinerary:{version:1,config:{},days:{},notices:[]}};
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

test('20:00 draft relocates approved and Director-booked flights off maintenance and grounded aircraft, then publishes them at 20:15',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 const pending={...request('HP1907'),id:'approved-request-1',pilot:'p1',status:'pending',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',created:1};
 M.day(data,date).requests.push(pending);
 M.apply(data,director,{date,command:'approve',id:pending.id,actionId:'approve-flight-0001',revision:M.day(data,date).revision},beforeCutoff);
 M.apply(data,director,{date,command:'flight',actionId:'director-flight-0001',revision:M.day(data,date).revision,flight:{...request('HP1815'),start:'09:30',end:'12:30',pilot:'p1',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 const original=structuredClone(data.itinerarios.filter(f=>f.fecha===date));
 data.fleet.HP_1907.status='grounded';data.fleet.HP_1815.status='mantenimiento';
 const draftEmail=M.createDraftPlan(data,date,atCutoff),plan=M.day(data,date).draftPlan;
 assert.ok(draftEmail?.draft);assert.deepEqual(data.itinerarios.filter(f=>f.fecha===date),original,'draft creation leaves the public schedule untouched');
 const directorOfficial=original.find(f=>f.id!=='approved-'+pending.id),approved=plan.assignments.find(q=>q.sourceRequestId===pending.id),directorBooked=plan.assignments.find(q=>q.id===directorOfficial?.id);
 assert.ok(approved);assert.ok(directorBooked);
 for(const moved of [approved,directorBooked]){
  assert.notEqual(moved.aircraft,'HP1907');assert.notEqual(moved.aircraft,'HP1815');
  assert.equal(moved.pilot,'p1');assert.equal(moved.studentId,'student:s1');
  assert.equal(moved.start,moved.id===approved.id?'06:30':'09:30');
  assert.equal(moved.end,moved.id===approved.id?'09:30':'12:30');
  assert.equal(moved.operationalHold,undefined);assert.equal(moved.relocation.from,moved.id===approved.id?'HP1907':'HP1815');
 }
 assert.equal(approved.id,'approved-'+pending.id);assert.equal(directorBooked.id,directorOfficial?.id);
 assert.equal(approved.aircraft,directorBooked.aircraft,'the same aircraft may take both flights when they are consecutive and conflict-free');
 assert.ok(plan.warnings.some(message=>/se reubicaron automáticamente/.test(message)));
 assert.deepEqual(draftEmail.pilotRecipients,[]);assert.deepEqual(draftEmail.mechanicRecipients,[]);
 M.apply(data,director,{date,command:'flight',id:directorBooked.id,originalDate:date,actionId:'edit-relocated-flight-0001',revision:M.day(data,date).revision,originalRevision:M.day(data,date).revision,flight:{...directorBooked,note:'Ajuste ficticio de Dirección'}},'2026-11-24T20:05:00-05:00');
 const edited=M.day(data,date).draftPlan.assignments.find(q=>q.id===directorBooked.id);
 assert.equal(edited.note,'Ajuste ficticio de Dirección');assert.equal(edited.aircraft,directorBooked.aircraft);assert.equal(edited.relocation.from,'HP1815');
 const pilotActor={user:{uid:'pilot-user',email:'piloto@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:beforeCutoff}};
 const directorView=M.view(data,director,date,atCutoff),pilotView=M.view(data,pilotActor,date,atCutoff);
 assert.equal(directorView.state.draftMode,true);assert.equal(directorView.state.confirmed.find(q=>q.id===approved.id).aircraft,approved.aircraft);
 assert.equal(pilotView.state.draftMode,undefined);assert.equal(pilotView.state.confirmed.find(q=>q.id===approved.id).aircraft,'HP1907','other users still see the previously published schedule, not the private relocation');
 assert.equal(pilotView.state.confirmed.find(q=>q.id===approved.id).relocation,undefined,'unpublished relocation details are private to Director');
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 const final=data.itinerarios.filter(f=>f.fecha===date);
 assert.equal(final.length,2);assert.deepEqual(final.map(f=>f.id).sort(),original.map(f=>f.id).sort(),'both preconfirmed flights remain present exactly once');
 assert.ok(final.every(f=>!['HP-1907','HP-1815'].includes(f.aeronave)));
 assert.equal(M.day(data,date).held.length,0);
 const publicEmail=M.publicationEmail(data,date);assert.equal(publicEmail.flights.length,2);assert.ok(publicEmail.flights.every(f=>f.relocationFrom));
 const publishedView=M.view(data,pilotActor,date,'2026-11-24T20:16:00-05:00');
 assert.equal(publishedView.state.draftMode,undefined);assert.equal(publishedView.state.confirmed.length,2);
 assert.ok(publishedView.state.confirmed.every(q=>!['HP1907','HP1815'].includes(q.aircraft)));
});

test('a preconfirmed flight stays held when no allowed operative aircraft can take it',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 M.apply(data,director,{date,command:'flight',actionId:'preconfirmed-flight-0001',revision:M.day(data,date).revision,flight:{...request('HP1907'),pilot:'p1',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 data.itinerary.config.typeRules={...E.defaultTypeRules(),privado:['HP1907']};data.fleet.HP_1907.status='grounded';M.createDraftPlan(data,date,atCutoff);
 const plan=M.day(data,date).draftPlan,held=plan.assignments.find(q=>q.aircraft==='HP1907');
 assert.equal(held.operationalHold,true);assert.equal(held.publicationStatus,'held');assert.match(held.validationHold,/no estaba operativa/i);
 assert.ok(plan.warnings.some(message=>/no pudieron reubicarse automáticamente/.test(message)));
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 assert.ok(!data.itinerarios.some(f=>M.key(f.aeronave)==='HP1907'));
 assert.ok(M.day(data,date).held.some(q=>q.operationalHold));
 assert.ok(!M.publicationEmail(data,date).flights.some(f=>M.key(f.aircraft)==='HP1907'));
 const beforeRestore=structuredClone(data),emails=[];data.fleet.HP_1907.status='operativo';
 assert.equal(M.reconcile(beforeRestore,data,'2026-11-24T20:30:00-05:00',emails),true);
 assert.ok(data.itinerarios.some(f=>M.key(f.aeronave)==='HP1907'),'the prior flight returns when the aircraft is operational again');
 assert.equal(M.day(data,date).held.length,0);assert.ok(emails.some(email=>email.notificationType==='aircraft-status'&&email.followups?.some(followup=>followup.action==='updated')));
});

test('automatic relocation must fit the replacement aircraft enabled blocks exactly',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 M.apply(data,director,{date,command:'flight',actionId:'restricted-block-flight-0001',revision:M.day(data,date).revision,flight:{...request('HP1907'),pilot:'p1',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 data.itinerary.config.typeRules={...E.defaultTypeRules(),privado:['HP1784']};
 M.day(data,date).blocks={HP1784:[{id:'b3',start:'12:30',end:'15:30'}]};data.fleet.HP_1907.status='grounded';M.createDraftPlan(data,date,atCutoff);
 const plan=M.day(data,date).draftPlan,held=plan.assignments.find(q=>q.aircraft==='HP1907');
 assert.equal(held.operationalHold,true);assert.equal(held.start,'06:30');assert.equal(held.end,'09:30');
 assert.ok(!plan.assignments.some(q=>q.aircraft==='HP1784'&&!q.operationalHold),'the available block starts too late for this exact flight interval');
 assert.ok(plan.warnings.some(message=>/no pudieron reubicarse automáticamente/.test(message)));
});

test('overlapping fixed flights competing for one replacement cannot be assigned together',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 data.pilotos.push({id:'p2',nombre:'Piloto Dos',email:'piloto2@example.test',medico:'2027-12-31'});
 for(const [index,aircraft,pilot,studentId,studentName] of [[1,'HP1907','p1','student:s1','Estudiante Uno'],[2,'HP1815','p2','student:s2','Estudiante Dos']]){
  M.apply(data,director,{date,command:'flight',actionId:'competing-flight-'+index+'-0001',revision:M.day(data,date).revision,flight:{...request(aircraft),pilot,studentId,studentName,route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 }
 data.itinerary.config.typeRules={...E.defaultTypeRules(),privado:['HP1784']};
 data.fleet.HP_1907.status='grounded';data.fleet.HP_1815.status='mantenimiento';M.createDraftPlan(data,date,atCutoff);
 const assignments=M.day(data,date).draftPlan.assignments,active=assignments.filter(q=>q.aircraft==='HP1784'&&!q.operationalHold),held=assignments.filter(q=>q.operationalHold);
 assert.equal(active.length,1,'only one overlapping flight can occupy the sole eligible replacement');
 assert.equal(held.length,1,'the other flight remains held for Director review');
 assert.equal(active[0].start,'06:30');assert.equal(active[0].end,'09:30');
 assert.ok(assignments.every(q=>q.id===active[0].id||q.aircraft!=='HP1784'||q.operationalHold||!E.overlaps(q,active[0])));
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 assert.equal(data.itinerarios.filter(q=>q.fecha===date).length,1);
 assert.equal(M.day(data,date).held.length,1);
});

test('Charter remains fixed for Director review when its selected aircraft is unavailable',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 M.apply(data,director,{date,command:'flight',actionId:'charter-fixed-flight-0001',revision:M.day(data,date).revision,flight:{...request('HP11BL','charter'),pilot:'p1',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 const official=data.itinerarios.find(f=>f.fecha===date);assert.ok(official);
 data.fleet.HP_11BL.status='mantenimiento';M.createDraftPlan(data,date,atCutoff);
 const held=M.day(data,date).draftPlan.assignments.find(q=>q.id===official.id);
 assert.equal(held.aircraft,'HP11BL');assert.equal(held.operationalHold,true);
 assert.match(held.validationHold,/chárter conservan su aeronave.*revisión manual de Dirección/i);
 assert.ok(!M.day(data,date).draftPlan.assignments.some(q=>q.id===official.id&&q.aircraft==='HP880BL'));
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

test('a recovered aircraft restores its preconfirmed flights in the private draft before 20:15',()=>{
 const data=fixture(),date='2026-11-25',beforeCutoff='2026-11-24T19:00:00-05:00',atCutoff='2026-11-24T20:00:00-05:00',director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:beforeCutoff},director:true};
 M.day(data,date).requests.push({...request('HP1907'),id:'new-request-after-cutoff',pilot:'p1',start:'09:30',end:'12:30',status:'pending',studentId:'student:s2',studentName:'Estudiante Dos',route:'MPMG - MPCE - MPMG',created:2});
 M.apply(data,director,{date,command:'flight',actionId:'preconfirm-recovery-0001',revision:M.day(data,date).revision,flight:{id:'fixed-flight-recovery-1',aircraft:'HP1907',pilot:'p1',start:'06:30',end:'09:30',slot:'b1',flightType:'privado',studentId:'student:s1',studentName:'Estudiante Uno',route:'MPMG - MPCE - MPMG',note:''}},beforeCutoff);
 const original=data.itinerarios.find(f=>f.fecha===date);assert.ok(original);
 data.fleet.HP_1907.status='mantenimiento';M.createDraftPlan(data,date,atCutoff);
 const initialPlan=M.day(data,date).draftPlan,displaced=initialPlan.assignments.find(q=>q.id===original.id);
 assert.ok(displaced);assert.notEqual(displaced.aircraft,'HP1907');assert.ok(!initialPlan.operationalAircraftIds.includes('HP1907'));
 const before=structuredClone(data);data.fleet.HP_1907.status='operativo';M.reconcile(before,data,'2026-11-24T20:05:00-05:00',[]);
 let plan=M.day(data,date).draftPlan,restored=plan.assignments.find(q=>q.id===original.id),newRequest=plan.assignments.find(q=>q.sourceRequestId==='new-request-after-cutoff');
 assert.equal(restored.aircraft,'HP1907');assert.equal(restored.restoredAfterCutoff,'HP1907');
 assert.ok(newRequest);assert.notEqual(newRequest.aircraft,'HP1907','new requests still respect the 20:00 aircraft cutoff');
 assert.ok(!plan.operationalAircraftIds.includes('HP1907'),'the 20:00 cutoff remains unchanged for new assignments');
 assert.ok(plan.warnings.some(message=>/restablecerse sus operaciones/.test(message)));
 const beforeSecondChange=structuredClone(data);data.fleet.HP_1815.status='mantenimiento';M.reconcile(beforeSecondChange,data,'2026-11-24T20:06:00-05:00',[]);
 plan=M.day(data,date).draftPlan;restored=plan.assignments.find(q=>q.id===original.id);newRequest=plan.assignments.find(q=>q.sourceRequestId==='new-request-after-cutoff');
 assert.equal(restored.aircraft,'HP1907');assert.notEqual(newRequest.aircraft,'HP1907','a later draft recalculation preserves the original recovery exception without expanding the cutoff');
 assert.equal(M.publish(data,date,'2026-11-24T20:15:00-05:00'),true);
 const published=data.itinerarios.find(f=>f.id===original.id);
 assert.equal(published.aeronave,'HP-1907');assert.equal(published.schedule.restoredAfterCutoff,undefined);
});
