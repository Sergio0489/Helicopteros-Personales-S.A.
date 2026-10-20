'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dashboard.js'),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function setup(reg='HP-18BLM'){
 const container={innerHTML:''},context={state:[{}],fleet:[{reg}],pilotosData:[],window:{},previewData:{},document:{getElementById:()=>container},emergencyAlerts:()=>[],comparePendingAlerts:()=>0,escapeRecord:String,panamaISO:()=> '2026-10-20'};
 vm.createContext(context);
 vm.runInContext([
 between('function isMultimotor(','// ===== DRAWER'),
 between('const VENC_FIELD_MAP =','function getLimite('),
 between('function vencHoursLevel(','function updateVencBar('),
 between('function vencimientoComponents(','function appendVencimientoRecord('),
 between('function buildResumen()','function resolverMotor(').split('\nfunction resolver')[0],
 between('function getAircraftWarnings(','function timesToMinutes(')
 ].join('\n'),context);
 return {context,container};
}
test('HP18BLM respects configured limits in Pendientes, bars and flight warnings',()=>{
 const {context:c,container}=setup();
 c.state[0]={ciclos_totales:1900,limite_motor:3600,ciclos_limite:1950,limite_helice:3600};
 c.buildResumen();assert.match(container.innerHTML,/Sin tareas/);assert.equal(c.vencBarCls(1900,3600),'fill-ok');assert.equal(c.getAircraftWarnings('HP-18BLM').length,0);
 for(const [value,level]of [[2879.99,'ok'],[2880,'warn'],[3600,'danger'],[3601,'danger']]){
  c.state[0].ciclos_totales=value;c.buildResumen();
  assert.equal(c.vencBarCls(value,3600),'fill-'+level);
  const alerts=c.getAircraftWarnings('HP-18BLM');assert.equal(alerts.length,level==='ok'?0:1);
  if(level!=='ok'){assert.equal(alerts[0].level,level);assert.match(container.innerHTML,/Motor izquierdo/);assert.match(container.innerHTML,level==='warn'?/var\(--warn\)/:/var\(--danger\)/);}
 }
});
test('Every multimotor includes both propellers with their own limits; missing limits are not guessed',()=>{
 for(const reg of ['HP-18BLM','HP-880BL','HP-1805BLM','HP1186']){
  const {context:c,container}=setup(reg);
  c.state[0]={ciclos_totales:2200,limite_motor:'',helice1_ciclos:1920,helice1_limite:2400,helice2_ciclos:3000,helice2_limite:3000};
  c.buildResumen();assert.match(container.innerHTML,/Hélice izquierda/);assert.match(container.innerHTML,/Hélice derecha/);assert.doesNotMatch(container.innerHTML,/Motor izquierdo/);
  assert.equal(c.getAircraftWarnings(reg).length,2);assert.equal(c.vencBarCls(2200,''),'fill-empty');
 }
 const {context:c}=setup('HP1784');c.state[0]={ciclos_totales:2000,limite_motor:2500,ciclos_limite:2400,limite_helice:2400,helice1_ciclos:9000,helice1_limite:2000};
 assert.equal(c.aircraftHourAlerts('HP1784',c.state[0]).length,2);
 for(const value of ['',null,undefined,'bad'])assert.equal(c.vencBarCls(value,2400),'fill-empty');
 assert.equal(c.vencBarCls(0,2400),'fill-ok');assert.match(c.vencBarLabel(0,2400),/2400.00/);
});
