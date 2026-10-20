'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('New accounts stay students, verify before linking, and require Director confirmation',async()=>{
 const member={uid:'new-student',email:'new@example.test',emailVerified:false,disabled:false};
 const director={uid:'director',email:'director@example.test',emailVerified:true,disabled:false};let user=member;
 const data={fleet:{},school:{students:[{id:'s-new',name:'Nombre del expediente',email:' NEW@example.test ',courses:[]}],registry:{clients:[]},accessConfiguration:{roles:{Estudiante:{estudiantes:{actions:{view:true},boxes:{account:{view:true,edit:false}}}}}}}};
 const store={dashboard:{operation:'initial',payload:JSON.stringify(data)},accountRequests:{director:{role:'Director',assignedAt:'confirmed'}}};
 const get=path=>path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||=( {} );target[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>get(path)}),transaction:async fn=>{const next=fn(get(path));if(next===undefined)return {committed:false};put(path,next);return {committed:true,snapshot:{val:()=>next}};},update:async patch=>{for(const [key,v]of Object.entries(patch))put([path,key].filter(Boolean).join('/'),v);}})};
 const auth={verifyIdToken:async()=>({uid:user.uid}),getUser:async uid=>uid===director.uid?director:member};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 async function call(action,extra={}){let status=200,body;const res={set(){},status(s){status=s;return res;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:'Bearer synthetic'},body:{action,...extra}},res);return {status,body};}
 assert.equal((await call('submit',{role:'Director',profile:{name:'Nombre solicitado',role:'Director'}})).status,200);
 assert.equal(store.accountRequests[member.uid].role,'Estudiante');assert(!store.accountRequests[member.uid].assignedAt);assert(!store.accountRequests[member.uid].recordId);
 assert.equal((await call('access',{page:'estudiantes',layout:'main'})).status,403);
 user=director;assert.equal((await call('assign',{uid:member.uid,role:'Estudiante'})).status,400);
 member.emailVerified=true;user=member;
 const status=await call('status');assert.equal(status.body.matched,true);assert.equal(status.body.profile.name,'Nombre del expediente');assert.equal(store.accountRequests[member.uid].recordId,'s-new');
 assert.equal((await call('access',{page:'estudiantes',layout:'main'})).status,403);
 user=director;assert.equal((await call('assign',{uid:member.uid,role:'Estudiante'})).status,200);
 user=member;const access=await call('access',{page:'estudiantes',layout:'main'});assert.equal(access.status,200);assert.equal(access.body.native.ownStatement,true);assert.equal(access.body.native.data.school.students.length,1);
 assert.equal((await call('assign',{uid:director.uid,role:'Estudiante'})).status,403);
 const saved=JSON.parse(store.dashboard.payload);assert.equal(saved.school.students.length,1,'Existing matching student is reused');assert.deepEqual(saved.school.students[0].courses,data.school.students[0].courses,'Registration does not invent courses or payments');assert.deepEqual(saved.school.registry,data.school.registry);assert.equal(saved.school.students[0].authUid,member.uid);
});
