'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const dashboard=fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
const dualStart=dashboard.indexOf('function isDualTAC(');
const dualEnd=dashboard.indexOf('function hasDualTACLog(',dualStart);
const tacStart=dashboard.indexOf('function tacCents(');
const tacEnd=dashboard.indexOf('function escapeRecord(',tacStart);
assert.ok(dualStart>=0&&dualEnd>dualStart&&tacStart>=0&&tacEnd>tacStart,'dual TAC helpers should be present');
const helpers=dashboard.slice(dualStart,dualEnd)+'\n'+dashboard.slice(tacStart,tacEnd);

function field(value=''){return {value,readOnly:false,dataset:{},style:{},setCustomValidity(message){this.validationMessage=message;},reportValidity(){return false;}};}
function harness(reg='HP880BL'){
 const elements=new Map();
 for(const key of ['left','right','hobbs']){elements.set(`tac-${key}-anterior-0`,field());elements.set(`tac-${key}-actual-0`,field());}
 elements.set('tac-msg-0',field());
 elements.set('horas_diarias-0',field('0.00'));
 elements.set('horas-venc-dia-0',field('0.00'));
 const context={fleet:[{reg}],document:{getElementById(id){return elements.get(id)||null;}}};
 vm.createContext(context);vm.runInContext(helpers,context);
 return {elements,context};
}

test('HP880BL uses the higher engine TAC difference for Hobbs actual and daily HV',()=>{
 const {elements,context}=harness();
 elements.get('tac-left-anterior-0').value='500.00';elements.get('tac-left-actual-0').value='501.25';
 elements.get('tac-right-anterior-0').value='800.00';elements.get('tac-right-actual-0').value='802.50';
 elements.get('tac-hobbs-anterior-0').value='1000.00';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1002.50');
 assert.equal(elements.get('tac-hobbs-actual-0').readOnly,true);
 assert.equal(elements.get('horas_diarias-0').value,'2.50');
 assert.equal(elements.get('horas-venc-dia-0').value,'2.50');
 assert.match(elements.get('tac-msg-0').textContent,/TAC motor derecho/);
});

test('HP880BL recalculates if the other engine becomes the larger difference',()=>{
 const {elements,context}=harness();
 elements.get('tac-left-anterior-0').value='500.00';elements.get('tac-left-actual-0').value='502.50';
 elements.get('tac-right-anterior-0').value='800.00';elements.get('tac-right-actual-0').value='801.00';
 elements.get('tac-hobbs-anterior-0').value='1000.00';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1002.50');
 elements.get('tac-right-actual-0').value='803.00';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1003.00');
 assert.equal(elements.get('horas_diarias-0').value,'3.00');
 assert.match(elements.get('tac-msg-0').textContent,/TAC motor derecho/);
});

test('an incomplete or out-of-range HP880BL reading cannot leave a stale Hobbs value',()=>{
 const {elements,context}=harness();
 elements.get('tac-left-anterior-0').value='500.00';elements.get('tac-left-actual-0').value='501.00';
 elements.get('tac-right-anterior-0').value='800.00';elements.get('tac-right-actual-0').value='801.00';
 elements.get('tac-hobbs-anterior-0').value='99999.50';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'');
 assert.match(elements.get('tac-msg-0').textContent,/supera el máximo/);
 elements.get('tac-hobbs-anterior-0').value='1000.00';
 elements.get('tac-right-actual-0').value='';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'');
 assert.equal(elements.get('horas_diarias-0').value,'');
 assert.equal(elements.get('tac-hobbs-actual-0').readOnly,true);
});

test('the automatic Hobbs behavior remains scoped to HP880BL',()=>{
 const {elements,context}=harness('HP1784');
 elements.set('tac-anterior-0',field('10.00'));elements.set('tac-actual-0',field('11.00'));
 elements.get('tac-hobbs-anterior-0').value='1000.00';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'');
 assert.equal(elements.get('horas_diarias-0').value,'1.00');
 assert.equal(elements.get('tac-hobbs-actual-0').readOnly,false);
});
