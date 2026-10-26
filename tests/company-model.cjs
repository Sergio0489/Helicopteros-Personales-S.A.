'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../functions/company'),S=require('../functions/school-information'),C=require('../functions/school-certificates'),{boxView}=require('../functions/box-view'),{applyChanges}=require('../functions/box-write');
const source=()=>({fleet:{},school:{personnel:[{id:'test-id',name:'Persona de prueba',notes:'Private detail'}],charter:{information:M.value({}),certificates:{operation:{expiresOn:'2026-10-01'}}}}});
test('company validation, stable name references and permission isolation',()=>{
 const data=source();data.school.charter.information.people[1].personRef={kind:'personnel',id:'test-id'};assert.equal(M.project(data).school.charter.information.people[1].name,'Persona de prueba');assert.equal(data.school.charter.information.people[1].name,'Por asignar');
 const policy={charter:{actions:{view:true,edit:true},boxes:{information:{view:true},personnel:{view:true,edit:true},certificates:{view:true}}}},account={role:'Administrativo'};
 const before=boxView(data,account,policy,'charter').data,after=structuredClone(before);after.school.personnel[0].name='Nuevo nombre';const result=applyChanges(data,before,after,policy,account).data;assert.equal(result.school.personnel[0].name,'Nuevo nombre');assert.deepEqual(result.school.charter,data.school.charter);
 for(const mutate of [v=>v.school.charter.information.people[1].role='Forbidden',v=>v.school.charter.certificates.operation.expiresOn='',v=>v.school.personnel[0].authUid='invalid',v=>v.school.personnel[0].birthDate='2026-02-30',v=>v.school.personnel[0].medico='2029-12']){const next=structuredClone(before);mutate(next);assert.throws(()=>applyChanges(data,before,next,policy,account));}
 const datesOnly={charter:{actions:{view:true,edit:true},boxes:{certificates:{view:true,edit:true}}}};const view=boxView(data,account,datesOnly,'charter');assert.equal(view.data.school.personnel,undefined);assert.equal(view.data.school.charter.information.people,undefined);
 const pending=boxView(data,account,{pendientes:{actions:{view:true},boxes:{charter:{view:true}}}},'pendientes');assert.equal(pending.data.school.personnel,undefined);assert.equal(pending.data.school.charter.information.people,undefined);assert.equal(C.alerts(pending.data.school.charter.certificates,'2026-10-20',pending.data.school.charter.information).length,1);
});
test('deleting the last school certificate is durable and does not resurrect default alerts',()=>{
 const before={school:{information:S.value({}),certificates:{operation:{expiresOn:'2020-01-01'}}}},after=structuredClone(before);after.school.information.certificates=[];after.school.information.certificatesEmpty=true;after.school.certificates={};S.validateChanges(before,after);C.validateChanges(before,after);delete after.school.information.certificates;assert.deepEqual(S.value(after.school).certificates,[]);assert.deepEqual(C.alerts(after.school.certificates,'2026-10-20',after.school.information),[]);
});

test('Organization selects a unified person once and resolves every historical reference',()=>{
 const company=require('../functions/company');
 const data={pilotos:[{id:'p',nombre:'Example'}],school:{personnel:[{id:'h',name:'Example'}],students:[{id:'s',name:'Example'},{id:'different',name:'Example'}],identityLinks:{person:{records:[{kind:'pilot',id:'p'},{kind:'personnel',id:'h'},{kind:'student',id:'s'}]}}}};
 const list=company.people(data);assert.equal(list.length,2);assert.equal(list.find(x=>x.id==='h').aliases.length,3);
 for(const kind of ['pilot','student','personnel'])assert.equal(company.resolve({personRef:{kind,id:{pilot:'p',student:'s',personnel:'h'}[kind]},name:'Old'},data),'Example');
});
