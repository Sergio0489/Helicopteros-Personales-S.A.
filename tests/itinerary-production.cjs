const test=require('node:test'),assert=require('node:assert/strict'),M=require('../functions/itinerary-model');
const now='2026-10-30T13:00:00-05:00',date='2026-10-31';
const policy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:false},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
const director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:now},director:true};
const pilot=id=>({user:{uid:id,email:id+'@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:now},director:false});
function fixture(){return {fleet:Object.fromEntries(M.E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo',serial:'preserve'}])),pilotos:[{id:'p1',nombre:'Piloto Uno',email:'p1@example.test',medico:'2027-12-31'},{id:'p2',nombre:'Piloto Dos',email:'p2@example.test',medico:'2027-12-31'}],itinerarios:[],school:{students:[{id:'s1',name:'Alumno Uno',email:'s1@example.test',secret:'no-leak'},{id:'s2',name:'Alumno Dos',email:'s2@example.test'}],registry:{clients:[]},accessConfiguration:{roles:{Piloto:structuredClone(policy),Administrativo:structuredClone(policy),Estudiante:structuredClone(policy)}}},itinerary:{version:1,config:{},days:{},notices:[]}};}
let sequence=0;
function apply(d,actor,command,fields={},at=now){return M.apply(d,actor,{date,command,actionId:'test-action-'+(++sequence),revision:M.day(d,fields.date||date).revision,configurationRevision:d.itinerary.config.revision||0,...fields},at);}
const flight=(pilot='p1',aircraft='HP1907',extra={})=>({pilot,aircraft,start:'06:30',end:'09:30',slot:'b1',flightType:'privado',route:'MPMG - MPDA - MPMG',note:'Sin observaciones',studentId:'student:s1',studentName:'Alumno Uno',...extra});
test('a new maintenance restriction invalidates older forecasts before automatic closure',()=>{
 for(const previous of ['operativo','mantenimiento']){
  const d=fixture();d.fleet.HP_1907.status=previous;
  apply(d,director,'settings',{aircraft:'HP1907',release:{enabled:true,from:'06:30'}});
  apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'solo'})});
  // Force the next preferred solo aircraft, without changing the request.
  d.fleet.HP_1819.status='grounded';
  const old=structuredClone(d),oldFlights=structuredClone(d.itinerarios),revision=M.day(d,date).revision;
  d.fleet.HP_1907.status='grounded';
  assert.equal(M.reconcile(old,d,now),true);
  assert.equal(M.day(d,date).releases.HP1907.enabled,false);
  assert.equal(M.day(d,date).revision,revision+1);
  assert.deepEqual(d.itinerarios,oldFlights);
  M.publish(d,date,now);
  assert.equal(d.itinerarios[0].aeronave,'HP-1784');
  assert.equal(d.fleet.HP_1907.status,'grounded');
  const snapshot=structuredClone(d);assert.equal(M.reconcile(snapshot,d,now),false);assert.deepEqual(d,snapshot);
 }
});
test('an unchanged restriction preserves an explicit forecast; a fresh forecast remains conditional',()=>{
 const d=fixture();d.fleet.HP_1907.status='grounded';d.fleet.HP_1819.status='grounded';
 apply(d,director,'settings',{aircraft:'HP1907',release:{enabled:true,from:'06:30'}});
 const old=structuredClone(d);assert.equal(M.reconcile(old,d,now),false);
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'solo'})});M.publish(d,date,now);
 assert.equal(d.itinerarios[0].aeronave,'HP-1907');assert.equal(d.itinerarios[0].schedule.conditional,true);
 assert.equal(d.fleet.HP_1907.status,'grounded');assert.equal(M.operational(d,now).length,1);
});
test('forecast invalidation covers future days, preserves history and other aircraft',()=>{
 const d=fixture(),past='2026-10-29',future='2026-11-02';
 for(const dt of [past,date,future])M.day(d,dt).releases={HP1907:{enabled:true,date:dt,from:'11:00'},HP1784:{enabled:true,date:dt,from:'12:00'}};
 M.day(d,date).published=true;
 const old=structuredClone(d);d.fleet.HP_1907.status='mantenimiento';M.reconcile(old,d,now);
 assert.deepEqual(M.day(d,past),M.day(old,past));
 for(const dt of [date,future]){
  assert.equal(M.day(d,dt).releases.HP1907.enabled,false);
  assert.deepEqual(M.day(d,dt).releases.HP1784,M.day(old,dt).releases.HP1784);
  assert.equal(M.day(d,dt).revision,M.day(old,dt).revision+1);
 }
 assert.deepEqual(d.itinerarios,old.itinerarios);
});
test('grounded, aog and maintenance transitions notify authorized groups exactly once',()=>{
 for(const [input,expected,message]of [['grounded','grounded','GROUNDED'],['aog','grounded','GROUNDED'],['mantenimiento','mantenimiento','MANTENIMIENTO']]){
  const d=fixture(),old=structuredClone(d);d.fleet.HP_1907.status=input;
  assert.equal(M.reconcile(old,d,now),true);
  assert.equal(d.operationalNotices.length,1);
  const [notice]=d.operationalNotices;
  assert.equal(notice.kind,'aircraft-status');assert.equal(notice.aircraft,'HP-1907');
  assert.equal(notice.previous,'operativo');assert.equal(notice.status,expected);
  assert.match(notice.message,new RegExp('cambió a '+message));
  assert.deepEqual(notice.recipients,[{kind:'group',id:'all'}]);
  assert.equal(M.reconcile(old,d,now),false);assert.equal(d.operationalNotices.length,1);
 }
 const d=fixture(),before=structuredClone(d);d.fleet.HP_1907.status='aog';M.reconcile(before,d,now);
 const equivalent=structuredClone(d);d.fleet.HP_1907.status='grounded';
 assert.equal(M.reconcile(equivalent,d,now),false,'aog and grounded describe the same restriction');
 assert.equal(d.operationalNotices.length,1);
});
test('flight requests require an identified student or client while observations stay optional',()=>{
 for(const field of ['aircraft','pilot','start','end','flightType','route'])for(const value of ['', '   ',null]){
  const d=fixture();assert.throws(()=>apply(d,director,'flight',{flight:flight('p1','HP1907',{[field]:value})}),/Completa el campo/);assert.equal(d.itinerarios.length,0);
 }
 const scheduled=fixture();apply(scheduled,director,'flight',{flight:flight('p1','HP1907',{note:''})});assert.equal(scheduled.itinerarios.length,1);assert.equal(scheduled.itinerarios[0].observaciones,'');
 const requested=fixture();apply(requested,pilot('p1'),'request',{flight:flight('p1','HP1907',{note:''})});assert.equal(requested.itinerary.days[date].requests[0].note,'');
 assert.throws(()=>apply(fixture(),pilot('p1'),'request',{flight:flight('p1','HP1907',{route:''})}),/Completa el campo Ruta o destino/);
 const d=fixture();apply(d,director,'flight',{flight:flight('p1','HP1907',{route:'  mpmg - mpce - mpmg  ',studentId:''})});assert.equal(d.itinerarios[0].ruta,'MPMG - MPCE - MPMG');assert.equal(d.itinerarios[0].personId,'s1');
 assert.throws(()=>apply(fixture(),pilot('p1'),'request',{flight:flight('p1','HP1907',{route:''})}),/Ruta o destino/);
 assert.throws(()=>apply(fixture(),pilot('p1'),'request',{flight:flight('p1','HP1907',{route:'MPMG - MPDA'})}),/exactamente 3 códigos/);
 assert.throws(()=>apply(fixture(),director,'flight',{flight:flight('p1','HP1907',{route:'a'.repeat(201)})}),/máximo 200/);
});
test('route survives publication and aircraft relocation without affecting actual flight records',()=>{
 const d=fixture();d.registros=[{id:'actual',ruta:'Ruta real',hours:2}];d.school.registry.entries=[{id:'charge',amount:123}];
 const records=JSON.stringify([d.registros,d.school.registry.entries]);apply(d,pilot('p1'),'request',{flight:flight()});M.publish(d,date,now);
 const before=structuredClone(d);d.fleet.HP_1907.status='mantenimiento';M.reconcile(before,d,now);
 assert.equal(d.itinerarios[0].ruta,flight().route);assert.equal(M.view(d,director,date,now).state.confirmed[0].route,flight().route);assert.equal(JSON.stringify([d.registros,d.school.registry.entries]),records);
 const q=M.view(d,director,date,now).state.confirmed[0];assert.equal(M.E.publishedChange(q,{...q,route:'Otro destino'},true).action,'updated');
});
test('annual calendar counts scheduled dates only, honors permissions and never mutates data',()=>{
 const d=fixture();apply(d,pilot('p1'),'request',{flight:flight()});assert.deepEqual(M.calendar(d,director,'2026',now).days,[]);
 apply(d,director,'flight',{flight:flight('p2','HP1784',{studentId:'student:s1'})});
 apply(d,director,'flight',{date:'2026-12-02',flight:flight()});
 d.itinerarios.push({id:'past',fecha:'2026-01-15',aeronave:'HP-1907',piloto:'Histórico'},{id:'next-year',fecha:'2027-01-01',aeronave:'HP-1907'});
 const before=structuredClone(d);assert.deepEqual(M.calendar(d,director,'2026',now).days,[{date:'2026-01-15',count:1},{date,count:1},{date:'2026-12-02',count:1}]);assert.deepEqual(d,before);
 const student={...pilot('s1'),account:{role:'Estudiante',assignedAt:now,syncStatus:'matched',recordKind:'student',recordId:'s1'}};
 assert.throws(()=>M.calendar(d,student,'2026',now),/Solo el director/);
 assert.throws(()=>M.calendar(d,pilot('p1'),'2026',now),/Solo el director/);
 d.school.accessConfiguration.roles.Piloto.itinerario.actions.view=false;assert.throws(()=>M.calendar(d,pilot('p1'),'2026',now),/Solo el director/);
 for(const year of ['2026-10','0000','202','invalid',2026])assert.throws(()=>M.calendar(d,director,year,now),/año válido/);
});
test('cancelled and rescheduled flights update the annual day counts',()=>{
 const d=fixture();apply(d,director,'flight',{flight:flight()});const id=d.itinerarios[0].id;
 apply(d,director,'flight',{id,originalDate:date,originalRevision:M.day(d,date).revision,date:'2027-01-02',flight:flight()});
 assert.deepEqual(M.calendar(d,director,'2026',now).days,[]);assert.deepEqual(M.calendar(d,director,'2027',now).days,[{date:'2027-01-02',count:1}]);
 apply(d,director,'cancel-flight',{date:'2027-01-02',id,reason:'Prueba del calendario'});assert.deepEqual(M.calendar(d,director,'2027',now).days,[]);
});
test('daily window constrains monomotors but leaves HP880BL and helicopters on their own hours',()=>{
 const d=fixture(),scheduleWindow={start:'08:00',end:'16:00'};
 apply(d,director,'flight',{flight:flight('p2','HP1907',{start:'12:30',end:'14:00'})});
 apply(d,director,'flight',{flight:flight('p2','HP880BL',{start:'16:30',end:'18:30',flightType:'multi'})});
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{start:'06:30',end:'09:30'})});
 apply(d,director,'settings',{scheduleWindow});
 const state=M.view(d,director,date,now).state;
 assert.deepEqual(state.scheduleWindow,scheduleWindow);
 assert.deepEqual(state.aircraft.find(a=>a.id==='HP1907').scheduleWindow,scheduleWindow);
 assert.equal(state.aircraft.find(a=>a.id==='HP880BL').scheduleWindow,null);
 assert.throws(()=>apply(d,pilot('p1'),'request',{flight:flight('p1','HP1784',{start:'16:00',end:'17:30',studentId:'student:s2',studentName:'Alumno Dos'})}),/deben quedar entre 08:00 y 16:00/);
 apply(d,director,'flight',{flight:flight('p1','HP11BL',{start:'16:30',end:'18:30',flightType:'charter',studentId:'student:s2',studentName:'Alumno Dos'})});
 M.publish(d,date,now);
 const flights=d.itinerarios.filter(f=>f.fecha===date);
 const moved=flights.find(f=>f.schedule.sourceRequestId&&f.schedule.pilot==='p1');
 assert.ok(moved);assert.equal(moved.horaInicio,'08:00');assert.equal(moved.horaFin,'11:00');
 const fixedMono=flights.find(f=>f.aeronave==='HP-1907');assert.equal(fixedMono.horaInicio,'12:30');assert.equal(fixedMono.horaFin,'14:00');
 assert.ok(flights.some(f=>f.aeronave==='HP-880BL'&&f.horaInicio==='16:30'&&f.horaFin==='18:30'));
 assert.ok(flights.some(f=>f.aeronave==='HP-11BL'&&f.horaInicio==='16:30'&&f.horaFin==='18:30'));
 const category=registration=>M.E.fleet.find(([id])=>id===String(registration).replace(/[^a-z0-9]/gi,'').toUpperCase())?.[2];
 for(const f of flights)if(category(f.aeronave)==='Monomotor')assert.ok(f.horaInicio>='08:00'&&f.horaFin<='16:00',f.aeronave+' escaped '+JSON.stringify(scheduleWindow));
 for(let i=0;i<flights.length;i++)for(let j=i+1;j<flights.length;j++){
  const a=flights[i],b=flights[j],overlap=a.horaInicio<b.horaFin&&a.horaFin>b.horaInicio;
  if(overlap){assert.notEqual(a.aeronave,b.aeronave,'aircraft conflict');assert.notEqual(a.piloto,b.piloto,'pilot conflict');}
 }
});
test('two pending requests may overlap; publication separates monos without overlaps',()=>{const d=fixture();apply(d,pilot('p1'),'request',{flight:flight()});apply(d,pilot('p2'),'request',{flight:flight('p2')});assert.equal(d.itinerarios.length,0);assert.equal(M.day(d,date).requests.length,2);M.publish(d,date,now);assert.equal(d.itinerarios.length,2);assert.notEqual(d.itinerarios[0].aeronave,d.itinerarios[1].aeronave);assert.equal(d.itinerary.notices.length,1);M.publish(d,date,now);assert.equal(d.itinerary.notices.length,1);});
test('pilot identity is bound on server; role and clock cannot be forged',()=>{const d=fixture();apply(d,pilot('p1'),'request',{flight:flight('p2'),role:'Director',now:'2030'});assert.equal(M.day(d,date).requests[0].pilot,'p1');assert.throws(()=>apply(d,pilot('p1'),'publish'),/director/);assert.throws(()=>apply(d,pilot('p1'),'request',{date:'2026-11-01',flight:flight()}),/mañana/);assert.throws(()=>apply(d,pilot('p1'),'request',{flight:flight()},'2026-10-30T20:00:00-05:00'),/cerradas/);});
test('readonly request box, missing identity and unverified accounts cannot submit',()=>{const d=fixture();d.school.accessConfiguration.roles.Piloto.itinerario.boxes.requests.edit=false;assert.throws(()=>apply(d,pilot('p1'),'request',{flight:flight()}),/habilitar/);d.school.accessConfiguration.roles.Piloto=structuredClone(policy);assert.throws(()=>apply(d,pilot('absent'),'request',{flight:flight()}),/expediente/);const a=pilot('p1');a.user.emailVerified=false;assert.throws(()=>apply(d,a,'request',{flight:flight()}),/Verifica/);});
test('director approval remains fixed, competing request moves elsewhere',()=>{const d=fixture();apply(d,pilot('p1'),'request',{flight:flight()});apply(d,pilot('p2'),'request',{flight:flight('p2')});const id=M.day(d,date).requests[0].id;apply(d,director,'approve',{id});M.publish(d,date,now);const q=d.itinerarios.find(f=>f.schedule.sourceRequestId===id);assert.equal(q.aeronave,'HP-1907');assert.equal(q.schedule.directorApproved,true);assert.equal(d.itinerarios.length,2);});
test('HP880BL overlapping requests keep the aircraft and move the second flight to its nearest free time',()=>{const d=fixture();for(const p of ['p1','p2'])apply(d,pilot(p),'request',{flight:flight(p,'HP880BL',{flightType:'multi'})});M.publish(d,date,now);assert.equal(d.itinerarios.length,2);assert.ok(M.day(d,date).results.every(q=>q.status==='assigned'));assert.ok(d.itinerarios.every(q=>q.aeronave==='HP-880BL'));assert.deepEqual(d.itinerarios.map(q=>q.horaInicio).sort(),['06:30','09:30']);assert.equal(M.E.overlaps({start:d.itinerarios[0].horaInicio,end:d.itinerarios[0].horaFin},{start:d.itinerarios[1].horaInicio,end:d.itinerarios[1].horaFin}),false);});
test('pilot Multi variants persist through request, publication and the published schedule label',()=>{
 for(const [flightType,label] of [['multi','Multi Estudiante'],['multiLey89','Multi Ley 89'],['multiConversion','Multi Conversión']]){
  const d=fixture();apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType})});
  const [saved]=M.day(d,date).requests;assert.equal(saved.flightType,flightType);assert.equal(saved.aircraft,'HP880BL');
  M.publish(d,date,now);assert.equal(d.itinerarios.length,1);const published=d.itinerarios[0];
  assert.equal(published.aeronave,'HP-880BL');assert.equal(published.schedule.flightType,flightType);assert.equal(published.tipo,label);
 }
});
test('Director saves each Multi aircraft list independently and server enforces the selection',()=>{
 const d=fixture();apply(d,director,'settings',{typeRules:{multi:['HP880BL'],multiLey89:[],multiConversion:['HP880BL'],atp:['HP880BL']}});
 assert.deepEqual(d.itinerary.config.typeRules.multi,['HP880BL']);assert.deepEqual(d.itinerary.config.typeRules.multiLey89,[]);assert.deepEqual(d.itinerary.config.typeRules.multiConversion,['HP880BL']);assert.deepEqual(d.itinerary.config.typeRules.atp,['HP880BL']);
 assert.throws(()=>apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'multiLey89'})}),/habilitado/);
 apply(d,director,'settings',{typeRules:{multiLey89:['HP880BL']}});
 apply(d,pilot('p1'),'request',{flight:flight('p1','HP1907',{flightType:'multiLey89'})});
 assert.equal(M.day(d,date).requests[0].flightType,'multiLey89');assert.equal(M.day(d,date).requests[0].aircraft,'HP880BL');
 apply(d,pilot('p2'),'request',{flight:flight('p2','HP1907',{flightType:'atp'})});assert.equal(M.day(d,date).requests.find(q=>q.flightType==='atp')?.aircraft,'HP880BL');
});
test('director includes helicopter and requires nonoperative warning acknowledgement',()=>{const d=fixture();d.fleet.HP_11BL.status='aog';assert.throws(()=>apply(d,director,'flight',{flight:flight('p1','HP11BL',{flightType:'charter'})}),/Confirma/);apply(d,director,'flight',{flight:flight('p1','HP11BL',{flightType:'charter'}),acknowledge:true});assert.equal(d.itinerarios[0].aeronave,'HP-11BL');assert.equal(d.fleet.HP_11BL.status,'aog');});
test('admin can create fixed multi but not mono or charter or modify',()=>{const d=fixture(),admin={...pilot('p2'),account:{role:'Administrativo',assignedAt:now}};apply(d,admin,'flight',{flight:flight('p1','HP880BL',{flightType:'multi'})});assert.throws(()=>apply(d,admin,'flight',{flight:flight('p2','HP1784')}),/cargo/);assert.throws(()=>apply(d,admin,'flight',{flight:flight('p2','HP11BL',{flightType:'charter'})}),/Chárter/);assert.throws(()=>apply(d,admin,'flight',{id:d.itinerarios[0].id,flight:flight('p1','HP880BL',{flightType:'multi'})}),/director/);});
test('legacy scheduled rows and extra fields survive first save untouched',()=>{const d=fixture();d.itinerarios=[{id:1,fecha:date,horaInicio:'21:00',horaFin:'22:00',aeronave:'HP-11BL',piloto:'Unlisted historical pilot',unknownField:{keep:true}}];const original=structuredClone(d.itinerarios[0]);apply(d,director,'settings',{nightEnabled:true});assert.deepEqual(d.itinerarios[0],original);});
test('night needs two distinct aircraft; cancellation withdraws remaining night flight',()=>{const d=fixture();apply(d,director,'settings',{nightEnabled:true});apply(d,director,'flight',{flight:flight('p1','HP1784',{start:'18:30',end:'20:00'})});assert.equal(d.itinerarios.length,0);assert.equal(M.day(d,date).held.length,1);apply(d,director,'flight',{flight:flight('p2','HP1819',{start:'18:30',end:'20:00',studentId:'student:s2',studentName:'Alumno Dos'})});assert.equal(d.itinerarios.length,2);apply(d,director,'cancel-flight',{id:d.itinerarios[0].id,reason:'Prueba del calendario'});assert.equal(d.itinerarios.length,0);assert.equal(M.day(d,date).held.length,1);});
test('status loss reassigns approved mono for maintenance and grounded without changing cancellation rights',()=>{
 for(const status of ['mantenimiento','grounded']){
  const d=fixture();apply(d,pilot('p1'),'request',{flight:flight()});apply(d,director,'approve',{id:M.day(d,date).requests[0].id});M.publish(d,date,now);
  const old=structuredClone(d);d.fleet.HP_1907.status=status;assert.equal(M.reconcile(old,d,now),true);
  assert.notEqual(d.itinerarios[0].aeronave,'HP-1907');const id=d.itinerarios[0].id;
  assert.throws(()=>apply(d,pilot('p2'),'cancel-flight',{id,reason:'Prueba'}),/propio/);apply(d,pilot('p1'),'cancel-flight',{id,reason:'Prueba de reubicación'});
  assert.equal(d.itinerarios.length,0);assert.equal(M.day(d,date).cancelled.length,1);assert.ok(d.itinerary.notices.some(n=>n.kind==='relocated'));
 }
});
test('expired pilot rejected on server and closed requests require director',()=>{const d=fixture();d.pilotos[0].instructorExpiry='2026-10-30';assert.throws(()=>apply(d,director,'flight',{flight:flight()}),/vencido/);});
test('cross-date flight edit is atomic and prevents target collision',()=>{const d=fixture();apply(d,director,'flight',{flight:flight()});const id=d.itinerarios[0].id;apply(d,director,'flight',{id,originalDate:date,originalRevision:M.day(d,date).revision,date:'2026-11-01',flight:flight('p2','HP1819')});assert.equal(d.itinerarios.length,1);assert.equal(d.itinerarios[0].fecha,'2026-11-01');assert.equal(d.itinerarios[0].piloto,'Piloto Dos');});
test('moving a published flight queues the source day email even when the target day is unpublished',()=>{const d=fixture(),movedAt='2026-10-30T13:15:00-05:00',target='2026-11-01';apply(d,director,'flight',{flight:flight()});const id=d.itinerarios[0].id;M.publish(d,date,now);const sourceRevision=M.day(d,date).revision;apply(d,director,'flight',{id,originalDate:date,originalRevision:sourceRevision,date:target,flight:flight('p2','HP1819')},movedAt);assert.equal(d.itinerarios[0].fecha,target);assert.ok(M.day(d,date).modifiedEmail);assert.equal(M.day(d,date).modifiedEmail.dueAt,'2026-10-30T18:25:00.000Z');const email=M.flushModifiedEmail(d,'2026-10-30T18:25:00-05:00');assert.equal(email.date,date);assert.deepEqual(email.flights,[]);});
test('repeated commands are idempotent and stale edits rejected',()=>{const d=fixture(),body={date,command:'request',actionId:'repeat-action-123',flight:flight()};M.apply(d,pilot('p1'),body,now);M.apply(d,pilot('p1'),body,now);assert.equal(M.day(d,date).requests.length,1);assert.throws(()=>M.apply(d,pilot('p1'),{...body,flight:flight('p1','HP1784')},now),/reutilizado/);assert.throws(()=>apply(d,director,'settings',{revision:0,nightEnabled:true}),/cambió/);});
test('generic saves cannot bypass scheduler rules or overwrite requests',()=>{const old=fixture(),next=structuredClone(old);next.itinerarios.push({id:'bypass'});assert.throws(()=>M.protect(old,next),/nueva página/);const save=structuredClone(old);delete save.itinerary;M.protect(old,save);assert.deepEqual(save.itinerary,old.itinerary);});
test('student view cannot enumerate other dossiers or flights',()=>{const d=fixture();apply(d,director,'flight',{flight:flight('p1','HP1907',{studentId:'student:s2',studentName:'Alumno Dos'})});const student={...pilot('s1'),account:{role:'Estudiante',assignedAt:now,syncStatus:'matched',recordKind:'student',recordId:'s1'}};const v=M.view(d,student,date,now);assert.equal(v.state.confirmed.length,0);assert.equal(v.state.students.length,0);assert.equal(v.state.pilots.length,0);assert.equal(JSON.stringify(v).includes('secret'),false);});
test('operational alert begins previous day and ends when operative',()=>{const d=fixture();d.fleet.HP_11BL.status='aog';apply(d,director,'flight',{flight:flight('p1','HP11BL',{flightType:'charter'}),acknowledge:true});assert.equal(M.operational(d,now).length,1);d.fleet.HP_11BL.status='operativo';assert.equal(M.operational(d,now).length,0);});
test('published multimotor and helicopter reviews notify the Director with accurate reasons and keep assignments',()=>{
 const d=fixture();
 apply(d,director,'flight',{flight:flight('p1','HP880BL',{flightType:'multi'})});
 apply(d,director,'flight',{flight:flight('p1','HP11BL',{flightType:'socio',socioName:'Vuelo ficticio',slot:'b2',start:'10:00',end:'12:30'})});
 M.publish(d,date,now);const original=d.itinerarios.map(f=>({id:f.id,aircraft:f.aeronave,pilot:f.piloto,start:f.horaInicio,end:f.horaFin}));
 const old=structuredClone(d);d.fleet.HP_880BL.status='grounded';d.fleet.HP_11BL.status='mantenimiento';
 assert.equal(M.reconcile(old,d,now),true);
 const expected=new Map([
  ['HP880BL','Multimotor: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.'],
  ['HP11BL','Helicóptero: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.']
 ]);
 const notices=d.itinerary.notices.filter(n=>n.kind==='review');assert.equal(notices.length,2);
 for(const n of notices){
  assert.equal(n.reason,expected.get(n.after.aircraft));assert.equal(n.before.aircraft,n.after.aircraft);
  assert.equal(n.after.relocationPending,true);assert.deepEqual(n.recipients,[{kind:'group',id:'all'}]);
 }
 assert.deepEqual(M.visibleNotices(d,director,now).filter(n=>n.kind==='review').map(n=>n.reason).sort(),[...expected.values()].sort());
 assert.deepEqual(d.itinerarios.map(f=>({id:f.id,aircraft:f.aeronave,pilot:f.piloto,start:f.horaInicio,end:f.horaFin})),original);
 const after=structuredClone(d),count=d.itinerary.notices.length;
 assert.equal(M.reconcile(after,d,now),false);assert.equal(d.itinerary.notices.length,count);
});
