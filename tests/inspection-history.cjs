'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const History=require('../functions/inspection-history');
const {protect}=require('../functions/inspection-resets');
const {protectDeletion}=require('../functions/inspection-records');

function clone(value){return structuredClone(value);}
function resetEvent(overrides={}){return {id:'fictional-reset',limitHours:50,before:'38.21',after:'0.00',hour_offset:0,effective_hour_offset:0,reason:'Prueba ficticia',createdAt:'2026-11-20T12:00:00.000Z',fecha:'20/11/2026',hora:'7:00 a. m.',...overrides};}
function aircraft(overrides={}){return {horas_acum_50:'0.00',horas_totales:'0.00',horas_acum_100:'0.00',horas_limite:'0.00',proxima_inspeccion:'',bitacora_horas:[],bitacora_inspecciones:[],bitacora_reinicios_inspeccion:[],bitacora_ajustes_inspeccion:[],...overrides};}
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

test('HP880BL historical dual-TAC editing passes the aircraft into component adjustment',()=>{
 const source=fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
 assert.match(source,/adjustDualAircraftComponents\(d,\(next\.left\.hours-old\.left\.hours\)\/100-maintenanceChange,/);
 const endpoint=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');assert.match(endpoint,/inspection-resets'\)\.protect\(before,data,\{role:'Director',uid:user.uid/);
});


test('Director manual adjustment is recorded and preserved through a later TAC correction',()=>{
 const before=aircraft({horas_acum_50:'10.00',horas_totales:'10.00',horas_acum_100:'10.00',horas_limite:'10.00',bitacora_horas:[{registryId:'fictional-flight-a',hv:'10.00',acum:'10.00'}],bitacora_reinicios_inspeccion:[
  resetEvent({id:'fictional-reset-50',limitHours:50,before:'28.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:00:00.000Z'}),
  resetEvent({id:'fictional-reset-100',limitHours:100,before:'44.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:01:00.000Z'})
 ]});
 const adjusted=clone(before);for(const [key,value]of [['horas_acum_50','15.00'],['horas_totales','15.00'],['horas_acum_100','15.00'],['horas_limite','15.00']])adjusted[key]=value;
 protect({fleet:{0:before}},{fleet:{0:adjusted}},{role:'Director',uid:'fictional-director'});
 assert.equal(adjusted.horas_acum_50,'15.00');assert.equal(adjusted.horas_acum_100,'15.00');
 assert.equal(adjusted.bitacora_ajustes_inspeccion.length,1);
 const event=adjusted.bitacora_ajustes_inspeccion[0];
 assert.equal(event.source,'director-manual-adjustment');assert.equal(event.createdBy,'fictional-director');assert.equal(event.hour_offset,1);assert.equal(event.effective_hour_offset,1);
 assert.equal(event.before50,'10.00');assert.equal(event.after50,'15.00');assert.equal(event.delta50,'5.00');
 assert.equal(event.before100,'10.00');assert.equal(event.after100,'15.00');assert.equal(event.delta100,'5.00');
 const corrected=clone(adjusted);corrected.bitacora_horas[0].hv='11.00';History.rebuild(corrected);
 assert.equal(corrected.horas_acum_50,'16.00');assert.equal(corrected.horas_acum_100,'16.00');
 protect({fleet:{0:adjusted}},{fleet:{0:corrected}},{role:'Director',uid:'fictional-director'});
 assert.equal(corrected.horas_acum_50,'16.00');assert.equal(corrected.horas_acum_100,'16.00');
 assert.equal(corrected.bitacora_ajustes_inspeccion[0].before50,'10.00');assert.equal(corrected.bitacora_ajustes_inspeccion[0].after50,'15.00');assert.equal(corrected.bitacora_ajustes_inspeccion[0].delta50,'5.00');
});

test('first manual adjustment anchors an unsegmented history for future TAC edits',()=>{
 const before=aircraft({horas_acum_50:'15.00',horas_totales:'15.00',horas_acum_100:'25.00',horas_limite:'25.00',bitacora_horas:[{registryId:'fictional-flight-a',hv:'10.00',acum:'25.00'}]});
 const adjusted=clone(before);adjusted.horas_acum_50='16.00';adjusted.horas_totales='16.00';adjusted.horas_acum_100='26.00';adjusted.horas_limite='26.00';
 protect({fleet:{0:before}},{fleet:{0:adjusted}},{role:'Director',uid:'fictional-director'});
 const event=adjusted.bitacora_ajustes_inspeccion[0];
 assert.equal(event.opening_balance50,'5.00');assert.equal(event.opening_balance100,'15.00');
 const corrected=clone(adjusted);corrected.bitacora_horas[0].hv='11.00';History.rebuild(corrected);
 assert.equal(corrected.horas_acum_50,'17.00');assert.equal(corrected.horas_acum_100,'27.00');
 protect({fleet:{0:adjusted}},{fleet:{0:corrected}},{role:'Director',uid:'fictional-director'});
 assert.equal(corrected.horas_acum_50,'17.00');assert.equal(corrected.horas_acum_100,'27.00');
});

test('legacy unlogged manual balances are reconciled once during historical TAC correction',()=>{
 const before=aircraft({horas_acum_50:'15.00',horas_totales:'15.00',horas_acum_100:'15.00',horas_limite:'15.00',bitacora_horas:[{registryId:'fictional-flight-a',hv:'10.00',acum:'10.00'}],bitacora_reinicios_inspeccion:[
  resetEvent({id:'fictional-reset-50',limitHours:50,before:'28.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:00:00.000Z'}),
  resetEvent({id:'fictional-reset-100',limitHours:100,before:'44.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:01:00.000Z'})
 ]});
 const corrected=clone(before);corrected.bitacora_horas[0].hv='11.00';History.rebuild(corrected);
 assert.equal(corrected.horas_acum_50,'11.00');
 protect({fleet:{0:before}},{fleet:{0:corrected}},{role:'Director',uid:'fictional-director'});
 assert.equal(corrected.horas_acum_50,'16.00');assert.equal(corrected.horas_acum_100,'16.00');
 assert.equal(corrected.bitacora_ajustes_inspeccion.length,1);
 const event=corrected.bitacora_ajustes_inspeccion[0];
 assert.equal(event.source,'legacy-counter-reconciliation');assert.equal(event.createdBy,null);assert.equal(event.before50,'10.00');assert.equal(event.after50,'15.00');assert.equal(event.delta50,'5.00');
 const next=clone(corrected);next.bitacora_horas[0].hv='12.00';History.rebuild(next);
 protect({fleet:{0:corrected}},{fleet:{0:next}},{role:'Director',uid:'fictional-director'});
 assert.equal(next.horas_acum_50,'17.00');assert.equal(next.bitacora_ajustes_inspeccion.length,1);
});

test('successive adjustments and a deleted earlier flight preserve deltas and move only the effective offset',()=>{
 const before=aircraft({horas_acum_50:'10.00',horas_totales:'10.00',horas_acum_100:'10.00',horas_limite:'10.00',bitacora_horas:[{registryId:'fictional-flight-a',hv:'4.00',acum:'4.00'},{registryId:'fictional-flight-b',hv:'6.00',acum:'10.00'}],bitacora_reinicios_inspeccion:[
  resetEvent({id:'fictional-reset-50',limitHours:50,before:'28.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:00:00.000Z'}),
  resetEvent({id:'fictional-reset-100',limitHours:100,before:'44.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:01:00.000Z'})
 ]});
 const first=clone(before);first.horas_acum_50='15.00';first.horas_totales='15.00';first.horas_acum_100='15.00';first.horas_limite='15.00';
 protect({fleet:{0:before}},{fleet:{0:first}},{role:'Director',uid:'fictional-director'});
 const second=clone(first);second.horas_acum_50='13.00';second.horas_totales='13.00';second.horas_acum_100='13.00';second.horas_limite='13.00';
 protect({fleet:{0:first}},{fleet:{0:second}},{role:'Director',uid:'fictional-director'});
 assert.deepEqual(second.bitacora_ajustes_inspeccion.map(e=>e.delta50),['5.00','-2.00']);
 const deleted=clone(second);deleted.bitacora_horas.splice(0,1);deleted.bitacora_ajustes_inspeccion.forEach(e=>{if(e.effective_hour_offset>0)e.effective_hour_offset--;});History.rebuild(deleted);
 assert.equal(deleted.bitacora_ajustes_inspeccion[0].hour_offset,2);assert.equal(deleted.bitacora_ajustes_inspeccion[0].effective_hour_offset,1);
 assert.equal(deleted.horas_acum_50,'9.00');assert.equal(deleted.horas_acum_100,'9.00');
 protect({fleet:{0:second}},{fleet:{0:deleted}},{role:'Director',uid:'fictional-director'});
 assert.equal(deleted.bitacora_ajustes_inspeccion[0].effective_hour_offset,1);
 assert.deepEqual(deleted.bitacora_ajustes_inspeccion.map(e=>e.delta50),['5.00','-2.00']);
 const tacCorrected=clone(deleted);tacCorrected.bitacora_horas[0].hv='7.00';History.rebuild(tacCorrected);
 assert.equal(tacCorrected.horas_acum_50,'10.00');assert.equal(tacCorrected.horas_acum_100,'10.00');
 protect({fleet:{0:deleted}},{fleet:{0:tacCorrected}},{role:'Director',uid:'fictional-director'});
 assert.equal(tacCorrected.horas_acum_50,'10.00');assert.equal(tacCorrected.horas_acum_100,'10.00');
});

test('a 50-hour reset leaves the adjusted 100-hour counter intact',()=>{
 const before=aircraft({horas_acum_50:'10.00',horas_totales:'10.00',horas_acum_100:'10.00',horas_limite:'10.00',bitacora_horas:[{registryId:'fictional-flight-a',hv:'10.00',acum:'10.00'}],bitacora_reinicios_inspeccion:[
  resetEvent({id:'fictional-reset-50',limitHours:50,before:'28.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:00:00.000Z'}),
  resetEvent({id:'fictional-reset-100',limitHours:100,before:'44.00',hour_offset:0,effective_hour_offset:0,createdAt:'2026-11-20T10:01:00.000Z'})
 ]});
 const adjusted=clone(before);adjusted.horas_acum_50='15.00';adjusted.horas_totales='15.00';adjusted.horas_acum_100='15.00';adjusted.horas_limite='15.00';
 protect({fleet:{0:before}},{fleet:{0:adjusted}},{role:'Director',uid:'fictional-director'});
 const next=clone(adjusted);const stamp=new Date(Date.parse(next.bitacora_ajustes_inspeccion[0].createdAt)+1000).toISOString();
 next.bitacora_reinicios_inspeccion.push(resetEvent({id:'fictional-reset-50-next',limitHours:50,before:'15.00',after:'0.00',hour_offset:1,effective_hour_offset:1,createdAt:stamp}));
 next.horas_acum_50='0.00';next.horas_totales='0.00';History.rebuild(next);
 assert.equal(next.horas_acum_50,'0.00');assert.equal(next.horas_acum_100,'15.00');
 protect({fleet:{0:adjusted}},{fleet:{0:next}},{role:'Director',uid:'fictional-director'});
 assert.equal(next.horas_acum_50,'0.00');assert.equal(next.horas_acum_100,'15.00');
});

test('non-Director cannot alter manual counters or forge adjustment history',()=>{
 const before=aircraft({horas_acum_50:'5.00',horas_totales:'5.00',horas_acum_100:'8.00',horas_limite:'8.00'});
 const forged=clone(before);forged.horas_acum_50='6.00';forged.horas_totales='6.00';
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:forged}},{role:'Piloto',uid:'fictional-pilot'}),/Solo el Director/);
 forged.bitacora_ajustes_inspeccion=[{id:'forged',hour_offset:0,effective_hour_offset:0,delta50:'1.00',delta100:'0.00'}];
 assert.throws(()=>protect({fleet:{0:before}},{fleet:{0:forged}},{role:'Director',uid:'fictional-director'}),/no puede editarse/);
});

test('TAC deletion shifts the adjustment event offset in the browser flow',()=>{
 const source=fs.readFileSync(require.resolve('../registro.js'),'utf8');
 assert.match(source,/bitacora_ajustes_inspeccion\)\)\{const offset=window\.HPInspectionHistory\.effectiveOffset\(adjustment\);if\(offset!==null&&offset>hi\)adjustment\.effective_hour_offset=offset-1/);
});

test('director-save returns server-created adjustment events before cloudWrite caches the saved payload',()=>{
 const endpoint=fs.readFileSync(require.resolve('../functions/index.js'),'utf8'),cloud=fs.readFileSync(require.resolve('../cloud.js'),'utf8'),dashboard=fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
 assert.match(endpoint,/submittedFleet=JSON\.stringify\(data\.fleet\|\|\{\}\)/);
 assert.match(endpoint,/serverFleetSync=JSON\.parse\(JSON\.stringify\(data\.fleet\|\|\{\}\)\)/);
 assert.match(endpoint,/fleetSync:\{fleet:serverFleetSync\}/);
 const apply=cloud.indexOf('if(result.fleetSync?.fleet)data.fleet=result.fleetSync.fleet;'),cache=cloud.indexOf('lastCloudPayload=JSON.stringify(data)',apply);
 assert(apply>=0&&cache>apply,'The client must merge the server history before storing its next-write baseline.');
 assert.match(dashboard,/Object\.assign\(data,decodeAircraft\(previewData\.fleet\[key\]\)\)/,'Aircraft editor state must receive the canonical adjustment history after save.');
});
