'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalize}=require('../functions/boxes');
const {boxView}=require('../functions/box-view');
const {applyChanges}=require('../functions/box-write');

const uid='admin-fixture';
const account={uid,role:'Administrativo',assignedAt:'confirmed',recordKind:'personnel',recordId:'staff-own',syncStatus:'matched'};
const rawPolicy={charter:{actions:{view:true,edit:true},boxes:{personnel:{view:true,edit:true}}}};
function data(){return {fleet:{},pilotos:[],school:{personnel:[
 {id:'staff-own',authUid:uid,directoryKind:'personnel',name:'Administrador de prueba',email:'admin@example.test',identity:'ID-ADMIN'},
 {id:'staff-other',authUid:'other-user',directoryKind:'personnel',name:'Otra persona',email:'other@example.test',identity:'ID-OTHER'}
 ],charter:{information:{people:[]}}}};}

test('Administrativo solo recibe y puede editar su propio expediente de personal',()=>{
 const current=data(),policy=normalize(rawPolicy),view=boxView(current,account,policy,'charter');
 assert.deepEqual(view.data.school.personnel.map(p=>p.id),['staff-own']);
 const before=structuredClone(view.data),after=structuredClone(before);after.school.personnel[0].name='Nombre actualizado';
 const saved=applyChanges(current,before,after,policy,account).data;
 assert.equal(saved.school.personnel.find(p=>p.id==='staff-own').name,'Nombre actualizado');
 const maliciousBefore=structuredClone(current),maliciousAfter=structuredClone(current);maliciousAfter.school.personnel[1].name='Intento de cambio';
 assert.throws(()=>applyChanges(current,maliciousBefore,maliciousAfter,policy,account),/Solo puedes consultar o modificar tu propio expediente/);
 const unmatched=boxView(current,{...account,syncStatus:'duplicate-email',recordId:null},policy,'charter');
 assert.deepEqual(unmatched.data.school.personnel||[],[]);
});

test('identity unification keeps one account and preserves student and personnel directory classifications',()=>{
 const root={dashboard:{operation:'before',payload:JSON.stringify({fleet:{},pilotos:[],school:{
  students:[{id:'student-ant',authUid:uid,directoryKind:'student',name:'Antonio Muñoz',email:'antonio@example.test',identity:'ANTONIO-ID',courses:[{id:'course-ant',type:'privado'}]}],
  personnel:[{id:'person-ant',authUid:uid,directoryKind:'personnel',name:'Antonio Muñoz',email:'antonio@example.test',identity:'ANTONIO-ID',position:'Administrativo'}],
  registry:{clients:[{id:'client-ant',authUid:uid,directoryKind:'client',name:'Antonio Muñoz',email:'antonio@example.test',identity:'ANTONIO-ID',flights:[{id:'client-flight-ant',hours:1.5}],payments:[{id:'client-payment-ant',cents:2500}]}]}
 }})},accountRequests:{[uid]:{email:'antonio@example.test',role:'Administrativo',assignedAt:'confirmed',verified:true,profile:{name:'Antonio Muñoz',identity:'ANTONIO-ID'}}}};
 const identities=require('../functions/identity-merge'),group=identities.groups(root)[0];
 assert(group);
 const result=identities.merge(root,group.members.map(m=>m.key),'director','director','2026-11-18T12:00:00Z','personnel:person-ant');
 const saved=JSON.parse(result.root.dashboard.payload);
 assert.equal(result.uid,uid);assert.equal(result.role,'Administrativo');
 assert.equal(saved.school.students[0].directoryKind,'student');assert.equal(saved.school.students[0].authUid,uid);
 assert.equal(saved.school.students[0].courses[0].id,'course-ant');
 assert.equal(saved.school.personnel[0].directoryKind,'personnel');assert.equal(saved.school.personnel[0].authUid,uid);
 assert.equal(saved.school.registry.clients[0].directoryKind,'client');assert.equal(saved.school.registry.clients[0].flights[0].id,'client-flight-ant');assert.equal(saved.school.registry.clients[0].payments[0].id,'client-payment-ant');
 assert.deepEqual(saved.school.userProfiles[uid].dossier,{kind:'personnel',id:'person-ant'});
 assert.equal(Object.keys(result.root.accountRequests).length,1);
 assert.equal(Object.values(saved.school.identityLinks)[0].records.length,3);
 const {nativeView}=require('../functions/native-view'),studentPolicy=normalize({estudiantes:{actions:{view:true},boxes:{personal:{view:true},clients:{view:true}}}});
 const studentPage=nativeView(saved,{uid,role:'Administrativo',recordKind:'personnel',recordId:'person-ant',syncStatus:'matched'},studentPolicy,'estudiantes');
 assert.deepEqual(studentPage.data.school.students.map(p=>p.id),['student-ant']);assert.deepEqual(studentPage.data.school.registry.clients.map(p=>p.id),['client-ant']);
});
