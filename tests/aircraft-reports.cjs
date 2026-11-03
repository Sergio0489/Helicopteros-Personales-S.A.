'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const pilot={uid:'pilot-fixture',email:'pilot@example.test',emailVerified:true,disabled:false};
const account={role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const actor={uid:pilot.uid,name:'Piloto de prueba',role:'Piloto'};
const id='11111111-1111-4111-8111-111111111111';
const body={action:'aircraft-report',aircraft:'HP-1784',description:'Vibración en el rotor de cola',idempotencyKey:id};
function harness({cold=false}={}){
 const store={dashboard:{operation:'initial',revision:4,payload:JSON.stringify({fleet:{HP_1784:{reg:'HP-1784',mantenimiento:[]}},pilotos:[{id:'pilot-record',authUid:pilot.uid,nombre:'Piloto de prueba'}],operationalNotices:[]})},accountRequests:{[pilot.uid]:structuredClone(account)}};
 let selectedUser=pilot,coldOnce=cold;const transactionInputs=[];
 const get=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean);if(!keys.length){for(const k of Object.keys(store))delete store[k];Object.assign(store,value);return;}const last=keys.pop();let at=store;for(const k of keys)at=at[k]||={};at[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>structuredClone(get(path))}),transaction:async fn=>{
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
 const endpointExports={};vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index.js'),'utf8'),{exports:endpointExports,require:name=>({'firebase-functions/v2/https':{onRequest:(_,handler)=>handler},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[name]||require(name.startsWith('./')?'../functions/'+name.slice(2):name))});
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
 assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(h.transactionInputs.length,2);assert.equal(h.transactionInputs[0],null);assert(h.transactionInputs[1].payload);
 assert.equal(h.data().fleet.HP_1784.mantenimiento.length,1);assert.equal(h.data().operationalNotices.length,1);
});

test('a delayed confirmation and retry with the same key create one task and one authorized alert',async()=>{
 const h=harness(),first=h.startCall(reportInput(),true);await first.ready;
 const retry=await h.call(reportInput());assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.body.deduplicated,true);
 first.release();const delayed=await first.done;assert.equal(delayed.status,200);assert.equal(delayed.body.taskId,retry.body.taskId);
 const data=h.data(),tasks=data.fleet.HP_1784.mantenimiento,reports=data.operationalNotices.filter(n=>n.kind==='aircraft-report');
 assert.equal(tasks.length,1);assert.equal(reports.length,1);assert.equal(tasks[0].reportIdempotencyKey,id);
 assert.deepEqual(reports[0].recipients,[{kind:'group',id:'mechanics'},{kind:'group',id:'pilots'}]);
 assert.equal(reports[0].taskId,tasks[0].id);assert.equal(reports[0].aircraft,'HP-1784');
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
