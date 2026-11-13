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
 const put=(path,value)=>{if(!path){for(const k of Object.keys(store))delete store[k];Object.assign(store,value);return;}const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||={};target[last]=value;};
 const db={ref:(path='')=>({get:async()=>({val:()=>structuredClone(get(path))}),transaction:async fn=>{const next=fn(structuredClone(get(path)));if(next===undefined)return {committed:false,snapshot:{val:()=>get(path)}};put(path,next);return {committed:true,snapshot:{val:()=>next}};},update:async patch=>{for(const [key,value]of Object.entries(patch))put([path,key].filter(Boolean).join('/'),value);}})};
 const auth={verifyIdToken:async()=>({uid:user.uid}),getUser:async uid=>people.find(u=>u.uid===uid),listUsers:async()=>({users:[existing]})};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 const call=async(action,extra={})=>{let status=200,body;const res={set(){},status(s){status=s;return res;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:'Bearer synthetic'},body:{action,...extra}},res);return {status,body};};
 return {store,member,director,existing,db,auth,call,as:u=>{user=u;},data:()=>JSON.parse(store.dashboard.payload)};
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

const reviewProfile={name:'Álex Prueba',identity:'TEST-OWN'};
function reviewFixture({verified=true,assigned=true,own=true,foreign='student',sameIdentity=false,accountOnly=false}={}){
 const h=harness();h.member.emailVerified=verified;
 const data=h.data();data.school.accessConfiguration={roles:{Estudiante:{estudiantes:{actions:{view:true},boxes:{account:{view:true,edit:false}}}}}};
 if(own)data.school.students.push({id:'own-student',name:reviewProfile.name,email:h.member.email,identity:reviewProfile.identity,authUid:assigned?h.member.uid:undefined,courses:[{id:'own-course',payments:[{id:'own-payment',cents:12000}],flights:[{id:'own-flight',hours100:100}]}]});
 const other={id:'foreign-record',name:'ALEX PRUEBA',email:'homonym@example.test',identity:sameIdentity?'TEST-OWN':'TEST-OTHER',courses:[{id:'foreign-course',payments:[{id:'foreign-payment',cents:7000}]}]};
 if(foreign==='pilot'){other.nombre=other.name;delete other.name;data.pilotos.push(other);}
 else if(foreign==='personnel')data.school.personnel.push(other);
 else if(foreign==='client')data.school.registry.clients.push(other);
 else if(foreign==='student')data.school.students.push(other);
 if(accountOnly)h.store.accountRequests['other-fixture']={role:'Estudiante',profile:{name:'ALEX PRUEBA',identity:'TEST-OTHER'},email:'other@example.test'};
 h.store.dashboard.payload=JSON.stringify(data);
 if(assigned)h.store.accountRequests[h.member.uid]={role:'Estudiante',assignedAt:'fixture-approved',email:h.member.email,profile:{...reviewProfile}};
 return h;
}
function beforeAccountSync(h,hook){
 const ref=h.db.ref;let once=true;
 h.db.ref=(path='')=>{
  const original=ref(path);if(path!=='accountRequests/'+h.member.uid)return original;
  return {...original,transaction:async update=>{
   if(once){once=false;await hook();}
   return original.transaction(update);
  }};
 };
}
const requestReview=h=>h.call('submit',{profile:reviewProfile,requestIdentityReview:true});

test('homonyms in every dossier directory keep review pending despite a matching own email',async()=>{
 for(const foreign of ['student','pilot','personnel','client'])for(const assigned of [true,false]){
  const h=reviewFixture({foreign,assigned}),before=h.data(),response=await requestReview(h);
  const access=await h.call('access',{page:'estudiantes',layout:'main'});
  assert.equal(access.status,403,'a confirmed role and matching email must not bypass the pending name review');
  assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,true,foreign);
  assert.equal(response.body.matched,false);assert.equal(response.body.syncStatus,'duplicate-identity');
  assert.equal((await h.call('access',{page:'estudiantes',layout:'main'})).status,403);
  const after=h.data(),rows=data=>[...data.pilotos,...data.school.students,...data.school.personnel,...data.school.registry.clients];
  assert.deepEqual(rows(after).find(r=>r.id==='foreign-record'),rows(before).find(r=>r.id==='foreign-record'),'the other person and their history must remain unchanged');
  assert.deepEqual(after.school.students.find(r=>r.id==='own-student').courses,before.school.students.find(r=>r.id==='own-student').courses);
 }
});

test('a new account with a homonym stays pending after email verification without granting a role',async()=>{
 const h=reviewFixture({verified:false,assigned:false,own:false});
 const submitted=await requestReview(h);assert.equal(submitted.body.identityReviewPending,true);
 assert(!h.store.accountRequests[h.member.uid].assignedAt);
 h.member.emailVerified=true;
 const response=await h.call('status');assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);
 assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
 assert(!h.store.accountRequests[h.member.uid].assignedAt);
});

test('a homonym in another account cannot be cleared by matching the caller own dossier',async()=>{
 const h=reviewFixture({foreign:null,accountOnly:true}),response=await requestReview(h);
 assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);
 assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
});

test('resubmitting changed personal data cannot withdraw a pending Director review',async()=>{
 const h=reviewFixture({verified:false,assigned:false,own:false});
 assert.equal((await requestReview(h)).body.identityReviewPending,true);
 const response=await h.call('submit',{profile:{name:'Nombre Diferente',identity:'TEST-CHANGED'},requestIdentityReview:true,identityReviewPending:false,role:'Director'});
 assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,true);
 assert.equal(h.store.accountRequests[h.member.uid].identityReviewPending,true);
 assert.equal(h.store.accountRequests[h.member.uid].role,'Estudiante');
});

test('status, users refresh, cache invalidation and role assignment do not approve an identity review',async()=>{
 const h=reviewFixture();Object.assign(h.store.accountRequests[h.member.uid],{identityReviewPending:true,syncedOperation:null});
 for(let i=0;i<2;i++){
  const response=await h.call('status');assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);
 }
 h.store.dashboard.operation='fixture-refresh';
 h.auth.listUsers=async()=>({users:[h.member]});h.as(h.director);
 const users=await h.call('users');assert.equal(users.status,200);assert.equal(users.body.users[0].identityReviewPending,true);
 const assigned=await h.call('assign',{uid:h.member.uid,role:'Estudiante'});assert.equal(assigned.status,200);
 assert.equal(h.store.accountRequests[h.member.uid].identityReviewPending,true);
 h.as(h.member);assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
});

test('synchronization preserves an identity review recorded after its initial account read',async()=>{
 const h=reviewFixture({foreign:null});
 beforeAccountSync(h,()=>{h.store.accountRequests[h.member.uid].identityReviewPending=true;});
 const response=await h.call('status');
 assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);
 assert.equal(h.store.accountRequests[h.member.uid].identityReviewPending,true);
});

test('a confirmed Director merge clears review only for records representing the same fictitious person',async()=>{
 const h=reviewFixture({foreign:null}),data=h.data();
 data.school.personnel.push({id:'legacy-personnel',name:reviewProfile.name,email:'previous@example.test',identity:reviewProfile.identity});
 h.store.dashboard.payload=JSON.stringify(data);
 assert.equal((await requestReview(h)).body.identityReviewPending,true);
 h.as(h.director);const preview=await h.call('identity-preview'),group=preview.body.groups.find(g=>g.uids.includes(h.member.uid));
 const input={members:group.members.map(m=>m.key),revision:group.revision,confirm:true,primaryKey:group.members.find(m=>m.id==='own-student').key};
 h.as(h.member);assert.equal((await h.call('identity-merge',input)).status,403);
 h.as(h.director);assert.equal((await h.call('identity-merge',{...input,confirm:false})).status,400);
 const approved=await h.call('identity-merge',input);assert.equal(approved.status,200);
 assert.equal(h.store.accountRequests[h.member.uid].identityReviewPending,false);
 assert.equal(Object.keys(h.store.identityMergeArchive).length,1);
 h.as(h.member);const response=await h.call('status');assert.equal(response.body.identityReviewPending,false);assert.equal(response.body.matched,true);
 assert.equal((await h.call('access',{page:'estudiantes'})).status,200);
});

test('a stale synchronization cannot overwrite a Director merge completed during its account transaction',async()=>{
 const h=reviewFixture({foreign:null}),data=h.data();
 data.school.personnel.push({id:'legacy-personnel',name:reviewProfile.name,email:'previous@example.test',identity:reviewProfile.identity});
 h.store.dashboard.payload=JSON.stringify(data);
 Object.assign(h.store.accountRequests[h.member.uid],{identityReviewPending:true,verified:true,syncedOperation:null});
 beforeAccountSync(h,async()=>{
  h.as(h.director);const preview=await h.call('identity-preview'),group=preview.body.groups.find(g=>g.uids.includes(h.member.uid));
  const result=await h.call('identity-merge',{members:group.members.map(m=>m.key),revision:group.revision,confirm:true,primaryKey:group.members.find(m=>m.id==='own-student').key});
  assert.equal(result.status,200);h.as(h.member);
 });
 const stale=await h.call('status');assert.equal(stale.status,400,'the stale account write must abort');
 assert.equal(h.store.accountRequests[h.member.uid].identityReviewPending,false);
 const refreshed=await h.call('status');assert.equal(refreshed.body.identityReviewPending,false);assert.equal(refreshed.body.matched,true);
});

test('uncontested verified email matches and records already linked to the same person still synchronize',async()=>{
 const h=reviewFixture({foreign:null}),data=h.data();
 data.school.personnel.push({id:'own-personnel',name:reviewProfile.name,email:h.member.email,identity:reviewProfile.identity,authUid:h.member.uid});
 h.store.dashboard.payload=JSON.stringify(data);
 const response=await requestReview(h);assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,false);assert.equal(response.body.matched,true);
 assert.equal((await h.call('access',{page:'estudiantes'})).status,200);
});

test('a duplicate document with different names retains the existing identity restriction',async()=>{
 const h=reviewFixture({sameIdentity:true}),data=h.data();data.school.students.find(r=>r.id==='foreign-record').name='Otro Nombre';
 h.store.dashboard.payload=JSON.stringify(data);
 const response=await requestReview(h);assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);
 assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
});

test('an uncommitted synchronization cannot return a successful identity decision',async()=>{
 const h=reviewFixture({foreign:null}),ref=h.db.ref;
 h.db.ref=(path='')=>{const original=ref(path);return path==='accountRequests/'+h.member.uid?{...original,transaction:async update=>{update(structuredClone(h.store.accountRequests[h.member.uid]));return {committed:false,snapshot:{val:()=>structuredClone(h.store.accountRequests[h.member.uid])}};}}:original;};
 assert.equal((await h.call('status')).status,400);
});

test('synchronization retries empty caches for existing accounts and still creates missing requests',async()=>{
 for(const merged of [false,true]){
  const h=reviewFixture({foreign:null}),account=h.store.accountRequests[h.member.uid];
  account.identityReviewPending=true;if(merged)account.mergedAt='2026-11-01T12:00:00.000Z';
  const ref=h.db.ref;let cold=true;
  h.db.ref=(path='')=>{
   const original=ref(path);if(path!=='accountRequests/'+h.member.uid)return original;
   return {...original,transaction:async update=>{
    if(cold){cold=false;assert.equal(update(null),null,'an empty cache must retry instead of removing or rejecting an existing review');}
    return original.transaction(update);
   }};
  };
  const response=await h.call('status');assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,true);assert.equal(response.body.matched,false);assert.equal(cold,false);
 }
 const h=harness();h.member.emailVerified=true;
 const response=await h.call('status');assert.equal(response.status,200);assert.equal(response.body.matched,true);
 assert(h.store.accountRequests[h.member.uid]);assert(!h.store.accountRequests[h.member.uid].assignedAt);
});
