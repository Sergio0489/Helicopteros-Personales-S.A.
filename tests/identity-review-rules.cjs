'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rules=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../database.rules.json'),'utf8')).rules;
const expression=rules.dashboard['.read'],owner=/auth\.uid === '([^']+)'/.exec(expression)[1];
class RuleNode{
 constructor(value){this.value=value;}
 child(key){return new RuleNode(String(key).split('/').filter(Boolean).reduce((value,part)=>value?.[part],this.value));}
 val(){return this.value??null;}
 exists(){return this.value!==undefined&&this.value!==null;}
 isString(){return typeof this.value==='string';}
}
function read(account,uid='director-fixture',verified=true){
 return vm.runInNewContext(expression,{auth:uid?{uid,token:{email_verified:verified}}:null,root:new RuleNode({accountRequests:{[uid]:account}})});
}
test('direct dashboard reads reject pending or duplicate identities, including the existing owner UID',()=>{
 for(const uid of ['director-fixture',owner])for(const flags of [
  {identityReviewPending:true,syncStatus:'matched'},
  {identityReviewPending:false,syncStatus:'duplicate-identity'},
  {identityReviewPending:true,syncStatus:'duplicate-identity'}
 ]){
  const account={role:'Director',assignedAt:'fixture-confirmed',...flags};
  assert.equal(read(account,uid),false,uid+' '+JSON.stringify(flags));
 }
});
test('direct dashboard rules preserve verified Directors, role isolation and existing owner authority when no review is pending',()=>{
 const director={role:'Director',assignedAt:'fixture-confirmed',identityReviewPending:false,syncStatus:'matched'};
 assert.equal(read(director),true);assert.equal(read({role:'Director',assignedAt:'fixture-confirmed'}),true);
 assert.equal(read(director,'director-fixture',false),false);
 for(const role of ['Administrativo','Gerente','Piloto','Estudiante','Mecánico','Contabilidad'])assert.equal(read({...director,role}),false);
 assert.equal(read({...director,assignedAt:null}),false);assert.equal(read(director,null),false);
 assert.equal(read(undefined,owner),true,'the existing owner exception is retained behind the review gate');
});
test('malformed review flags fail closed while absent or false flags keep the prior read policy',()=>{
 for(const identityReviewPending of ['true','false',0,'',{}])assert.equal(read({role:'Director',assignedAt:'fixture-confirmed',identityReviewPending}),false);
 for(const identityReviewPending of [false,null,undefined])assert.equal(read({role:'Director',assignedAt:'fixture-confirmed',identityReviewPending}),true);
});
test('direct client writes and private account/audit reads remain denied',()=>{
 assert.equal(rules['.read'],false);assert.equal(rules['.write'],false);assert.equal(rules.dashboard['.write'],false);
 assert.equal(rules.auditIndex['.read'],false);assert.equal(rules.auditDetails['.read'],false);assert.equal(rules.accountRequests,undefined);
});
