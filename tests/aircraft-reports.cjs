'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const pilot={uid:'pilot-fixture',email:'pilot@example.test',emailVerified:true,disabled:false};
const account={role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const actor={uid:pilot.uid,name:'Piloto de prueba',role:'Piloto'};
const id='11111111-1111-4111-8111-111111111111';
const body={action:'aircraft-report',aircraft:'HP-1784',description:'Vibración en el rotor de cola',idempotencyKey:id};
// Reporting follows the status box's view permission, without requiring edit access.
const authorizedPilot={aeronaves:{actions:{view:true,edit:false},boxes:{status:{view:true,edit:false}}}};
function harness({cold=false,concurrent=false,revokeOnRetry=false}={}){
 const store={dashboard:{operation:'initial',revision:4,auditPending:{'fixture-history':{meta:{id:'fixture-history',reason:'Historial sintético previo'},chunks:{'000000':[]}}},payload:JSON.stringify({fleet:{HP_1784:{reg:'HP-1784',mantenimiento:[]}},pilotos:[{id:'pilot-record',authUid:pilot.uid,nombre:'Piloto de prueba'}],school:{accessConfiguration:{roles:{Piloto:structuredClone(authorizedPilot)}}},operationalNotices:[]})},accountRequests:{[pilot.uid]:structuredClone(account)}};
 let selectedUser=pilot,coldOnce=cold,revokeOnce=revokeOnRetry,revokedRoot,contenders=0,releaseTransactions;const transactionInputs=[],transactionBarrier=new Promise(resolve=>releaseTransactions=resolve);
 const get=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean);if(!keys.length){for(const k of Object.keys(store))delete store[k];Object.assign(store,value);return;}const last=keys.pop();let at=store;for(const k of keys)at=at[k]||={};at[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>structuredClone(get(path))}),transaction:async fn=>{
  if(revokeOnce&&path==='dashboard'){
   // The first tentative write loses to an external permission change. Firebase
   // must rerun the callback against that authoritative, now-revoked policy.
   revokeOnce=false;const current=structuredClone(get(path)),tentative=fn(current);transactionInputs.push(current);
   assert.notEqual(tentative,undefined,'the initial policy must authorize a tentative report');
   const authoritative=structuredClone(get(path)),data=JSON.parse(authoritative.payload);
   data.school.accessConfiguration.roles.Piloto.aeronaves.boxes.status.view=false;
   authoritative.payload=JSON.stringify(data);authoritative.operation='fixture-policy-revoked';authoritative.revision++;
   put(path,authoritative);revokedRoot=structuredClone(authoritative);
   const latest=structuredClone(get(path)),retried=fn(latest);transactionInputs.push(latest);
   if(retried===undefined)return {committed:false,snapshot:{val:()=>structuredClone(get(path))}};
   put(path,retried);return {committed:true,snapshot:{val:()=>structuredClone(retried)}};
  }
  if(concurrent&&path==='dashboard'&&contenders<2){
   // Both requests start from the same snapshot; the loser must retry against
   // the committed winner, as a conflicting RTDB transaction would.
   const current=structuredClone(get(path));let next=fn(current);transactionInputs.push(current);
   if(++contenders===2)releaseTransactions();await transactionBarrier;
   if(JSON.stringify(get(path))!==JSON.stringify(current)){const latest=structuredClone(get(path));next=fn(latest);transactionInputs.push(latest);}
   if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(get(path))}};
   put(path,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};
  }
  if(coldOnce&&path==='dashboard'){
   coldOnce=false;const initial=fn(null);transactionInputs.push(null);
   if(initial===undefined)return {committed:false,snapshot:{val:()=>null}};
   const current=structuredClone(get(path)),retried=fn(current);transactionInputs.push(current);
   if(retried===undefined)return {committed:false,snapshot:{val:()=>structuredClone(get(path))}};
   put(path,retried);return {committed:true,snapshot:{val:()=>structuredClone(retried)}};
  }
  const current=structuredClone(get(path)),next=fn(current);transactionInputs.push(current);
  if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(get(path))}};
  put(path,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};
 }} )};
 const auth={verifyIdToken:async()=>({uid:selectedUser.uid}),getUser:async()=>selectedUser};
 const endpointExports={};vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index.js'),'utf8'),{Buffer,exports:endpointExports,require:name=>({'firebase-functions/v2/https':{onRequest:(_,handler)=>handler},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[name]||require(name.startsWith('./')?'../functions/'+name.slice(2):name))});
 function startCall(payload,holdReply=false){
  let status=200,response,replyReady,release;const ready=new Promise(resolve=>replyReady=resolve),gate=holdReply?new Promise(resolve=>release=resolve):Promise.resolve();
  const done=(async()=>{await endpointExports.accountRegistration({method:'POST',headers:{authorization:'Bearer fixture'},body:payload},{set(){},status(code){status=code;return this;},json(value){response=value;replyReady();},end(){replyReady();}});await gate;return {status,body:response};})();
  return {done,ready,release:()=>release?.()};
 }
 return {store,db,auth,transactionInputs,get revokedRoot(){return revokedRoot;},as:user=>{selectedUser=user;},call:async payload=>startCall(payload).done,startCall,data:()=>JSON.parse(store.dashboard.payload)};
}
const reportInput=()=>structuredClone(body);
function setPilotPolicy(h,policy){const data=h.data();if(policy===undefined)delete data.school.accessConfiguration;else data.school.accessConfiguration.roles.Piloto=structuredClone(policy);h.store.dashboard.payload=JSON.stringify(data);}
function assertNoReportWrites(h,before){
 assert.deepEqual(h.store.dashboard,before,'denial must preserve the payload, receipts, operation, revision and existing audit history');
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,0);assert.equal(h.data().operationalNotices.length,0);
 assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts||{}).length,0);
}

test('a pilot with status view permission can report without any edit permission',async()=>{
 for(const configuredPolicy of [authorizedPilot,{aeronaves:{actions:{view:true,edit:false},areas:{'Información y estatus':true}}}]){
  const h=harness();setPilotPolicy(h,configuredPolicy);
  const policy=require('../functions/access').policyFor(h.data(),account),rights=require('../functions/boxes').permissions(policy,'aeronaves','status');
  assert.deepEqual(rights,{view:true,edit:false});
  const response=await h.call(reportInput());assert.equal(response.status,200);assert.equal(response.body.deduplicated,false);
  assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
  assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts).length,1);
  assert.deepEqual(h.store.dashboard.auditPending['fixture-history'],{meta:{id:'fixture-history',reason:'Historial sintético previo'},chunks:{'000000':[]}});
 }
});

test('an authorized pilot can report every registered aircraft independently of schedule scope',async()=>{
 for(const registration of ['HP_1907','HP1907']){
  const h=harness(),data=h.data(),history=structuredClone(h.store.dashboard.auditPending);
  data.fleet[registration]={reg:registration.replaceAll('_','-'),status:'operativo',mantenimiento:[]};
  data.school.accessConfiguration.roles.Piloto.horario={actions:{view:true},areas:{'Vuelos y rutas':true},aircraft:{mode:'selected',registrations:['HP-1784']}};
  h.store.dashboard.payload=JSON.stringify(data);
  const policy=require('../functions/access').policyFor(h.data(),account);
  assert.equal(require('../functions/boxes').aircraftAllowed(policy,registration),false,'the new aircraft is outside the schedule scope');
  const projected=require('../functions/box-view').boxView(h.data(),account,policy,'aeronaves');
  assert.deepEqual(Object.keys(projected.data.fleet).sort(),['HP_1784',registration].sort(),'status access must expose every registered aircraft');
  const input={...reportInput(),aircraft:registration},saved=await h.call(input);
  assert.equal(saved.status,200);assert.equal(saved.body.deduplicated,false);
  const beforeRetry=structuredClone(h.store.dashboard),retry=await h.call(input);
  assert.equal(retry.status,200);assert.equal(retry.body.deduplicated,true);
  assert.equal(retry.body.taskId,saved.body.taskId);assert.equal(retry.body.operation,saved.body.operation);
  assert.deepEqual(h.store.dashboard,beforeRetry,'a retry must preserve the report and its audit history');
  const current=h.data(),tasks=current.fleet[registration].mantenimiento;
  assert.equal(current.fleet.HP_1784.mantenimiento.length,0);
  assert.equal(tasks.length,1);assert.equal(tasks[0].registration,registration);assert.equal(tasks[0].reportIdempotencyKey,input.idempotencyKey);
  assert.equal(current.operationalNotices.length,1);assert.equal(current.operationalNotices[0].taskId,saved.body.taskId);
  assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts).length,1);
  assert.deepEqual(h.store.dashboard.auditPending['fixture-history'],history['fixture-history']);
 }
});

test('another registered aircraft does not bypass revocation and an unknown aircraft creates no records',async()=>{
 for(const registration of ['HP_1907','HP1907']){
  const h=harness(),data=h.data();
  data.fleet[registration]={reg:registration.replaceAll('_','-'),mantenimiento:[]};
  h.store.dashboard.payload=JSON.stringify(data);
  setPilotPolicy(h,{aeronaves:{actions:{view:true},boxes:{status:{view:false}}}});
  const before=structuredClone(h.store.dashboard),response=await h.call({...reportInput(),aircraft:registration});
  assert.equal(response.status,403);assertNoReportWrites(h,before);
  assert.equal(h.data().fleet[registration].mantenimiento.length,0);
 }
 const h=harness(),before=structuredClone(h.store.dashboard);
 const response=await h.call({...reportInput(),aircraft:'HP_9999'});
 assert.equal(response.status,409);assert.match(response.body.error,/aeronave no existe/);assertNoReportWrites(h,before);
});

test('aircraft report denies missing, hidden-page and explicitly hidden status policies without writes',async()=>{
 const policies=[
  {name:'missing server access configuration',policy:undefined},
  {name:'hidden aircraft page',policy:{aeronaves:{actions:{view:false,edit:true},boxes:{status:{view:true,edit:true}}}}},
  {name:'status denied despite another visible box in the same area',policy:{aeronaves:{actions:{view:true,edit:true},areas:{'Información y estatus':true},boxes:{identity:{view:true,edit:true},status:{view:false,edit:false}}}}}
 ];
 for(const {name,policy} of policies){
  const h=harness({cold:true});setPilotPolicy(h,policy);const before=structuredClone(h.store.dashboard),response=await h.call(reportInput());
  assert.equal(response.status,403,name);assertNoReportWrites(h,before);
 }
});

test('a policy revoked after opening a report is enforced at submission despite a forged client grant',async()=>{
 const h=harness(),openedPolicy=require('../functions/access').policyFor(h.data(),account);
 assert.equal(require('../functions/boxes').permissions(openedPolicy,'aeronaves','status').view,true,'the form was opened while reporting was authorized');
 setPilotPolicy(h,{aeronaves:{actions:{view:true},boxes:{status:{view:false}}}});
 const before=structuredClone(h.store.dashboard),response=await h.call({...reportInput(),policy:openedPolicy,permissions:{view:true,edit:true},role:'Director'});
 assert.equal(response.status,403);assertNoReportWrites(h,before);
});

test('non-pilot roles cannot report even when their configured status permissions grant access',async()=>{
 for(const role of ['Director','Gerente','Administrativo','Estudiante','Mecánico','Contabilidad']){
  const h=harness(),data=h.data();data.school.accessConfiguration.roles[role]=structuredClone(authorizedPilot);h.store.dashboard.payload=JSON.stringify(data);
  h.store.accountRequests[pilot.uid].role=role;
  const before=structuredClone(h.store.dashboard),response=await h.call(reportInput());
  assert.equal(response.status,403,role);assertNoReportWrites(h,before);
 }
});

test('a permission revocation winning a transaction conflict aborts the tentative report and preserves history',async()=>{
 const h=harness({revokeOnRetry:true}),history=structuredClone(h.store.dashboard.auditPending),response=await h.call(reportInput());
 assert.equal(h.transactionInputs.length,2,'the transaction callback must run before and after the external revocation');
 assert.equal(JSON.parse(h.transactionInputs[0].payload).school.accessConfiguration.roles.Piloto.aeronaves.boxes.status.view,true);
 assert.equal(JSON.parse(h.transactionInputs[1].payload).school.accessConfiguration.roles.Piloto.aeronaves.boxes.status.view,false);
 assert.equal(response.status,403);assertNoReportWrites(h,h.revokedRoot);assert.deepEqual(h.store.dashboard.auditPending,history);
});

test('revoked pilots cannot replay accepted receipts, while a later regrant deduplicates the original report',async()=>{
 const h=harness(),saved=await h.call(reportInput());assert.equal(saved.status,200);
 setPilotPolicy(h,{aeronaves:{actions:{view:true},boxes:{status:{view:false}}}});
 const revoked=structuredClone(h.store.dashboard),denied=await h.call(reportInput());
 assert.equal(denied.status,403);assert.deepEqual(h.store.dashboard,revoked,'denied receipt replay must not change any saved data or history');
 setPilotPolicy(h,authorizedPilot);const regranted=structuredClone(h.store.dashboard),retry=await h.call(reportInput());
 assert.equal(retry.status,200);assert.equal(retry.body.deduplicated,true);assert.equal(retry.body.taskId,saved.body.taskId);assert.equal(retry.body.operation,saved.body.operation);
 assert.deepEqual(h.store.dashboard,regranted,'authorized receipt replay must preserve the original report and audit history');
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts).length,1);
});

test('revoked pilots cannot backfill receipts for legacy tasks or alter their audit history',async()=>{
 const h=harness(),saved=await h.call(reportInput());assert.equal(saved.status,200);
 delete h.store.dashboard.aircraftReportReceipts;
 setPilotPolicy(h,{aeronaves:{actions:{view:true},boxes:{status:{view:false}}}});
 const before=structuredClone(h.store.dashboard),response=await h.call(reportInput());
 assert.equal(response.status,403);assert.deepEqual(h.store.dashboard,before,'authorization must precede legacy receipt backfilling');
 assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts||{}).length,0);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});

test('aircraft report survives the initial empty transaction cache',async()=>{
 const h=harness({cold:true}),response=await h.call(reportInput());
 assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(response.body.deduplicated,false);assert.equal(h.transactionInputs.length,2);assert.equal(h.transactionInputs[0],null);assert(h.transactionInputs[1].payload);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});

test('a delayed confirmation and retry with the same key create one task and one authorized alert',async()=>{
 const h=harness(),first=h.startCall(reportInput(),true);await first.ready;const before=structuredClone(h.store.dashboard);
 const retry=await h.call(reportInput());assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.body.deduplicated,true);
 assert.deepEqual(h.store.dashboard,before,'a recognized report must not add another receipt or audit entry');
 first.release();const delayed=await first.done;assert.equal(delayed.status,200);assert.equal(delayed.body.deduplicated,false);assert.equal(delayed.body.taskId,retry.body.taskId);
 const data=h.data(),tasks=data.fleet.HP_1784.mantenimiento,reports=data.operationalNotices.filter(n=>n.kind==='aircraft-report');
 assert.equal(tasks.length,1);assert.equal(reports.length,1);assert.equal(tasks[0].reportIdempotencyKey,id);
 assert.deepEqual(reports[0].recipients,[{kind:'group',id:'mechanics'},{kind:'group',id:'pilots'}]);
 assert.equal(reports[0].taskId,tasks[0].id);assert.equal(reports[0].aircraft,'HP-1784');
});

test('concurrent reports with the same key retry a conflicting transaction without duplicating task or alert',{timeout:5000},async()=>{
 const h=harness({concurrent:true}),responses=await Promise.all([h.call(reportInput()),h.call(reportInput())]);
 for(const response of responses){assert.equal(response.status,200);assert.equal(response.body.ok,true);}
 assert.equal(responses[0].body.taskId,responses[1].body.taskId);
 assert.equal(responses[0].body.operation,responses[1].body.operation);
 assert.deepEqual(responses.map(response=>response.body.deduplicated).sort(),[false,true]);
 assert.equal(h.transactionInputs.length,3,'one transaction must retry after both initial attempts read the same snapshot');
 assert.deepEqual(h.transactionInputs[0],h.transactionInputs[1]);
 assert.notEqual(h.transactionInputs[2].operation,'initial');
 const data=h.data(),tasks=data.fleet.HP_1784.mantenimiento,reports=data.operationalNotices.filter(notice=>notice.kind==='aircraft-report');
 assert.equal(tasks.length,1);assert.equal(reports.length,1);assert.equal(tasks[0].reportIdempotencyKey,id);
 assert.equal(reports[0].taskId,tasks[0].id);assert.equal(h.store.dashboard.revision,5);
 assert.deepEqual(reports[0].recipients,[{kind:'group',id:'mechanics'},{kind:'group',id:'pilots'}]);
});

test('aircraft report rejects non-string idempotency keys without writing tasks or receipts',async()=>{
 const h=harness(),before=structuredClone(h.store.dashboard);
 for(const idempotencyKey of [[id],{id},42,null,undefined]){
  const response=await h.call({...reportInput(),idempotencyKey});assert.equal(response.status,400);
 }
 assert.deepEqual(h.store.dashboard,before);
});

test('a report receipt survives an authorized save deleting its task and still binds the original input',async()=>{
 const h=harness(),saved=await h.call(reportInput()),receipts=structuredClone(h.store.dashboard.aircraftReportReceipts);
 assert.equal(saved.status,200);assert.equal(Object.keys(receipts).length,1);
 h.store.accountRequests[pilot.uid]={...structuredClone(account),role:'Director'};
 const data=h.data();data.fleet.HP_1784.mantenimiento=[];
 const edited=await h.call({action:'director-save',operation:h.store.dashboard.operation,payload:JSON.stringify(data)});
 assert.equal(edited.status,200,JSON.stringify(edited));assert.deepEqual(h.store.dashboard.aircraftReportReceipts,receipts);
 h.store.accountRequests[pilot.uid]=structuredClone(account);
 const before=structuredClone(h.store.dashboard),retry=await h.call(reportInput());
 assert.equal(retry.status,200);assert.equal(retry.body.deduplicated,true);assert.equal(retry.body.taskId,saved.body.taskId);assert.equal(retry.body.operation,saved.body.operation);
 assert.deepEqual(h.store.dashboard,before,'replaying a deleted task must leave the saved payload and revision untouched');
 const conflict=await h.call({...reportInput(),description:'Otra falla no relacionada'});
 assert.equal(conflict.status,409);assert.match(conflict.body.error,/ya se usó/);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,0);assert.equal(h.data().operationalNotices.length,1);assert.deepEqual(h.store.dashboard.aircraftReportReceipts,receipts);
});

test('a recognized report preserves an authorized maintenance edit and its audit history',async()=>{
 const h=harness(),history=structuredClone(h.store.dashboard.auditPending),saved=await h.call(reportInput()),receipts=structuredClone(h.store.dashboard.aircraftReportReceipts);
 assert.equal(saved.status,200);assert.equal(saved.body.deduplicated,false);
 h.store.accountRequests[pilot.uid]={...structuredClone(account),role:'Director'};
 const data=h.data(),task=data.fleet.HP_1784.mantenimiento[0];
 Object.assign(task,{nombre:'Inspección del rotor completada',description:'Observación revisada por taller',resuelto:true,fecha_resuelto:'2026-11-04'});
 const edited=await h.call({action:'director-save',operation:h.store.dashboard.operation,payload:JSON.stringify(data),reason:'Prueba ficticia de resolución de mantenimiento'});
 assert.equal(edited.status,200,JSON.stringify(edited));assert.deepEqual(h.store.dashboard.aircraftReportReceipts,receipts);
 assert.equal(Object.keys(h.store.dashboard.auditPending).length,Object.keys(history).length+2,'the report and authorized maintenance edit must both remain audited alongside existing history');
 for(const [key,entry]of Object.entries(history))assert.deepEqual(h.store.dashboard.auditPending[key],entry,'the authorized edit must preserve previous audit entries');
 h.store.accountRequests[pilot.uid]=structuredClone(account);
 const before=structuredClone(h.store.dashboard),retry=await h.call(reportInput());
 assert.equal(retry.status,200);assert.equal(retry.body.ok,true);assert.equal(retry.body.deduplicated,true);
 assert.equal(retry.body.taskId,saved.body.taskId);assert.equal(retry.body.operation,saved.body.operation);
 assert.deepEqual(h.store.dashboard,before,'recognition must preserve the edited task, receipt, revision and complete audit history');
 assert.deepEqual(h.data().fleet.HP_1784.mantenimiento,[task]);assert.equal(h.data().operationalNotices.length,1);assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts).length,1);
});

test('a legacy keyed task gains a durable receipt without changing application data or audit history',async()=>{
 const h=harness(),saved=await h.call(reportInput());delete h.store.dashboard.aircraftReportReceipts;
 const before=structuredClone(h.store.dashboard),retry=await h.call(reportInput());
 assert.equal(retry.status,200);assert.equal(retry.body.deduplicated,true);assert.equal(retry.body.taskId,saved.body.taskId);
 const {aircraftReportReceipts,...after}=h.store.dashboard;
 assert.equal(Object.keys(aircraftReportReceipts).length,1);assert.deepEqual(after,before);
 const changed=h.data();changed.fleet.HP_1784.mantenimiento[0].description='Descripción modificada en taller';h.store.dashboard.payload=JSON.stringify(changed);
 const again=await h.call(reportInput());assert.equal(again.status,200);assert.equal(again.body.deduplicated,true);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});

test('report receipts are scoped to the verified caller rather than the UUID alone',async()=>{
 const h=harness(),first=await h.call(reportInput()),other={...pilot,uid:'other-pilot-fixture',email:'other-pilot@example.test'};
 h.store.accountRequests[other.uid]={...structuredClone(account),recordId:'other-pilot-record'};
 const data=h.data();data.pilotos.push({id:'other-pilot-record',authUid:other.uid,nombre:'Otro piloto de prueba'});h.store.dashboard.payload=JSON.stringify(data);
 h.as(other);const second=await h.call(reportInput());
 assert.equal(second.status,200);assert.equal(second.body.deduplicated,false);assert.notEqual(second.body.taskId,first.body.taskId);
 const secondRetry=await h.call(reportInput());assert.equal(secondRetry.body.taskId,second.body.taskId);assert.equal(secondRetry.body.deduplicated,true);
 h.as(pilot);const firstRetry=await h.call(reportInput());assert.equal(firstRetry.body.taskId,first.body.taskId);assert.equal(firstRetry.body.deduplicated,true);
 assert.equal(Object.keys(h.store.dashboard.aircraftReportReceipts).length,2);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,2);assert.equal(h.data().operationalNotices.length,2);
});

test('an aborted receipt transaction is not reported as a confirmed retry',async()=>{
 const h=harness();await h.call(reportInput());const ref=h.db.ref;
 h.db.ref=path=>({...ref(path),transaction:async fn=>{fn(structuredClone(h.store.dashboard));return {committed:false,snapshot:{val:()=>structuredClone(h.store.dashboard)}};}});
 const response=await h.call(reportInput());assert.equal(response.status,409);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});

test('aircraft report keeps identity checks and rejects an idempotency key reused for different data',async()=>{
 const h=harness();
 assert.equal((await h.call({...reportInput(),idempotencyKey:'bad'})).status,400);
 const before=structuredClone(h.store.dashboard);
 h.as({...pilot,emailVerified:false});assert.equal((await h.call(reportInput())).status,403);h.as(pilot);
 h.as({...pilot,disabled:true});assert.equal((await h.call(reportInput())).status,403);h.as(pilot);
 for(const changes of [{assignedAt:null},{recordKind:'student'}]){
  h.store.accountRequests[pilot.uid]={...structuredClone(account),...changes};assert.equal((await h.call(reportInput())).status,403);
 }
 h.store.accountRequests[pilot.uid]=structuredClone(account);assertNoReportWrites(h,before);
 h.store.accountRequests[pilot.uid].syncStatus='pending';assert.equal((await h.call(reportInput())).status,403);h.store.accountRequests[pilot.uid]=structuredClone(account);
 const identityData=h.data();identityData.pilotos[0].authUid='someone-else';h.store.dashboard.payload=JSON.stringify(identityData);assert.equal((await h.call(reportInput())).status,409);
 identityData.pilotos[0].authUid=pilot.uid;h.store.dashboard.payload=JSON.stringify(identityData);
 const saved=await h.call(reportInput());assert.equal(saved.status,200);
 const conflict=await h.call({...reportInput(),description:'Otra falla no relacionada'});assert.equal(conflict.status,409);assert.match(conflict.body.error,/ya se usó/);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});
