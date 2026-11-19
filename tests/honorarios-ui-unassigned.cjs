'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','honorarios-ui.js'),'utf8');
const panel={classList:{contains:()=>false,add(){},remove(){}},_html:'',buttons:[],
 set innerHTML(value){this._html=value;this.buttons=[...value.matchAll(/data-pilot="([^"]+)"/g)].map(match=>({dataset:{pilot:match[1]},onclick:null}));},
 get innerHTML(){return this._html;},
 querySelector(selector){return selector==='[data-honorarios-date]'?{onchange:null}:null;},
 querySelectorAll(selector){return selector==='[data-pilot]'?this.buttons:[];}
};
const sidebar={children:[],appendChild(node){this.children.push(node);}};
const content={appendChild(){}};
let createdDivs=0;
const document={
 head:{appendChild(){}},
 body:{classList:{add(){},remove(){}}},
 getElementById(id){return id==='sidebar-tabs'?sidebar:id==='content-area'?content:null;},
 createElement(tag){
  if(tag==='style')return {textContent:''};
  createdDivs++;
  return createdDivs===1?panel:{classList:{add(){},remove(){}},innerHTML:'',onclick:null};
 },
 querySelectorAll(){return [];}
};
const report={
 period:{label:'11 al 25 de noviembre',start:'2026-11-11',end:'2026-11-25'},
 rates:{},
 pilots:[],
 rows:[{id:'unassigned-ledger',pilotId:'',pilot:'Mismo Nombre',date:'2026-11-18',aircraft:'HP1784',kind:'flight',flightHours100:200,totalCents:6000,book:'M-1',personName:'Cliente ficticio'}]
};
const window={
 ROLE_VIEW:{pages:[{id:'honorarios'}]},
 schoolRequest:async(action)=>{assert.equal(action,'honorarios-read');return {report,canEditRates:false};}
};
class MutationObserver{observe(){}}
vm.runInNewContext(source,{window,document,MutationObserver,console});

(async()=>{
 window.HonorariosUI.install();
 await window.HonorariosUI.load();
 assert.match(panel.innerHTML,/Registros sin asignar/);
 assert.match(panel.innerHTML,/data-pilot="__unassigned__"/);
 assert.doesNotMatch(panel.innerHTML,/No hay pilotos disponibles/);
 const category=panel.buttons.find(button=>button.dataset.pilot==='__unassigned__');
 assert(category,'unassigned history has its own selectable report category');
 category.onclick();
 assert.match(panel.innerHTML,/REGISTROS DE HONORARIOS SIN ASIGNAR/);
 assert.match(panel.innerHTML,/Sin confirmar; requiere revisión/);
 assert.match(panel.innerHTML,/NOMBRE EN REGISTRO \(NO VERIFICADO\)/);
 assert.match(panel.innerHTML,/Mismo Nombre/);
 assert.doesNotMatch(panel.innerHTML,/NOMBRE DEL CAPITÁN/);
 console.log('PASS Honorarios interface exposes ambiguous earnings as unassigned without presenting them as a pilot statement');
})().catch(error=>{console.error(error);process.exit(1);});
