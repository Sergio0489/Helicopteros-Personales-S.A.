'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../functions/itinerary-model');
const E=require('../functions/itinerary-engine');
const S=require('../functions/itinerary-service');
const email=require('../functions/itinerary-email');
const date='2026-10-31';
const now='2026-10-30T13:00:00-05:00';
const policy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:true},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
const director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:now},director:true};
const pilot=(id)=>({user:{uid:id,email:id+'@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:now},director:false});
function fixture(){
 const pilots=[
  {id:'carlos',nombre:'Carlos Díaz',email:'carlos@example.test',medico:'2027-12-31'},
  {id:'sergio',nombre:'Sergio Herrera',email:'sergio@example.test',medico:'2027-12-31'}
 ];
 const roles={Piloto:structuredClone(policy),Estudiante:structuredClone(policy)};
 return {fleet:Object.fromEntries(E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo'}])),
  pilotos:pilots,itinerarios:[],school:{students:[{id:'s1',name:'Estudiante Uno',email:'s1@example.test'},{id:'s2',name:'Estudiante Dos',email:'s2@example.test'}],registry:{clients:[]},personnel:[],accessConfiguration:{roles}},
  itinerary:{version:1,config:{},days:{},notices:[]}};
}
let seq=0;
function apply(data,actor,command,fields={},at=now){
 return M.apply(data,actor,{date,command,actionId:'isolated-action-'+(++seq),revision:M.day(data,fields.date||date).revision,configurationRevision:data.itinerary.config.revision||0,...fields},at);
}
function flight(pilotId,aircraft,start,end,extra={}){
 return {pilot:pilotId,aircraft,start,end,slot:'b1',flightType:'privado',route:'MPMG - MPCE - MPMG',studentId:'student:s1',studentName:'Estudiante Uno',...extra};
}
function database(data){
 let root={payload:JSON.stringify(data),operation:'start',revision:1};
 return {get value(){return structuredClone(root);},ref(path){assert.equal(path,'dashboard');return {
  get:async()=>({val:()=>structuredClone(root)}),
  transaction:async update=>{const cold=update(null);if(cold===null){const next=update(structuredClone(root));if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(root)}};root=next;return {committed:true,snapshot:{val:()=>structuredClone(root)}};}const next=update(structuredClone(root));if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(root)}};root=next;return {committed:true,snapshot:{val:()=>structuredClone(root)}};}
 };}};
}
test('release start and end constrain even operational aircraft and auto-placement',()=>{
 const data=fixture(),a=M.stateFor(data,date,now).aircraft.find(x=>x.id==='HP1907');
 M.day(data,date).requests.push({...flight('carlos','HP1907','07:00','09:00'),id:'old-request',pilot:'carlos',created:1,status:'pending'});
 M.day(data,date).releases={HP1907:{enabled:true,date,from:'12:30',until:'16:00'}};
 const state=M.stateFor(data,date,now),scheduled=state.aircraft.find(x=>x.id==='HP1907');
 assert.equal(scheduled.status,'operativo');
 assert.deepEqual(E.availabilityBounds(scheduled,date),{start:750,end:960});
 assert.deepEqual(E.bookingSlots(scheduled,date).map(x=>[x.start,x.end]),[['12:30','15:30'],['15:30','16:00']]);
 const plan=M.createDraftPlan(data,date,now),saved=M.day(data,date).draftPlan.assignments.find(q=>q.sourceRequestId==='old-request');
 assert.ok(plan);
 assert.equal(saved.start,'12:30');
 assert.equal(saved.end,'14:30');
 assert.ok(saved.start>='12:30'&&saved.end<='16:00');
 const tooEarly=flight('sergio','HP1907','11:30','13:00',{createdByRole:'director'});
 assert.notEqual(E.directorFlightError(M.stateFor(data,date,now),tooEarly), '');
 const tooLate=flight('sergio','HP1907','15:00','16:30',{createdByRole:'director'});
 assert.notEqual(E.directorFlightError(M.stateFor(data,date,now),tooLate), '');
});
test('saved 8pm draft is Director-only, editable, preserves both Carlos requests and Sergio approved flight, then publishes the edited plan',()=>{
 const data=fixture();
 data.pilotos.find(p=>p.id==='carlos').nombre='Carlos Díaz';
 apply(data,director,'flight',{flight:flight('sergio','HP880BL','09:30','12:00',{flightType:'multi',studentId:'student:s1'})});
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP880BL','12:00','14:00',{flightType:'multi',studentId:'student:s1'})});
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP880BL','14:00','16:00',{flightType:'multi',studentId:'student:s2',studentName:'Estudiante Dos'})});
 const originalFlights=structuredClone(data.itinerarios),draftEmail=M.createDraftPlan(data,date,now);
 assert.ok(draftEmail?.draft);
 assert.deepEqual(data.itinerarios,originalFlights,'creating the draft must not publish or rewrite official flights');
 const directorView=M.view(data,director,date,now);
 assert.equal(directorView.state.draftMode,true);
 assert.equal(directorView.state.confirmed.length,3);
 const pilotView=M.view(data,pilot('carlos'),date,now);
 assert.equal(pilotView.state.draftMode,undefined);
 assert.equal(pilotView.state.confirmed.length,1,'pilots do not receive the unpublished Director draft');
 const later=directorView.state.confirmed.find(q=>q.sourceRequestId===M.day(data,date).requests[1].id);
 apply(data,director,'flight',{id:later.id,originalDate:date,originalRevision:M.day(data,date).revision,flight:{...later,start:'14:30',end:'16:30'}});
 const first=M.day(data,date).draftPlan.assignments.find(q=>q.sourceRequestId===M.day(data,date).requests[0].id);
 apply(data,director,'flight',{id:first.id,originalDate:date,originalRevision:M.day(data,date).revision,flight:{...first,start:'12:30',end:'14:30'}});
 const exactPlan=structuredClone(M.day(data,date).draftPlan.assignments);
 assert.equal(M.publish(data,date,now),true);
 assert.equal(M.day(data,date).published,true);
 assert.deepEqual(M.day(data,date).results.map(r=>r.id),M.day(data,date).draftPlan.results.map(r=>r.id));
 const final=data.itinerarios.filter(f=>f.fecha===date);
 assert.equal(final.length,3);
 assert.ok(final.some(f=>f.piloto==='Sergio Herrera'&&f.horaInicio==='09:30'&&f.horaFin==='12:00'));
 assert.ok(final.some(f=>f.piloto==='Carlos Díaz'&&f.horaInicio==='12:30'&&f.horaFin==='14:30'));
 assert.ok(final.some(f=>f.piloto==='Carlos Díaz'&&f.horaInicio==='14:30'&&f.horaFin==='16:30'));
 for(let i=0;i<exactPlan.length;i++)for(let j=i+1;j<exactPlan.length;j++){
  const a=exactPlan[i],b=exactPlan[j];
  if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(E.overlaps(a,b),false);
 }
});
test('draft recalculation preserves edits and removals of flights already in the published records',()=>{
 const data=fixture();
 apply(data,director,'flight',{flight:flight('sergio','HP880BL','09:30','12:00',{flightType:'multi'})});
 const officialId=data.itinerarios[0].id;
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1815','13:00','15:00')});
 M.createDraftPlan(data,date,now);
 const originalRequest=M.day(data,date).requests[0],firstView=M.view(data,director,date,now),official=firstView.state.confirmed.find(q=>q.id===officialId);
 apply(data,director,'flight',{id:officialId,originalDate:date,originalRevision:M.day(data,date).revision,flight:{...official,start:'10:00',end:'12:30'}});
 apply(data,pilot('carlos'),'request',{id:originalRequest.id,flight:{...originalRequest,note:'Edición ficticia'}});
 let plan=M.day(data,date).draftPlan;
 assert.equal(plan.assignments.find(q=>q.id===officialId)?.start,'10:00','a recalculation keeps the Director-edited time instead of restoring the official copy');
 apply(data,director,'cancel-flight',{id:officialId,reason:'Registro ficticio retirado del borrador'});
 apply(data,pilot('carlos'),'request',{id:originalRequest.id,flight:{...originalRequest,note:'Otra edición ficticia'}});
 plan=M.day(data,date).draftPlan;
 assert.ok(!plan.assignments.some(q=>q.id===officialId),'a removed official flight does not return during recalculation');
 assert.ok(plan.removedFlightIds.includes(officialId),'the draft records the intentionally removed base flight');
 assert.equal(M.publish(data,date,now),true);
 assert.ok(!data.itinerarios.some(q=>q.id===officialId),'publishing keeps the Director removal');
});
test('settings recalculate the saved draft while preserving manual changes and respecting new time windows',()=>{
 const data=fixture();
 apply(data,director,'flight',{flight:flight('sergio','HP880BL','15:00','17:00',{flightType:'multi'})});
 const officialId=data.itinerarios[0].id;
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')});
 M.createDraftPlan(data,date,now);
 const official=M.day(data,date).draftPlan.assignments.find(q=>q.id===officialId);
 apply(data,director,'flight',{id:officialId,originalDate:date,originalRevision:M.day(data,date).revision,flight:{...official,start:'16:00',end:'18:00'}});
 apply(data,director,'settings',{scheduleWindow:{start:'12:30',end:'18:30'}});
 const plan=M.day(data,date).draftPlan,requestId=M.day(data,date).requests[0].id,moved=plan.assignments.find(q=>q.sourceRequestId===requestId),manual=plan.assignments.find(q=>q.id===officialId);
 assert.ok(moved,'the pending request remains assigned in the updated draft');
 assert.ok(moved.start>='12:30'&&moved.end<='18:30','the new monomotor range is applied to the saved draft');
 assert.equal(manual.start,'16:00');assert.equal(manual.end,'18:00','settings recalculation preserves the Director adjustment');
 assert.equal(M.publish(data,date,now),true);

 const forecast=fixture();
 apply(forecast,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')});
 M.createDraftPlan(forecast,date,now);
 apply(forecast,director,'settings',{aircraft:'HP1907',release:{enabled:true,from:'12:30',until:'16:00'}});
 const releasePlan=M.day(forecast,date).draftPlan,releaseRequestId=M.day(forecast,date).requests[0].id,releaseAssignment=releasePlan.assignments.find(q=>q.sourceRequestId===releaseRequestId);
 assert.ok(releaseAssignment,'the request stays represented after a forecast change');
 assert.ok(releaseAssignment.aircraft!=='HP1907'||releaseAssignment.start>='12:30'&&releaseAssignment.end<='16:00','the forecast end and start constrain the recalculated draft');
 assert.equal(M.publish(forecast,date,now),true);
});
test('scheduled draft is persisted once and can backfill an old notification marker without resending it',async()=>{
 const data=fixture(),db=database(data),first=await S.scheduledDraft(db,'2026-10-30T20:00:00-05:00');
 const stored=JSON.parse(db.value.payload),day=M.day(stored,date);
 assert.ok(first.outcome.emailPublication.draft);
 assert.equal(day.draftEmail.id,'draft-'+date);
 assert.ok(day.draftPlan);
 const outbox= db.value.itineraryEmailOutbox;
 assert.ok(outbox['draft-'+date]);
 const unchanged=db.value;
 await S.scheduledDraft(db,'2026-10-30T20:00:00-05:00');
 assert.deepEqual(db.value,unchanged,'duplicate scheduler invocation must not duplicate or recalculate the plan');
 const legacy=fixture();M.day(legacy,date).draftEmail={id:'draft-'+date,createdAt:now};
 const legacyDb=database(legacy),backfill=await S.scheduledDraft(legacyDb,'2026-10-30T20:00:00-05:00');
 const repaired=JSON.parse(legacyDb.value.payload);
 assert.ok(M.day(repaired,date).draftPlan);
 assert.equal(backfill.outcome,true,'backfilling an old marker does not enqueue a second ambiguous email');
 assert.equal(legacyDb.value.itineraryEmailOutbox,undefined);
});
test('20:00 Director draft is followed by an idempotent 20:15 publication email outbox',async()=>{
 const data=fixture();data.school.personnel.push({id:'mechanic',position:'Mecánico',email:'mechanic@example.test'});
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30')},'2026-10-30T18:00:00-05:00');
 const db=database(data),draft=await S.scheduledDraft(db,'2026-10-30T20:00:00-05:00');
 assert.ok(draft.outcome.emailPublication.draft);
 const publication=await S.scheduled(db,'2026-10-30T20:15:00-05:00'),stored=db.value,day=M.day(JSON.parse(stored.payload),date);
 assert.equal(day.published,true);
 assert.equal(publication.outcome.emailPublication.id,'publication-'+date);
 assert.deepEqual(stored.itineraryEmailOutbox['publication-'+date].pilotRecipients,['carlos@example.test','sergio@example.test']);
 assert.deepEqual(stored.itineraryEmailOutbox['publication-'+date].mechanicRecipients,['mechanic@example.test']);
 const unchanged=db.value;await S.scheduled(db,'2026-10-30T20:15:00-05:00');assert.deepEqual(db.value,unchanged,'scheduler retries must not publish or enqueue duplicate emails');
});

test('Cloud Scheduler jobs are configured for 20:00 draft and 20:15 publication in Panama time',()=>{
 const jobs=fs.readFileSync(require.resolve('../functions/itinerary-jobs.js'),'utf8');
 assert.match(jobs,/draftDailyItinerary=onSchedule\(\{schedule:'0 20 \* \* \*',timeZone:'America\/Panama'/);
 assert.match(jobs,/publishDailyItinerary=onSchedule\(\{schedule:'15 20 \* \* \*',timeZone:'America\/Panama'/);
});

test('published email recipients include every pilot and named mechanic, with a Director-only draft',async()=>{
 const publication={id:'publication-'+date,date,pilotRecipients:['pilot@example.test'],mechanicRecipients:['mechanic@example.test'],flights:[]};
 const accounts={dir:{role:'Director',assignedAt:now},mech:{role:'Mecánico',assignedAt:now},student:{role:'Estudiante',assignedAt:now},inactive:{role:'Mecánico'}};
 const users={director:{uid:'director',email:'director@example.test',emailVerified:true},dir:{uid:'dir',email:'director-role@example.test',emailVerified:true},mech:{uid:'mech',email:'mechanic-account@example.test',emailVerified:true},student:{uid:'student',email:'student@example.test',emailVerified:true},inactive:{uid:'inactive',email:'inactive@example.test',emailVerified:true}};
 const auth={getUser:async uid=>{if(!users[uid])throw Error('missing');return users[uid];}};
 const targets=await email.recipients(publication,accounts,auth,'director');
 assert.deepEqual(targets.sort(),['director-role@example.test','director@example.test','mechanic-account@example.test','mechanic@example.test','pilot@example.test'].sort());
 const draft=await email.recipients({...publication,id:'draft-'+date,draft:true},accounts,auth,'director');
 assert.deepEqual(draft,['director@example.test']);
 const formatted=email.message({...publication,flights:[{aircraft:'HP1784',start:'06:30',end:'09:30',pilot:'Piloto Uno',type:'Privado'},{aircraft:'HP1815',start:'09:30',end:'12:30',pilot:'Piloto Dos',type:'Privado'}]},'notificaciones@example.test','pilot@example.test');
 assert.match(formatted.html,/width:33\.33%/);
 assert.match(formatted.html,/HP1784/);
 assert.match(formatted.html,/HP1815/);
});
test('ambiguous SMTP acceptance becomes a safe review receipt instead of silently appearing sent',async()=>{
 const records={},reported=[],publication={id:'publication-'+date,date,flights:[]};
 const db={ref(path){return {transaction:async update=>{
  const key=path.slice('itineraryEmailDeliveries/'.length),old=records[key]??null,next=update(structuredClone(old));
  if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(old)}};
  records[key]=next;return {committed:true,snapshot:{val:()=>structuredClone(next)}};
 }};}};
 const event={params:{publicationId:publication.id},data:{val:()=>publication}};
 await email.deliver({db,event,from:'notifications@example.test',recipients:['pilot@example.test'],send:async()=>({accepted:[],rejected:[],rejectedErrors:[]}),report:(...args)=>reported.push(args),now:(()=>{let n=1;return()=>n++;})()});
 const [receipt]=Object.values(records);
 assert.equal(receipt.status,'review');
 assert.equal(receipt.code,'smtp-unconfirmed');
 assert.deepEqual(reported[0],[ 'smtp-unconfirmed',publication.id,{acceptedCount:0,rejectedCount:0,rejectedErrorCount:0,responseCode:null,command:''} ]);
 assert.deepEqual(email.deliverySummary(publication.id,publication,['pilot@example.test'],records,'known-time'),{id:publication.id,date,kind:'publication',recipientCount:1,sentCount:0,reviewCount:1,failedCount:0,pendingCount:0,codeCounts:{'smtp-unconfirmed':1},updatedAt:'known-time'});
});

test('pilot and student/client choices are alphabetic and the itinerary exposes a visible selector',()=>{
 const data=fixture();data.pilotos=[data.pilotos[1],{id:'ana',nombre:'Ángel Reyes',medico:'2027-12-31'},data.pilotos[0]];data.school.students=[{id:'z',name:'Zoe'},{id:'a',name:'Álvaro'},{id:'b',name:'Ana'}];data.school.registry.clients=[{id:'client-z',name:'Cliente Uno'},{id:'client-a',name:'Ángela'}];
 const state=M.stateFor(data,date,now),compare=(a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})||a.localeCompare(b,'es');
 assert.deepEqual(state.pilots.map(p=>p.name),state.pilots.map(p=>p.name).slice().sort(compare));
 assert.deepEqual(state.students.map(p=>p.name),state.students.map(p=>p.name).slice().sort(compare));
 const ui=fs.readFileSync(require.resolve('../itinerary-ui.js'),'utf8');
 assert.match(ui,/name=\"existingStudentId\"/);
 assert.match(ui,/Elegir expediente existente/);
 assert.match(ui,/panamaRouteCodes\.slice\(\)\.sort\(\(a,b\)=>a\.name\.localeCompare\(b\.name,'es',\{sensitivity:'base'\}\)/);
});

test('new itinerary dossiers require complete contact data and reject a duplicate dossier email',()=>{
 const testPhone='6'+'1'.repeat(7),data=fixture(),newPerson={studentId:'',studentName:'Persona Nueva',newPersonKind:'student',personIdentity:'TEST-ID-ONE',personEmail:'nueva@example.test',personPhone:testPhone};
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30',newPerson)});
 const created=data.school.students.find(p=>p.name==='Persona Nueva');assert.ok(created);assert.equal(created.identity,'TEST-ID-ONE');assert.equal(created.email,'nueva@example.test');assert.equal(created.phone,testPhone);
 const international=fixture(),internationalPhone=['+1','212','555','0100'].join(' '),foreign={...newPerson,studentName:'Cliente Extranjero',newPersonKind:'client',personIdentity:'TEST-ID-FOREIGN',personEmail:'foreign@example.test',personPhone:internationalPhone};
 apply(international,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30',foreign)});
 assert.equal(international.school.registry.clients[0].phone,internationalPhone);
 const panamaInternational=fixture(),panamaPhone=['+507','6123','4567'].join(' '),panama={...newPerson,studentName:'Cliente Panamá',newPersonKind:'client',personIdentity:'TEST-ID-PANAMA',personEmail:'panama@example.test',personPhone:panamaPhone};
 apply(panamaInternational,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30',panama)});
 assert.equal(panamaInternational.school.registry.clients[0].phone,panamaPhone);
 for(const [index,personPhone]of ['123456','++12125550100','1-800-FLOWERS','1234567890123456'].entries()){
  const invalid=fixture(),entry={...newPerson,studentName:'Registro inválido '+index,personIdentity:'TEST-ID-BAD-'+index,personEmail:'bad'+index+'@example.test',personPhone};
  assert.throws(()=>apply(invalid,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30',entry)}),/celular válido de Panamá o del extranjero/);
 }
 const duplicateEmail=fixture(),duplicate={...newPerson,studentName:'Otra Persona',personIdentity:'TEST-ID-TWO',personEmail:'s1@example.test'};
 assert.throws(()=>apply(duplicateEmail,pilot('carlos'),'request',{flight:flight('carlos','HP1784','06:30','09:30',duplicate)}),/El correo o la cédula ya pertenece a otro expediente/);
 const ui=fs.readFileSync(require.resolve('../itinerary-ui.js'),'utf8');assert.match(ui,/validPersonPhone/);assert.match(ui,/Acepta números de Panamá o del extranjero/);
});

test('pilots can edit and delete their own request after cutoff until publish; saved draft is recalculated and Director can delete pending requests',()=>{
 const late='2026-10-30T20:01:00-05:00',later='2026-10-30T20:04:00-05:00',data=fixture();
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')},'2026-10-30T19:00:00-05:00');
 const original=M.day(data,date).requests[0];M.createDraftPlan(data,date,late);assert.ok(M.day(data,date).draftPlan.assignments.some(q=>q.sourceRequestId===original.id));
 apply(data,pilot('carlos'),'request',{id:original.id,flight:{...original,start:'09:30',end:'12:30',slot:'b2'}},later);
 assert.equal(M.day(data,date).requests[0].start,'09:30');
 assert.equal(M.day(data,date).draftPlan.assignments.find(q=>q.sourceRequestId===original.id)?.start,'09:30','editing after cutoff updates the saved Director draft');
 assert.ok(M.day(data,date).draftPlan.revision>1);
 apply(data,pilot('carlos'),'cancel-request',{id:original.id},later);
 assert.ok(M.day(data,date).cancelled.includes(original.id));
 assert.ok(!M.day(data,date).draftPlan.assignments.some(q=>q.sourceRequestId===original.id),'deleting the request removes its assignment from the draft');
 assert.throws(()=>apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')},later),/Reservas cerradas/,'closing reservations still prevents new requests');
 const pendingData=fixture();apply(pendingData,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')},'2026-10-30T19:00:00-05:00');const pending=pendingData.itinerarios.length?null:M.day(pendingData,date).requests[0];
 apply(pendingData,director,'cancel-request',{id:pending.id},later);
 assert.ok(M.day(pendingData,date).cancelled.includes(pending.id));
 assert.equal(M.day(pendingData,date).requests[0].status,'cancelled');
});

test('Director draft warns about unresolved requests before publishing',()=>{
 const data=fixture();
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP880BL','09:30','12:00',{flightType:'multi'})});
 apply(data,pilot('sergio'),'request',{flight:flight('sergio','HP880BL','09:30','12:00',{flightType:'multi'})});
 M.day(data,date).releases={HP880BL:{enabled:true,date,from:'09:30',until:'12:00'}};
 const draft=M.createDraftPlan(data,date,now),plan=M.day(data,date).draftPlan;
 assert.ok(plan.results.some(row=>['review','waiting'].includes(row.status)),'the conflicting request remains visible for Director review');
 assert.ok(plan.warnings.some(w=>/solicitud\(es\).*asignación confirmada/.test(w)),'the saved Director draft explicitly flags unassigned requests');
 assert.match(draft.draftWarnings.join(' '),/Dirección debe resolverlas o eliminarlas antes de publicar/,'the Director draft email includes the warning');
});

test('new dossier selections still detect an overlapping legacy flight by student name',()=>{
 const data=fixture();data.itinerarios.push({id:'legacy-flight',fecha:date,aeronave:'HP_1784',piloto:'Sergio Herrera',horaInicio:'09:30',horaFin:'12:00',estudiante:'Estudiante Uno',tipo:'Privado'});
 const request=flight('carlos','HP1815','10:00','11:30',{studentId:'student:s1',studentName:'Estudiante Uno'}),saved=apply(data,pilot('carlos'),'request',{flight:request});
 const state=M.stateFor(data,date,now);
 assert.equal(state.confirmed[0].studentId,'','fixture models a legacy flight without a dossier link');
 assert.match(saved.actionWarning,/estudiante ya tiene otro vuelo/,'the pilot sees the overlap warning when submitting');
 assert.equal(E.studentConflicts(state,state.requests[0]).length,1,'the legacy name matches the selected dossier name for conflict detection');
});

test('closed-window request edits still reject aircraft and pilot conflicts',()=>{
 const data=fixture(),late='2026-10-30T20:05:00-05:00';
 apply(data,pilot('carlos'),'request',{flight:flight('carlos','HP1907','06:30','09:30')},'2026-10-30T19:00:00-05:00');
 apply(data,director,'flight',{flight:flight('sergio','HP1907','09:30','12:30')},'2026-10-30T19:30:00-05:00');
 const original=M.day(data,date).requests[0];
 assert.throws(()=>apply(data,pilot('carlos'),'request',{id:original.id,flight:{...original,start:'09:30',end:'12:30',slot:'b2'}},late),/se cruza/);
 assert.equal(M.day(data,date).requests[0].start,'06:30','a conflicting edit leaves the pending request unchanged');
});

test('out-of-hours schedules show an alert and the server rejects before 6:30am or after 8pm',()=>{
 const day=fixture(),state=M.stateFor(day,date,now),outside={start:'18:30',end:'20:00'},invalid={start:'21:00',end:'23:59'};
 assert.match(E.operatingHoursWarning(outside),/Alerta:.*horario habitual/);
 assert.equal(E.operatingHoursError(outside),'');
 assert.match(E.operatingHoursError(invalid),/8:00 p\. m\./);
 const tooLate=flight('sergio','HP880BL','21:00','23:59',{flightType:'multi',createdByRole:'director'});
 assert.match(E.directorFlightError(state,tooLate),/8:00 p\. m\./);
 const proposed=flight('sergio','HP880BL','18:30','20:00',{flightType:'multi',createdByRole:'director'}),manualData=fixture();
 apply(manualData,director,'settings',{nightEnabled:true});apply(manualData,director,'flight',{flight:proposed});
 const plan=M.createDraftPlan(manualData,date,now);
 assert.ok(plan.draftWarnings.some(w=>/Alerta:.*horario habitual/.test(w)));
});

test('Director interface exposes the saved editable draft, release end, and delivery status',()=>{
 const ui=fs.readFileSync(require.resolve('../itinerary-ui.js'),'utf8');
 assert.match(ui,/Borrador editable de Dirección/);
 assert.match(ui,/data-edit-flight/);
 assert.match(ui,/Disponible hasta/);
 assert.match(ui,/until:f\.until/);
 assert.match(ui,/s\.draftMode\?\{assignments:s\.confirmed,results:s\.lastResults\}/);
 assert.match(ui,/emailStatus/);
});
