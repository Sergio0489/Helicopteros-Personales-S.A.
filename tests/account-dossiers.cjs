'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ensure}=require('../functions/account-dossiers'),{matchRecord}=require('../functions/record-link');
function harness(){
 const member={uid:'new-user',email:'new@example.test',emailVerified:false,disabled:false,displayName:'Usuario nuevo',metadata:{}};
 const director={uid:'director-test',email:'director@example.test',emailVerified:true,disabled:false,metadata:{}};
 const existing={uid:'old-staff',email:'oldstaff@example.test',emailVerified:true,disabled:false,metadata:{}};
 const store={dashboard:{operation:'initial',schemaVersion:1,payload:JSON.stringify({fleet:{},pilotos:[],school:{students:[],personnel:[],registry:{clients:[]}}})},accountRequests:{[director.uid]:{role:'Director',assignedAt:'confirmed',profile:{name:'Director de prueba'}},[existing.uid]:{role:'Administrativo',assignedAt:'old',profile:{name:'Personal existente',phone:'TEST-CONTACT',address:'Dirección de prueba'},email:existing.email,verified:true,syncVersion:3}}};
 let user=member;const people=[member,director,existing];
 const get=path=>path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],store)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||={};target[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>get(path)}),transaction:async fn=>{const next=fn(get(path));if(next===undefined)return {committed:false,snapshot:{val:()=>get(path)}};put(path,next);return {committed:true,snapshot:{val:()=>next}};},update:async patch=>{for(const [key,value]of Object.entries(patch))put([path,key].filter(Boolean).join('/'),value);}})};
 const auth={verifyIdToken:async()=>({uid:user.uid}),getUser:async uid=>people.find(u=>u.uid===uid),listUsers:async()=>({users:[existing]})};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 const call=async(action,extra={})=>{let status=200,body;const res={set(){},status(s){status=s;return res;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:'Bearer synthetic'},body:{action,...extra}},res);return {status,body};};
 return {store,member,director,existing,call,as:u=>{user=u;},data:()=>JSON.parse(store.dashboard.payload)};
}
test('registration creates a student without granting access; roles classify dossiers and preserve financial history',async()=>{
 const h=harness();let result=await h.call('submit',{role:'Director',profile:{name:'Usuario de prueba',address:'Dirección de prueba',phone:'TEST-CONTACT'}});assert.equal(result.status,200);assert.equal(h.store.accountRequests[h.member.uid].role,'Estudiante');assert(!h.store.accountRequests[h.member.uid].assignedAt);assert.equal(h.data().school.students.length,1);assert.equal(h.data().school.students[0].name,'Usuario de prueba');assert.equal((await h.call('access')).status,403);
 await h.call('submit',{profile:{name:'Usuario de prueba'}});assert.equal(h.data().school.students.length,1);
 h.member.emailVerified=true;result=await h.call('status');assert.equal(result.status,200);assert.equal(result.body.matched,true);assert.equal(h.store.accountRequests[h.member.uid].recordKind,'student');assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
 const data=h.data(),id=data.school.students[0].id;data.school.students[0].courses=[{id:'course',payments:[{id:'payment',cents:15000}],flights:[{id:'flight',hours100:100}]}];data.school.registry.entries=[{id:'entry',personId:id,personKind:'student'}];h.store.dashboard.payload=JSON.stringify(data);h.store.dashboard.operation='finance';
 h.as(h.director);result=await h.call('assign',{uid:h.member.uid,role:'Administrativo'});assert.equal(result.status,200);assert.equal(result.body.recordKind,'personnel');assert.equal(h.data().school.personnel.length,1);assert.equal(h.data().school.personnel[0].name,'Usuario de prueba');assert.equal(h.data().school.students[0].directoryKind,'personnel');assert.deepEqual(h.data().school.students[0].courses,data.school.students[0].courses);assert.deepEqual(h.data().school.registry.entries,data.school.registry.entries);
 result=await h.call('assign',{uid:h.member.uid,role:'Gerente'});assert.equal(result.status,200);assert.equal(h.data().school.personnel.length,1);
 result=await h.call('assign',{uid:h.member.uid,role:'Piloto'});assert.equal(result.body.recordKind,'pilot');assert.equal(h.data().pilotos.length,1);assert.deepEqual(h.data().pilotos[0].verificaciones,[]);assert(!h.data().pilotos[0].instructorExpiry);assert.equal(h.data().school.personnel[0].directoryKind,'pilot');
 result=await h.call('assign',{uid:h.member.uid,role:'Estudiante'});assert.equal(result.body.recordKind,'student');assert.equal(result.body.recordId,id);assert.equal(h.data().school.students.length,1);assert.deepEqual(h.data().school.students[0].courses,data.school.students[0].courses);
 h.as(h.member);assert.equal((await h.call('assign',{uid:h.existing.uid,role:'Director'})).status,403);
});
test('users refresh repairs existing staff missing a dossier once and links personal profile updates',async()=>{
 const h=harness();h.as(h.director);let response=await h.call('users');assert.equal(response.status,200);assert.equal(response.body.users[0].recordKind,'personnel');assert.equal(h.data().school.personnel[0].address,'Dirección de prueba');assert.equal(h.data().school.personnel[0].celular,'TEST-CONTACT');const first=h.store.dashboard.operation;
 response=await h.call('users');assert.equal(response.status,200);assert.equal(h.data().school.personnel.length,1);assert.equal(h.store.dashboard.operation,first,'no repeated dashboard write');
 h.as(h.existing);response=await h.call('self-profile');assert.equal(response.body.linked,true);const operation=response.body.operation;response=await h.call('self-profile-save',{operation,profile:{name:'Personal actualizado',phone:'TEST-NEW',photo:''}});assert.equal(response.status,200);assert.equal(h.data().school.personnel[0].name,'Personal actualizado');assert.equal(h.data().school.personnel[0].celular,'TEST-NEW');
 h.existing.email='updated@example.test';response=await h.call('self-profile');assert.equal(response.status,200);assert.equal(h.data().school.personnel[0].email,h.existing.email);assert.equal(response.body.linked,true);
});
test('verified email matching refuses ambiguous or differently owned records; unverified users never claim records',()=>{
 const u={uid:'test-user',email:'same@example.test',emailVerified:false},base={fleet:{},school:{students:[{id:'s',email:u.email,name:'Existing'}]}};
 assert.equal(ensure(base,u,{profile:{name:'Attempt'}}).changed,false);
 u.emailVerified=true;const duplicate=structuredClone(base);duplicate.school.students.push({...duplicate.school.students[0],id:'s2'});assert.equal(ensure(duplicate,u,{role:'Administrativo'}).status,'duplicate-email');assert.deepEqual(ensure(duplicate,u,{}).data,duplicate);
 base.school.students[0].authUid='other';assert.equal(ensure(base,u,{}).status,'linked-to-another-user');delete base.school.students[0].authUid;
 const updated=ensure(base,u,{role:'Piloto',profile:{name:'Attempt'}});assert.equal(updated.record.nombre,'Existing');assert.equal(matchRecord(updated.data,u.email,u.uid).kind,'pilot');assert.equal(updated.data.school.students[0].name,'Existing');
 assert.equal(ensure(updated.data,u,{role:'Piloto',recordKind:'pilot'}).changed,false);
});
