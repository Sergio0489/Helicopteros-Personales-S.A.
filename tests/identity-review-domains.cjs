'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Reports=require('../functions/aircraft-reports'),Itinerary=require('../functions/itinerary-service'),Model=require('../functions/itinerary-model');

const user={uid:'pending-pilot',email:'pending-pilot@example.test',emailVerified:true,disabled:false};
const account={role:'Piloto',assignedAt:'fixture-approved',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto ficticio',identity:'TEST-PILOT'}};
const actor={uid:user.uid,name:account.profile.name,role:account.role};
const reportBody={action:'aircraft-report',aircraft:'HP-1784',description:'Discrepancia ficticia de prueba',idempotencyKey:'11111111-1111-4111-8111-111111111111'};
const reportPolicy={aeronaves:{actions:{view:true,edit:false},boxes:{status:{view:true,edit:false}}}};
const itineraryPolicy={itinerario:{actions:{view:true,edit:true},boxes:{planner:{view:true},flights:{view:true,edit:false},requests:{view:true,edit:true}}}};
const pendingStates=[['pending-flag',{identityReviewPending:true,syncStatus:'matched'}],['duplicate-status',{identityReviewPending:false,syncStatus:'duplicate-identity'}]];
const reviewError=/identidad|revisi[oó]n|coincidencia/i;
const fixedNow='2026-10-30T13:00:00-05:00',fixedDate='2026-10-31';

function fixtureData(){
 return {fleet:Object.fromEntries(Model.E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo',mantenimiento:[]} ])),pilotos:[{id:account.recordId,authUid:user.uid,email:user.email,nombre:account.profile.name,identity:'TEST-PILOT',medico:'2099-12-31',verificaciones:[]}],itinerarios:[],school:{students:[],registry:{clients:[],entries:[]},accessConfiguration:{roles:{Piloto:{...structuredClone(reportPolicy),...structuredClone(itineraryPolicy)}}}},operationalNotices:[],itinerary:{version:1,config:{},days:{},notices:[]}};
}
function memory(data=fixtureData(),accountPatch={}){
 let store={dashboard:{payload:JSON.stringify(data),operation:'fixture-operation',revision:7,auditPending:{'fixture-history':{meta:{id:'fixture-history',reason:'Historial ficticio previo'},chunks:{'000000':[]}}}},accountRequests:{[user.uid]:{...structuredClone(account),...accountPatch}}};
 let afterRootCommit=null;const writes=[];
 const get=path=>path.split('/').filter(Boolean).reduce((value,key)=>value?.[key],store)??null;
 const put=(path,value)=>{if(!path){store=value;return;}const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||={};target[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>structuredClone(get(path))}),transaction:async update=>{
  const next=update(structuredClone(get(path)));
  if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(get(path))}};
  put(path,next);writes.push(path);
  if(!path&&afterRootCommit){const callback=afterRootCommit;afterRootCommit=null;await callback();}
  return {committed:true,snapshot:{val:()=>structuredClone(get(path))}};
 },update:async patch=>{for(const [key,value]of Object.entries(patch))put([path,key].filter(Boolean).join('/'),value);}})};
 const auth={verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>structuredClone(user)};
 const endpoints={};vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index.js'),'utf8'),{Buffer,exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 const call=async body=>{let status=200,response;const res={set(){},status(value){status=value;return res;},json(value){response=value;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:'Bearer fixture'},body},res);return {status,body:response};};
 return {db,call,writes,get root(){return store;},data:()=>JSON.parse(store.dashboard.payload),account:()=>store.accountRequests[user.uid],afterRootCommit:callback=>{afterRootCommit=callback;}};
}
const callReport=(h,body=reportBody,accountPatch={},userPatch={})=>Reports.handle(h.db,{user:{...user,...userPatch},account:{...h.account(),...accountPatch},actor,body:structuredClone(body)});
const context=(patch={},director=false)=>({user:structuredClone(user),account:{...structuredClone(account),...patch},director});
const requestBody={date:fixedDate,command:'request',actionId:'identity-gate-request-001',flight:{aircraft:'HP1907',start:'06:30',end:'09:30',slot:'b1',flightType:'privado',route:'Ruta ficticia',note:'Solicitud ficticia'}};

test('an explicitly pending pilot cannot create an aircraft report even while the stored link still says matched',async()=>{
 const h=memory(undefined,{identityReviewPending:true}),before=structuredClone(h.root);
 const result=await callReport(h);assert.equal(result.status,403,'pending review must be checked independently from the matched dossier link');
 assert.deepEqual(h.root,before,'rejection must not create maintenance tasks, alerts, receipts or audit entries');
});

test('duplicate-identity already prevents an aircraft report through the existing matched-link restriction',async()=>{
 const h=memory(undefined,{syncStatus:'duplicate-identity'}),before=structuredClone(h.root),result=await callReport(h);
 assert.equal(result.status,403);assert.deepEqual(h.root,before);
});

test('a reviewed authorized pilot keeps one task, alert, receipt and audit effect across aircraft-report retries',async()=>{
 const h=memory(),first=await callReport(h);assert.equal(first.ok,true);assert.equal(first.deduplicated,false);
 const accepted=structuredClone(h.root),retry=await callReport(h);assert.equal(retry.ok,true);assert.equal(retry.deduplicated,true);assert.equal(retry.taskId,first.taskId);assert.equal(retry.operation,first.operation);
 assert.deepEqual(h.root,accepted);assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);assert.equal(Object.keys(h.root.dashboard.aircraftReportReceipts).length,1);
 assert.deepEqual(h.root.dashboard.auditPending['fixture-history'],{meta:{id:'fixture-history',reason:'Historial ficticio previo'},chunks:{'000000':[]}});
});

test('revoked status permission rejects new reports and accepted receipts without writes, then regrant deduplicates',async()=>{
 const h=memory(),accepted=await callReport(h);assert.equal(accepted.ok,true);
 const data=h.data();data.school.accessConfiguration.roles.Piloto.aeronaves.boxes.status.view=false;h.root.dashboard.payload=JSON.stringify(data);
 const revoked=structuredClone(h.root);assert.equal((await callReport(h)).status,403);assert.deepEqual(h.root,revoked);
 assert.equal((await callReport(h,{...reportBody,idempotencyKey:'22222222-2222-4222-8222-222222222222'})).status,403);assert.deepEqual(h.root,revoked);
 const restored=h.data();restored.school.accessConfiguration.roles.Piloto.aeronaves.boxes.status.view=true;h.root.dashboard.payload=JSON.stringify(restored);
 const beforeRetry=structuredClone(h.root),retry=await callReport(h);assert.equal(retry.deduplicated,true);assert.equal(retry.taskId,accepted.taskId);assert.deepEqual(h.root,beforeRetry);
});

test('pending-review defenses retain aircraft identity, verification and role restrictions',async()=>{
 const patches=[{user:{emailVerified:false}},{user:{disabled:true}},{account:{role:'Administrativo'}},{account:{assignedAt:null}},{account:{recordKind:'student'}},{account:{recordId:'foreign-pilot'}}];
 for(const patch of patches){const h=memory(),before=structuredClone(h.root),result=await callReport(h,reportBody,patch.account,patch.user);assert(result.status>=400);assert.deepEqual(h.root,before);}
});

for(const [label,patch]of pendingStates){
 test('itinerary reads reject '+label+' even with existing view permission and linked pilot',async()=>{
  const h=memory(),before=structuredClone(h.root);
  await assert.rejects(()=>Itinerary.handle(h.db,context(patch),{action:'itinerary-read',date:fixedDate}),reviewError);
  assert.deepEqual(h.root,before);
 });
 test('itinerary requests reject '+label+' before changing reservations or command receipts',()=>{
  const data=fixtureData(),before=structuredClone(data);
  assert.throws(()=>Model.apply(data,context(patch),structuredClone(requestBody),fixedNow),reviewError);
  assert.deepEqual(data,before);
 });
 test('a previously assigned Director does not bypass itinerary identity review for '+label,()=>{
  const data=fixtureData(),before=structuredClone(data),director=context({...patch,role:'Director'},true);
  assert.throws(()=>Model.scope(data,director),reviewError);assert.throws(()=>Model.calendar(data,director,'2026',fixedNow),reviewError);assert.deepEqual(data,before);
 });
}

test('a pending Director cannot initialize the itinerary or grant request editing before being rejected',async()=>{
 for(const [,patch]of pendingStates){
  const data=fixtureData();delete data.itinerary;data.school.accessConfiguration.roles.Piloto.itinerario.boxes.requests.edit=false;
  const h=memory(data),before=structuredClone(h.root),director=context({...patch,role:'Director'},true);
  await assert.rejects(()=>Itinerary.handle(h.db,director,{action:'itinerary-read',date:fixedDate}),reviewError);
  assert.deepEqual(h.root,before,'identity review must be checked before enabling the itinerary, changing role permissions or appending audit history');
  assert.equal(h.writes.length,0);
 }
});

test('valid itinerary view and own requests still work and retain command idempotency',async()=>{
 const h=memory(),before=structuredClone(h.root),view=await Itinerary.handle(h.db,context(),{action:'itinerary-read',date:fixedDate});
 assert.equal(view.rights.view,true);assert.equal(view.rights.request,true);assert.equal(view.rights.pilot,account.recordId);assert.deepEqual(h.root,before,'read must not mutate the dashboard');
 const data=fixtureData();Model.apply(data,context(),structuredClone(requestBody),fixedNow);const accepted=structuredClone(data);
 assert.equal(data.itinerary.days[fixedDate].requests.length,1);assert.equal(data.itinerary.days[fixedDate].receipts.length,1);
 assert.deepEqual(Model.apply(data,context(),structuredClone(requestBody),fixedNow),{duplicate:true});assert.deepEqual(data,accepted);
});

test('itinerary policy revocation still denies reads and commands without changing data',async()=>{
 const data=fixtureData();data.school.accessConfiguration.roles.Piloto.itinerario.actions.view=false;
 const h=memory(data),before=structuredClone(h.root);await assert.rejects(()=>Itinerary.handle(h.db,context(),{action:'itinerary-read',date:fixedDate}),/permiso|acceso/i);assert.deepEqual(h.root,before);
 const original=structuredClone(data);assert.throws(()=>Model.apply(data,context(),structuredClone(requestBody),fixedNow),/permiso|acceso/i);assert.deepEqual(data,original);
});

test('a read-only request box still blocks requesting flights without affecting other valid view rights',async()=>{
 const data=fixtureData();data.school.accessConfiguration.roles.Piloto.itinerario.boxes.requests.edit=false;
 const rights=Model.scope(data,context());assert.equal(rights.view,true);assert.equal(rights.request,false);
 const h=memory(data),before=structuredClone(h.root);await assert.rejects(()=>Itinerary.handle(h.db,context(),{action:'itinerary-command',...structuredClone(requestBody)}),/habilitar/);assert.deepEqual(h.root,before,'a rejected tentative transaction must not persist even an empty day');
});

test('a report cannot use the real interval between submit committing a pending review and subsequent synchronization',async()=>{
 const data=fixtureData();data.school.students.push({id:'homonym-student',name:account.profile.name,email:'homonym@example.test',identity:'TEST-OTHER',courses:[]});
 const h=memory(data);let intermediate,report;
 h.afterRootCommit(async()=>{intermediate=structuredClone(h.account());report=await h.call(reportBody);});
 const submission=await h.call({action:'submit',profile:account.profile,requestIdentityReview:true});
 assert.equal(submission.status,200);assert.equal(intermediate.identityReviewPending,true);assert.equal(intermediate.syncStatus,'matched','submit retains the prior link until the following synchronization');
 assert.equal(report.status,403,'the pending flag must block the second request during the real submit/sync interval');
 assert.equal(h.account().identityReviewPending,true);assert.equal(h.account().syncStatus,'duplicate-identity');
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,0);assert.equal(h.data().operationalNotices.length,0);assert.equal(Object.keys(h.root.dashboard.aircraftReportReceipts||{}).length,0);
});
