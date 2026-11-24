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
 assert.equal(elements.get('tac-hobbs-actual-0').readOnly,false);
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

test('HP880BL allows manual Hobbs or HV edits and keeps the two values linked',()=>{
 const {elements,context}=harness();
 elements.get('tac-left-anterior-0').value='500.00';elements.get('tac-left-actual-0').value='501.25';
 elements.get('tac-right-anterior-0').value='800.00';elements.get('tac-right-actual-0').value='802.50';
 elements.get('tac-hobbs-anterior-0').value='1000.00';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1002.50');
 elements.get('tac-hobbs-actual-0').value='1002.75';
 vm.runInContext("updateTAC(0,'hobbs')",context);
 assert.equal(elements.get('horas_diarias-0').value,'2.75');
 assert.equal(elements.get('horas-venc-dia-0').value,'2.75');
 elements.get('horas_diarias-0').value='3.25';
 vm.runInContext("updateTAC(0,'horas_diarias')",context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1003.25');
 assert.equal(elements.get('horas_diarias-0').value,'3.25');
 assert.equal(elements.get('horas-venc-dia-0').value,'3.25');
 assert.equal(elements.get('horas_diarias-0').readOnly,false);
 assert.match(dashboard,/delta=dualInputs\.readings\.hobbs\.delta/,'the saved flight HV comes from Hobbs actual minus Hobbs previous');
 elements.get('horas-venc-dia-0').value='0';
 vm.runInContext("updateTAC(0,'horas-venc-dia')",context);
 assert.match(elements.get('tac-msg-0').textContent,/HV del día debe ser mayor que cero/);
 elements.get('tac-right-actual-0').value='804.00';
 vm.runInContext("updateTAC(0,'engine')",context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1004.00');
 assert.equal(elements.get('horas_diarias-0').value,'4.00');
});

test('HP880BL blocks calculation and identifies an engine TAC that is not greater than its previous reading',()=>{
 const {elements,context}=harness();
 elements.get('tac-left-anterior-0').value='5552.83';elements.get('tac-left-actual-0').value='5563.82';
 elements.get('tac-right-anterior-0').value='5662.41';elements.get('tac-right-actual-0').value='5573.37';
 elements.get('tac-hobbs-anterior-0').value='1845.10';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'');
 assert.equal(elements.get('horas_diarias-0').value,'');
 assert.match(elements.get('tac-msg-0').textContent,/TAC motor derecho.*el TAC actual \(5573\.37\) debe ser mayor al anterior \(5662\.41\)/);
 assert.match(elements.get('tac-msg-0').textContent,/No se calculan Hobbs ni HV/);
 assert.match(dashboard,/if\(dualInputs\.any&&!dualInputs\.complete\).*return false;/s,'saving stays blocked until every engine TAC is valid');
 elements.get('tac-right-actual-0').value='5673.37';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'1856.09');
 assert.equal(elements.get('horas_diarias-0').value,'10.99');
 assert.equal((Number(elements.get('tac-hobbs-actual-0').value)-Number(elements.get('tac-hobbs-anterior-0').value)).toFixed(2),elements.get('horas_diarias-0').value,'daily HV is Hobbs actual minus Hobbs previous');
 assert.match(elements.get('tac-msg-0').textContent,/Diferencia izquierda: 10\.99 h · diferencia derecha: 10\.96 h/);
 assert.doesNotMatch(elements.get('tac-msg-0').textContent,/corrige|mayor al anterior/);
 elements.get('tac-left-actual-0').value='5552.83';
 vm.runInContext('updateTAC(0)',context);
 assert.equal(elements.get('tac-hobbs-actual-0').value,'');
 assert.equal(elements.get('horas_diarias-0').value,'');
 assert.match(elements.get('tac-msg-0').textContent,/TAC motor izquierdo.*debe ser mayor al anterior/);
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
 assert.equal(elements.get('tac-hobbs-actual-0').readOnly,false);
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
