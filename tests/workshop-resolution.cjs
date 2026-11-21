'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(require('node:path').join(__dirname,'../dashboard.js'),'utf8');
const start=source.indexOf('async function resolverTarea(');
const end=source.indexOf('\nfunction renderBitacora(',start);
const handler=source.slice(start,end);
async function run(saveOK){
 const state=[{mantenimiento:[{nombre:'Revisar freno',resuelto:false,piezas:[]}]}];
 let saveCalls=0,legacySaveCalls=0,maintenanceRenders=0,logRenders=0;
 const messages={};
 const context={state,fleet:[{reg:'HP1819'}],aircraftDirty:new Set(),structuredClone,Date,
   window:{DraftRecovery:{capture(){},clear:async()=>{}}},
   panamaISO:()=> '2026-11-18',fechaVista:s=>s,
   saveData:async(reg,data)=>{saveCalls++;assert.equal(reg,'HP1819');assert.equal(data.mantenimiento[0].resuelto,true);return saveOK;},
   savePanel:async()=>{legacySaveCalls++;return false;},
   refreshPanel(){},renderMaintList(){maintenanceRenders++;},renderBitacora(){logRenders++;},
   updateUndoButtons(){},updateSummary(){},setTimeout(){},
   document:{getElementById(id){return messages[id]||= {textContent:'',style:{}};}}
 };
 vm.runInNewContext(handler,context);
 const result=await context.resolverTarea(0,0);
 return {result,state:state[0].mantenimiento[0],saveCalls,legacySaveCalls,maintenanceRenders,logRenders,message:messages['save-msg-0'].textContent};
}
(async()=>{
 const saved=await run(true);
 assert.equal(saved.result,true);assert.equal(saved.state.resuelto,true);assert.equal(saved.saveCalls,1);assert.equal(saved.legacySaveCalls,0);
 assert.equal(saved.maintenanceRenders,1);assert.equal(saved.logRenders,1);assert.equal(saved.message,'✓ Guardado');
 const failed=await run(false);
 assert.equal(failed.result,false);assert.equal(failed.state.resuelto,false);assert.equal(failed.saveCalls,1);assert.equal(failed.maintenanceRenders,0);assert.equal(failed.message,'✗ Error al guardar');
 console.log('PASS: workshop resolution saves directly and restores the task when saving fails');
})().catch(error=>{console.error(error);process.exitCode=1;});
