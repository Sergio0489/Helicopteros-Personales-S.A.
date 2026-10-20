'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('History and director save require authorized sessions; saves and audit are atomic with conflict protection',async()=>{
 const user={uid:'test-director',email:'director@example.test',emailVerified:true};
 const store={dashboard:{schemaVersion:1,operation:'old',revision:1,payload:JSON.stringify({fleet:{HP_18BLM:{hours:20}}})},accountRequests:{'test-director':{role:'Director',assignedAt:'test',profile:{name:'Director de prueba'}}}};
 const get=path=>path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],store)??null;
 const put=(path,value)=>{const ks=path.split('/').filter(Boolean),last=ks.pop();let target=store;for(const k of ks)target=target[k]||={};target[last]=value;};
 let historyReads=0;
 const db={ref:(path='')=>{if(path.startsWith('audit'))historyReads++;const chain={get:async()=>({val:()=>get(path)}),transaction:async fn=>{if(path==='dashboard'&&get(path)!==null){const initial=fn(null);assert.notEqual(initial,undefined,'A cold cache must reach the server before aborting');}const next=fn(get(path));if(next===undefined)return {committed:false};put(path,next);return {committed:true,snapshot:{val:()=>next}};},update:async patch=>{for(const [k,v]of Object.entries(patch))put([path,k].filter(Boolean).join('/'),v);}};for(const key of ['orderByKey','startAt','endAt','endBefore','limitToLast'])chain[key]=()=>chain;return chain;}};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{Buffer,exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>user})},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 async function call(action,extra={},token='test'){let status=200,body;const res={set(){},status(s){status=s;return res;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:token?'Bearer '+token:''},body:{action,...extra}},res);return {status,body};}
 assert.equal((await call('audit-list',{},'')).status,401);
 user.uid='student';assert.equal((await call('audit-list')).status,403);assert.equal((await call('audit-detail',{id:'a'})).status,403);assert.equal((await call('director-save')).status,403);assert.equal(historyReads,0);
 user.uid='test-director';const next=JSON.stringify({fleet:{HP_18BLM:{hours:21}}});assert.equal((await call('director-save',{payload:next,operation:'stale'})).status,409);assert(!store.dashboard.auditPending);
 let r=await call('director-save',{payload:next,operation:'old',reason:'Ajuste de prueba',uid:'forged'});assert.equal(r.status,200);assert.equal(store.dashboard.updatedBy,user.uid);const item=Object.values(store.dashboard.auditPending)[0];assert.equal(item.meta.uid,user.uid);assert.equal(item.meta.reason,'Ajuste de prueba');assert.equal(item.chunks['000000'][0].before,20);assert.equal(item.chunks['000000'][0].after,21);
 assert.equal((await call('audit-list')).status,200);user.disabled=true;assert.equal((await call('audit-list')).status,403);
});
