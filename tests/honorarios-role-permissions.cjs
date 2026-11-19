'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const boxes=require('../functions/boxes');
const honorariosService=require('../functions/honorarios-service');

const source=fs.readFileSync(require.resolve('../cloud.js'),'utf8');
const start=source.indexOf('const ROLE_ACTIONS=');
const end=source.indexOf('function saveRoleConfiguration');
assert(start>=0&&end>start,'role permission helpers must remain available in cloud.js');
const roleContext={STAFF_ROLES:['Director','Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad']};
vm.createContext(roleContext);
vm.runInContext(source.slice(start,end)+'\nglobalThis.roleHelpers={suggestedRolePolicy,normalizeRolePolicy,ROLE_PAGES};',roleContext);
const roleHelpers=roleContext.roleHelpers;

function dashboard(){
 const data={
  pilotos:[{id:'p1',nombre:'Piloto Alfa Ficticio',numeroLicencia:'TEST-A'},{id:'p2',nombre:'Piloto Beta Ficticio',numeroLicencia:'TEST-B'}],
  school:{students:[],registry:{entries:[]},honorarios:{records:[
   {id:'r1',entryId:'e1',pilotId:'p1',pilot:'Piloto Alfa Ficticio',date:'2026-11-18',aircraft:'HP1784',kind:'flight',flightRateCents:3000,flightPayCents:3000,flightHours100:100,totalCents:3000},
   {id:'r2',entryId:'e2',pilotId:'p2',pilot:'Piloto Beta Ficticio',date:'2026-11-18',aircraft:'HP1819',kind:'flight',flightRateCents:3000,flightPayCents:6000,flightHours100:200,totalCents:6000}
  ]}}
 };
 return {operation:'op-test',revision:1,payload:JSON.stringify(data)};
}
const db={ref:()=>({get:async()=>({val:()=>dashboard()})})};
const context=(role,extra={})=>({
 user:{uid:'user-'+role.toLowerCase(),email:role.toLowerCase()+'@example.test',emailVerified:true,disabled:false},
 account:{role,assignedAt:'confirmed',...extra},
 director:role==='Director'
});

test('Honorarios report remains read-only and printing needs an explicit report grant',()=>{
 const report=boxes.catalog.honorarios.find(box=>box.id==='report');
 assert.equal(report.editable,false);
 assert.deepEqual(report.outputs,['print']);
 const viewOnly={honorarios:{actions:{view:true},areas:{'Honorarios de pilotos':true},boxes:{report:{view:true,edit:false}}}};
 const policy=boxes.normalize(viewOnly);
 assert(boxes.permissions(policy,'honorarios','report').view);
 assert.equal(boxes.permissions(policy,'honorarios','report').edit,false);
 assert.equal(boxes.outputAllowed(policy,'honorarios','report','print'),false);

 const explicit={honorarios:{actions:{view:true,print:true},areas:{'Honorarios de pilotos':true},boxes:{report:{view:true,edit:false,print:true}}}};
 assert(boxes.outputAllowed(boxes.normalize(explicit),'honorarios','report','print'));
 explicit.honorarios.boxes.report.view=false;
 assert.equal(boxes.outputAllowed(boxes.normalize(explicit),'honorarios','report','print'),false);
});

test('role suggestions do not silently grant Honorarios printing; Director can enable it explicitly',()=>{
 const pages=roleHelpers.ROLE_PAGES;
 assert(pages.find(page=>page.id==='honorarios').actions.includes('print'));
 for(const role of ['Gerente','Contabilidad','Piloto']){
  const suggestion=roleHelpers.suggestedRolePolicy(role);
  assert.equal(suggestion.honorarios.actions.view,true);
  assert.equal(suggestion.honorarios.actions.print,false);
  const saved=roleHelpers.normalizeRolePolicy(role,suggestion);
  assert.equal(saved.honorarios.boxes.report.view,true);
  assert.equal(saved.honorarios.boxes.report.edit,false);
  assert.equal(saved.honorarios.boxes.report.print,false);
 }
 const gerencia=roleHelpers.suggestedRolePolicy('Gerente');
 gerencia.honorarios.actions.print=true;
 const authorized=roleHelpers.normalizeRolePolicy('Gerente',gerencia);
 assert.equal(authorized.honorarios.boxes.report.print,true);
 assert(boxes.outputAllowed(boxes.normalize(authorized),'honorarios','report','print'));
 const withoutSection=structuredClone(gerencia);
 withoutSection.honorarios.areas['Honorarios de pilotos']=false;
 const denied=roleHelpers.normalizeRolePolicy('Gerente',withoutSection);
 assert.equal(denied.honorarios.boxes.report.view,false);
 assert.equal(denied.honorarios.boxes.report.print,false);
});

test('Director, Gerencia and Contabilidad can read; Pilot remains scoped and unrelated roles are denied',async()=>{
 const manager=await honorariosService.read(db,context('Gerente'),'2026-11-18');
 const accounting=await honorariosService.read(db,context('Contabilidad'),'2026-11-18');
 const director=await honorariosService.read(db,context('Director'),'2026-11-18');
 assert.deepEqual(manager.report.rows.map(row=>row.pilotId),['p1','p2']);
 assert.deepEqual(accounting.report.rows.map(row=>row.pilotId),['p1','p2']);
 assert.equal(manager.canEditRates,false);
 assert.equal(accounting.canEditRates,false);
 assert.equal(director.canEditRates,true);

 const pilot=await honorariosService.read(db,context('Piloto',{syncStatus:'matched',recordKind:'pilot',recordId:'p2'}),'2026-11-18');
 assert.deepEqual(pilot.report.rows.map(row=>row.pilotId),['p2']);
 assert.deepEqual(pilot.report.pilots.map(item=>item.id),['p2']);
 assert.equal(pilot.canEditRates,false);

 for(const role of ['Estudiante','Mecánico','Administrativo']){
  await assert.rejects(()=>honorariosService.read(db,context(role),'2026-11-18'),error=>error.status===403,role+' must not get Honorarios by default');
 }
 await assert.rejects(()=>honorariosService.read(db,context('Gerente',{assignedAt:null}),'2026-11-18'),error=>error.status===403);
 await assert.rejects(()=>honorariosService.read(db,{...context('Gerente'),user:{...context('Gerente').user,emailVerified:false}},'2026-11-18'),error=>error.status===403);

 for(const role of ['Gerente','Contabilidad','Piloto']){
  await assert.rejects(()=>honorariosService.handle(db,context(role),'honorarios-rates-save',{rates:{}}),error=>error.status===403);
 }
});
