'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const History=require('../functions/inspection-history');
const {protect}=require('../functions/inspection-resets');
const {protectDeletion}=require('../functions/inspection-records');

function clone(value){return structuredClone(value);}
function resetEvent(overrides={}){return {id:'fictional-reset',limitHours:50,before:'38.21',after:'0.00',hour_offset:0,effective_hour_offset:0,reason:'Prueba ficticia',createdAt:'2026-11-20T12:00:00.000Z',fecha:'20/11/2026',hora:'7:00 a. m.',...overrides};}
function aircraft(overrides={}){return {horas_acum_50:'0.00',horas_totales:'0.00',horas_acum_100:'0.00',horas_limite:'0.00',proxima_inspeccion:'',bitacora_horas:[],bitacora_inspecciones:[],bitacora_reinicios_inspeccion:[],...overrides};}
function deleteInspection(before,recordIndex){
 const expected=clone(before),record=expected.bitacora_inspecciones[recordIndex];
 expected.bitacora_inspecciones.splice(recordIndex,1);expected.proxima_inspeccion=expected.bitacora_inspecciones.length?String(expected.bitacora_inspecciones.at(-1).proxima??''):'';
 History.rebuild(expected,{anchors:[{record,index:recordIndex}]});return expected;
}

 test('Director reset guard receives the role and changes only the selected inspection bar',()=>{
 const oldAircraft=aircraft({horas_acum_50:'38.21',horas_totales:'38.21',horas_acum_100:'70.00',horas_limite:'70.00'});
 const next=clone(oldAircraft);next.horas_acum_50='0.00';next.horas_totales='0.00';next.bitacora_reinicios_inspeccion.push(resetEvent());
 assert.throws(()=>protect({fleet:{0:oldAircraft}},{fleet:{0:next}}),/Solo el Director/);
 assert.doesNotThrow(()=>protect({fleet:{0:oldAircraft}},{fleet:{0:next}},{role:'Director'}));
});

test('changing the first inspection to 50 hours preserves the 100-hour starting balance',()=>{
 const data=aircraft({horas_acum_50:'0.00',horas_acum_100:'60.00',bitacora_horas:[{hv:'10.00',acum:'70.00'}],bitacora_inspecciones:[{fecha:'01/11/2026',hora:'7:00 a. m.',tipo:50,proxima:100,hour_offset:1,before50:'60.00',before100:'60.00'}]});
 History.rebuild(data);
 assert.equal(data.horas_acum_100,'60.00');assert.equal(data.horas_limite,'60.00');assert.equal(data.bitacora_inspecciones[0].before100,'60.00');
});

test('deleting an earlier inspection refreshes later snapshots; deleting the next one restores 55 hours',()=>{
 const a={fecha:'01/11/2026',hora:'7:00 a. m.',tipo:100,proxima:50,hour_offset:1,before50:'40.00',before100:'40.00'};
 const b={fecha:'02/11/2026',hora:'8:00 a. m.',tipo:100,proxima:50,hour_offset:2,before50:'10.00',before100:'10.00'};
 const before=aircraft({horas_acum_50:'5.00',horas_totales:'5.00',horas_acum_100:'5.00',horas_limite:'5.00',proxima_inspeccion:'50',bitacora_inspecciones:[a,b],bitacora_horas:[{hv:'40.00',acum:'40.00'},{hv:'10.00',acum:'10.00'},{hv:'5.00',acum:'5.00'}]});
 const afterA=deleteInspection(before,0);
 assert.equal(afterA.bitacora_inspecciones[0].before50,'50.00');assert.equal(afterA.bitacora_inspecciones[0].before100,'50.00');assert.equal(afterA.bitacora_horas[1].acum,'50.00');
 assert.doesNotThrow(()=>protectDeletion({fleet:{0:before}},{fleet:{0:afterA}},{role:'Director',reason:'Prueba ficticia'}));
 const stale=clone(afterA);stale.bitacora_inspecciones[0].before50='10.00';stale.bitacora_inspecciones[0].before100='10.00';
 assert.throws(()=>protectDeletion({fleet:{0:before}},{fleet:{0:stale}},{role:'Director',reason:'Prueba ficticia'}),/recalcularse/);
 const afterB=deleteInspection(afterA,0);
 assert.equal(afterB.horas_acum_50,'55.00');assert.equal(afterB.horas_acum_100,'55.00');assert.equal(afterB.bitacora_horas[2].acum,'55.00');
 assert.doesNotThrow(()=>protectDeletion({fleet:{0:afterA}},{fleet:{0:afterB}},{role:'Director',reason:'Prueba ficticia'}));
});

test('a TAC correction updates later inspection baselines and cumulative rows',()=>{
 const a={fecha:'01/11/2026',hora:'7:00 a. m.',tipo:100,proxima:50,hour_offset:1,before50:'40.00',before100:'40.00'};
 const b={fecha:'02/11/2026',hora:'8:00 a. m.',tipo:100,proxima:50,hour_offset:2,before50:'10.00',before100:'10.00'};
 const data=aircraft({horas_acum_50:'5.00',horas_totales:'5.00',horas_acum_100:'5.00',horas_limite:'5.00',bitacora_inspecciones:[a,b],bitacora_horas:[{hv:'40.00',acum:'40.00'},{hv:'10.00',acum:'10.00'},{hv:'5.00',acum:'5.00'}]});
 History.shiftInspectionSnapshots(data,1,2);data.bitacora_horas[1].hv='12.00';data.bitacora_horas[1].acum='12.00';History.rebuild(data);
 assert.equal(data.bitacora_inspecciones[1].before50,'12.00');assert.equal(data.bitacora_inspecciones[1].before100,'12.00');assert.equal(data.horas_acum_50,'5.00');assert.equal(data.horas_acum_100,'5.00');
 const downward=clone(data);History.shiftInspectionSnapshots(downward,1,-4);downward.bitacora_horas[1].hv='8.00';downward.bitacora_horas[1].acum='8.00';History.rebuild(downward);assert.equal(downward.bitacora_inspecciones[1].before100,'8.00');
});

test('deleting a flight before a manual reset shifts only the effective boundary',()=>{
 const event=resetEvent({hour_offset:1,effective_hour_offset:1});
 const before=aircraft({horas_acum_100:'10.00',horas_limite:'10.00',bitacora_reinicios_inspeccion:[event],bitacora_horas:[{registryId:'flight-a',hv:'10.00',acum:'10.00'}]});
 const after=clone(before);after.bitacora_horas=[];after.bitacora_reinicios_inspeccion[0].effective_hour_offset=0;after.horas_acum_100='0.00';after.horas_limite='0.00';History.rebuild(after);
 assert.equal(History.findDeletedLogIndex(before.bitacora_horas,after.bitacora_horas),0);
 assert.doesNotThrow(()=>protect({fleet:{0:before}},{fleet:{0:after}},{role:'Director'}));
 const forgedWithoutDeletion=clone(before);forgedWithoutDeletion.bitacora_reinicios_inspeccion[0].effective_hour_offset=0;
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:forgedWithoutDeletion}},{role:'Piloto'}),/posición del reinicio/);
 const forged=clone(after);forged.bitacora_reinicios_inspeccion[0].effective_hour_offset=4;
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:forged}},{role:'Director'}),/historial de inspecciones|posición del reinicio/);
});

test('server verifies recalculated counters after historical flight edits and deletions',()=>{
 const before=aircraft({horas_acum_50:'130.00',horas_totales:'130.00',horas_acum_100:'130.00',horas_limite:'130.00',bitacora_horas:[{registryId:'flight-a',hv:'10.00',acum:'110.00'},{registryId:'flight-b',hv:'20.00',acum:'130.00'}]});
 const edited=clone(before);edited.bitacora_horas[0].hv='15.00';edited.horas_acum_50='135.00';edited.horas_totales='135.00';edited.horas_acum_100='135.00';edited.horas_limite='135.00';History.rebuild(edited);
 assert.equal(edited.horas_acum_50,'135.00');assert.doesNotThrow(()=>protect({fleet:{0:before}},{fleet:{0:edited}},{role:'Director'}));
 const staleEdit=clone(edited);staleEdit.horas_acum_50='130.00';staleEdit.horas_totales='130.00';staleEdit.horas_acum_100='130.00';staleEdit.horas_limite='130.00';
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:staleEdit}},{role:'Director'}),/acumulados de inspección/);
 const deleted=clone(before);deleted.bitacora_horas.splice(0,1);deleted.horas_acum_50='120.00';deleted.horas_totales='120.00';deleted.horas_acum_100='120.00';deleted.horas_limite='120.00';History.rebuild(deleted);
 assert.equal(deleted.horas_acum_50,'120.00');assert.doesNotThrow(()=>protect({fleet:{0:before}},{fleet:{0:deleted}},{role:'Director'}));
 const staleDelete=clone(deleted);staleDelete.horas_acum_50='130.00';staleDelete.horas_totales='130.00';staleDelete.horas_acum_100='130.00';staleDelete.horas_limite='130.00';
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:staleDelete}},{role:'Director'}),/acumulados de inspección/);
});

test('deleting an earlier flight updates later inspection snapshots before the server accepts it',()=>{
 const inspection={fecha:'02/11/2026',hora:'8:00 a. m.',tipo:100,proxima:50,hour_offset:2,before50:'30.00',before100:'30.00'};
 const before=aircraft({bitacora_inspecciones:[inspection],bitacora_horas:[{registryId:'flight-a',hv:'10.00',acum:'10.00'},{registryId:'flight-b',hv:'20.00',acum:'30.00'}]});
 const after=clone(before);History.shiftInspectionSnapshots(after,0,-10);after.bitacora_inspecciones[0].hour_offset=1;after.bitacora_horas.splice(0,1);History.rebuild(after);
 assert.equal(after.bitacora_inspecciones[0].before50,'20.00');assert.equal(after.bitacora_inspecciones[0].before100,'20.00');
 assert.doesNotThrow(()=>protect({fleet:{0:before}},{fleet:{0:after}},{role:'Director'}));
 const stale=clone(after);stale.bitacora_inspecciones[0].before50='30.00';stale.bitacora_inspecciones[0].before100='30.00';
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:stale}},{role:'Director'}),/historial de inspecciones/);
});

test('HP880BL historical dual-TAC editing applies maintenance and component deltas once',()=>{
 const source=fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
 assert.match(source,/adjustRecordedHours\(d,r,maintenanceChange,\{adjustComponents:false\}\)/);
 assert.match(source,/adjustDualAircraftComponents\(d,\(next\.left\.hours-old\.left\.hours\)\/100,\(next\.right\.hours-old\.right\.hours\)\/100\)/);
 const endpoint=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');assert.match(endpoint,/inspection-resets'\)\.protect\(before,data,\{role:'Director'\}\)/);
});
