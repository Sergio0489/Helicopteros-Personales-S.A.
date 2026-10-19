'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../functions/school-certificates');
const {boxView}=require('../functions/box-view'),{applyChanges}=require('../functions/box-write');
const at='2026-10-19';
const offset=days=>new Date(Date.parse(at+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const account={uid:'test-manager',role:'Gerente',assignedAt:'test'};
const policy=edit=>({escuela:{actions:{view:true,edit},boxes:{information:{view:true,edit:false},certificates:{view:true,edit}}}});
const fixture=()=>({fleet:{},pilotos:[],itinerarios:[],school:{certificates:{exploitation:{expiresOn:offset(90)},operation:{expiresOn:offset(60)},simulator:{expiresOn:offset(-1)}},students:[{id:'private-student',name:'Synthetic student'}],registry:{clients:[{id:'private-client',name:'Synthetic client'}]},rates:{Simulador:{cents:9000}}}});
test('school certificates: 90/60/day-of-expiry boundaries and empty/invalid dates',()=>{
 for(const [days,level]of [[91,'ok'],[90,'warn'],[61,'warn'],[60,'orange'],[1,'orange'],[0,'orange'],[-1,'danger']])assert.deepEqual({...model.status(offset(days),at),label:undefined},{days,level,label:undefined});
 assert.equal(model.status('',at).level,'empty');
 for(const value of ['2026-02-29','2026-13-01','19/10/2026','invalid'])assert.equal(model.status(value,at).level,'invalid');
 assert(Number.isFinite(model.day('2028-02-29')));
 assert.equal(model.today(Date.parse('2026-10-20T04:59:59Z')),at);
 assert.equal(model.today(Date.parse('2026-10-20T05:00:00Z')),'2026-10-20');
});
test('school certificate save preserves other certificates and unrelated records',()=>{
 const current=fixture(),before=boxView(current,account,policy(true),'escuela').data,after=structuredClone(before);
 after.school.certificates.operation.expiresOn=offset(120);
 const result=applyChanges(current,before,after,policy(true),account);
 const expected=structuredClone(current);expected.school.certificates.operation.expiresOn=offset(120);
 assert.deepEqual(result.data,expected);assert.equal(result.writes,1);
 assert.deepEqual(model.alerts(result.data.school.certificates,at).map(c=>c.id),['exploitation','simulator']);
});
test('certificate permissions prevent reads and writes outside the authorized box',()=>{
 const current=fixture(),readOnly=policy(false),view=boxView(current,account,readOnly,'escuela');
 assert.equal(view.editable,false);assert.deepEqual(view.data.school.certificates,current.school.certificates);
 assert.equal(JSON.stringify(view.data).includes('private-student'),false);
 const after=structuredClone(view.data);after.school.certificates.simulator.expiresOn='';
 assert.throws(()=>applyChanges(current,view.data,after,readOnly,account),/Sin permiso/);
 const noCertificates=policy(false);noCertificates.escuela.boxes.certificates.view=false;
 assert.equal(boxView(current,account,noCertificates,'escuela').data.school.certificates,undefined);
 const pendingPolicy={pendientes:{actions:{view:true},boxes:{school:{view:true}}}};
 const pending=boxView(current,account,pendingPolicy,'pendientes');
 assert.deepEqual(pending.data.school.certificates,current.school.certificates);assert.equal(pending.notice,null);
 assert.equal(JSON.stringify(pending.data).includes('private-client'),false);
});
test('server rejects invalid certificate dates and unknown certificate fields',()=>{
 const current=fixture();
 for(const value of ['2026-02-30','tomorrow',null]){
  const after=structuredClone(current);after.school.certificates.operation.expiresOn=value;
  assert.throws(()=>applyChanges(current,current,after,policy(true),account),/fecha/);
 }
 const after=structuredClone(current);after.school.certificates.operation.extra='unauthorized';
 assert.throws(()=>applyChanges(current,current,after,policy(true),account),/no válido/);
});
