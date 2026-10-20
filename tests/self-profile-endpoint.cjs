'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Self profile endpoint validates identity, conflicts, verified record sync and email migration',async()=>{
 const user={uid:'owner',email:'own@example.test',emailVerified:true,disabled:false};
 const payload={fleet:{},pilotos:[],school:{students:[{id:'own',name:'Before',email:user.email,courses:[]},{id:'other',name:'Other',email:'other@example.test',courses:[]}],registry:{clients:[]}}};
 const store={dashboard:{operation:'initial',payload:JSON.stringify(payload)},accountRequests:{owner:{role:'Estudiante',profile:{name:'Before'},email:user.email}}};
 const get=path=>path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||={};target[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>get(path)}),transaction:async fn=>{const next=fn(get(path));if(next===undefined)return {committed:false};put(path,next);return {committed:true,snapshot:{val:()=>next}};},update:async patch=>{for(const [key,value]of Object.entries(patch))put([path,key].filter(Boolean).join('/'),value);}})};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>user})},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 async function call(action,extra={},token='synthetic'){let status=200,body;const res={set(){},status(s){status=s;return res;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:token?'Bearer '+token:''},body:{action,...extra}},res);return {status,body};}
 assert.equal((await call('self-profile',{},'')).status,401);
 let response=await call('self-profile');assert.equal(response.body.profile.name,'Before');assert.equal(response.body.role,'Estudiante');assert.equal(response.body.linked,true);
 const profile={name:'Updated',phone:'TEST-CONTACT',photo:''};
 assert.equal((await call('self-profile-save',{operation:'initial',profile:{...profile,role:'Director'}})).status,400);
 assert.equal((await call('self-profile-save',{operation:'stale',profile})).status,409);
 response=await call('self-profile-save',{operation:'initial',profile,uid:'other'});assert.equal(response.status,200);assert.equal(response.body.profile.name,'Updated');assert.equal(store.accountRequests.owner.role,'Estudiante');assert(!store.accountRequests.owner.assignedAt);
 const data=JSON.parse(store.dashboard.payload);assert.equal(data.school.students[0].name,'Updated');assert.equal(data.school.students[1].name,'Other');assert.equal(data.school.students[0].authUid,user.uid);
 user.email='verified-new@example.test';response=await call('self-profile');assert.equal(response.status,200);assert.equal(response.body.linked,true);assert.equal(JSON.parse(store.dashboard.payload).school.students[0].email,user.email);
 user.email='other@example.test';response=await call('self-profile');assert.equal(response.status,400);assert.equal(JSON.parse(store.dashboard.payload).school.students[1].name,'Other');
 user.disabled=true;assert.equal((await call('self-profile')).status,403);
});
