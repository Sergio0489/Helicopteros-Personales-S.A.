'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const pilot={uid:'pilot-fixture',email:'pilot@example.test',emailVerified:true,disabled:false};
const account={role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const actor={uid:pilot.uid,name:'Piloto de prueba',role:'Piloto'};
const id='11111111-1111-4111-8111-111111111111';
const body={action:'aircraft-report',aircraft:'HP-1784',description:'Vibración en el rotor de cola',idempotencyKey:id};
function harness({cold=false,concurrent=false}={}){
 const store={dashboard:{operation:'initial',revision:4,payload:JSON.stringify({fleet:{HP_1784:{reg:'HP-1784',mantenimiento:[]}},pilotos:[{id:'pilot-record',authUid:pilot.uid,nombre:'Piloto de prueba'}],operationalNotices:[]})},accountRequests:{[pilot.uid]:structuredClone(account)}};
 let selectedUser=pilot,coldOnce=cold,contenders=0,releaseTransactions;const transactionInputs=[],transactionBarrier=new Promise(resolve=>releaseTransactions=resolve);
 const get=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean);if(!keys.length){for(const k of Object.keys(store))delete store[k];Object.assign(store,value);return;}const last=keys.pop();let at=store;for(const k of keys)at=at[k]||={};at[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>structuredClone(get(path))}),transaction:async fn=>{
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
   if(retried===undefined)return {committed:false,snapshot:{val:structuredClone(get(path))}};
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
 return {store,db,auth,transactionInputs,as:user=>{selectedUser=user;},call:async payload=>startCall(payload).done,startCall,data:()=>JSON.parse(store.dashboard.payload)};
}
const reportInput=()=>structuredClone(body);

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
 const h=harness(),saved=await h.call(reportInput()),receipts=structuredClone(h.store.dashboard.aircraftReportReceipts);
 assert.equal(saved.status,200);assert.equal(saved.body.deduplicated,false);
 h.store.accountRequests[pilot.uid]={...structuredClone(account),role:'Director'};
 const data=h.data(),task=data.fleet.HP_1784.mantenimiento[0];
 Object.assign(task,{nombre:'Inspección del rotor completada',description:'Observación revisada por taller',resuelto:true,fecha_resuelto:'2026-11-04'});
 const edited=await h.call({action:'director-save',operation:h.store.dashboard.operation,payload:JSON.stringify(data),reason:'Prueba ficticia de resolución de mantenimiento'});
 assert.equal(edited.status,200,JSON.stringify(edited));assert.deepEqual(h.store.dashboard.aircraftReportReceipts,receipts);
 assert.equal(Object.keys(h.store.dashboard.auditPending).length,2,'the report and authorized maintenance edit must both remain audited');
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
 h.as({...pilot,disabled:true});assert.equal((await h.call(reportInput())).status,403);h.as(pilot);
 h.store.accountRequests[pilot.uid].syncStatus='pending';assert.equal((await h.call(reportInput())).status,403);h.store.accountRequests[pilot.uid]=structuredClone(account);
 const identityData=h.data();identityData.pilotos[0].authUid='someone-else';h.store.dashboard.payload=JSON.stringify(identityData);assert.equal((await h.call(reportInput())).status,409);
 identityData.pilotos[0].authUid=pilot.uid;h.store.dashboard.payload=JSON.stringify(identityData);
 const saved=await h.call(reportInput());assert.equal(saved.status,200);
 const conflict=await h.call({...reportInput(),description:'Otra falla no relacionada'});assert.equal(conflict.status,409);assert.match(conflict.body.error,/ya se usó/);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});
