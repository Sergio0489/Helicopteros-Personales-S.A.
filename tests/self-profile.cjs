'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {clean,apply,migrateEmail}=require('../functions/self-profile');
const base=()=>({fleet:{HP1186:{status:'operativo'}},school:{students:[{id:'own',name:'Before',phone:'',email:'own@example.test',courses:[{id:'c1',payments:[{cents:2000}]}]},{id:'other',name:'Other',email:'other@example.test',courses:[]}],registry:{clients:[]}},pilotos:[]});
const user={uid:'owner',email:'own@example.test',emailVerified:true};
test('Profile edits are restricted to own verified matching record and safe fields',()=>{
 const data=base(),profile=clean({name:'After',phone:'TEST-CONTACT',photo:''}),out=apply(data,user,profile);
 assert.equal(out.data.school.students[0].name,'After');assert.equal(out.data.school.students[0].authUid,'owner');assert.deepEqual(out.data.school.students[0].courses,data.school.students[0].courses);assert.deepEqual(out.data.school.students[1],data.school.students[1]);assert.deepEqual(out.data.fleet,data.fleet);assert.equal(data.school.students[0].name,'Before');
 for(const field of ['role','email','uid','recordId','courses'])assert.throws(()=>clean({...profile,[field]:'Director'}));
 assert.throws(()=>clean({...profile,photo:'javascript:alert(1)'}));assert.throws(()=>clean({...profile,name:''}));
 const unverified=apply(data,{...user,emailVerified:false},profile);assert.deepEqual(unverified.data.school.students,data.school.students);
 data.school.students.push({...data.school.students[0],id:'duplicate'});assert.throws(()=>apply(data,user,profile));
 data.school.students.pop();data.school.students[0].authUid='someone-else';assert.throws(()=>apply(data,user,profile));
});
test('Profile sync supports pilots and clients without changing their operational records',()=>{
 for(const kind of ['pilot','client']){const data={pilotos:kind==='pilot'?[{id:'p1',nombre:'Before',email:user.email,medico:'2030-12-31',verificaciones:[]}]:[],school:{students:[],registry:{clients:kind==='client'?[{id:'c1',name:'Before',email:user.email,flights:[],payments:[]}]:[]}}};const out=apply(data,user,{name:'After',phone:'TEST-CONTACT',photo:''});const person=kind==='pilot'?out.data.pilotos[0]:out.data.school.registry.clients[0];assert.equal(person[kind==='pilot'?'nombre':'name'],'After');assert.equal(person[kind==='pilot'?'celular':'phone'],'TEST-CONTACT');if(kind==='pilot')assert.equal(person.medico,'2030-12-31');else assert.deepEqual(person.payments,[]);}
});
test('A verified email change keeps the prior linked record and rejects collisions',()=>{
 const account={verified:true,email:user.email,recordId:'own',recordKind:'student'},nextUser={...user,email:'new@example.test'},data=base();
 const updated=migrateEmail(data,nextUser,account);assert.equal(updated.school.students[0].email,nextUser.email);assert.equal(updated.school.students[0].authUid,user.uid);assert.deepEqual(updated.school.students[1],data.school.students[1]);
 assert.equal(migrateEmail(data,{...nextUser,emailVerified:false},account),null);
 assert.throws(()=>migrateEmail(data,{...nextUser,email:'other@example.test'},account));
 data.school.students[0].authUid='different';assert.equal(migrateEmail(data,nextUser,account),null);
});
