'use strict';
const {isDeepStrictEqual}=require('node:util');
const history=require('./inspection-history');
function array(value){return Array.isArray(value)?value:[];}
function withoutSnapshots(record){const {before50,before100,...rest}=record||{};return rest;}
function recordsAfterDeletion(before,after){
 const remaining=array(before).map((record,index)=>({record,index,used:false}));
 for(const record of array(after)){const entry=remaining.find(item=>!item.used&&isDeepStrictEqual(withoutSnapshots(item.record),withoutSnapshots(record)));if(!entry)throw Error('El guardado de la bitácora de inspecciones no coincide con una eliminación.');entry.used=true;}
 return remaining.filter(item=>!item.used).map(({record,index})=>({record,index}));
}
function withoutAccum(row){const {acum,...rest}=row||{};return rest;}
function protectDeletion(before={},after={},context={}){
 const oldFleet=before.fleet||{},newFleet=after.fleet||{};
 for(const [key,oldAircraft]of Object.entries(oldFleet)){
  const oldRecords=array(oldAircraft.bitacora_inspecciones),newAircraft=newFleet[key];if(!newAircraft)continue;
  const newRecords=array(newAircraft.bitacora_inspecciones);if(newRecords.length>=oldRecords.length)continue;
  if(context.role!=='Director')throw Error('Solo el Director puede eliminar registros de inspección.');
  if(typeof context.reason!=='string'||!context.reason.trim()||context.reason.trim().length>500)throw Error('El motivo para eliminar una inspección es obligatorio y debe tener hasta 500 caracteres.');
  if(newRecords.length!==oldRecords.length-1)throw Error('Elimina una inspección por vez para recalcular correctamente las horas.');
  const removed=recordsAfterDeletion(oldRecords,newRecords);if(removed.length!==1)throw Error('No se pudo identificar la inspección eliminada.');
  const {record,index}=removed[0],oldLogs=array(oldAircraft.bitacora_horas),newLogs=array(newAircraft.bitacora_horas);
  if(![50,100].includes(Number(record.tipo))||!Number.isInteger(record.hour_offset)||record.hour_offset<0||record.hour_offset>oldLogs.length||newLogs.length!==oldLogs.length)throw Error('La inspección no tiene una posición válida en la bitácora de horas.');
  if(oldLogs.some((row,i)=>!isDeepStrictEqual(withoutAccum(row),withoutAccum(newLogs[i]))))throw Error('La eliminación de una inspección no puede cambiar horas de vuelo.');
  const expected=JSON.parse(JSON.stringify(oldAircraft));
  expected.bitacora_inspecciones.splice(index,1);
  expected.proxima_inspeccion=expected.bitacora_inspecciones.length?String(expected.bitacora_inspecciones.at(-1).proxima??''):'';
  history.rebuild(expected,{anchors:[{record,index}]});
  if(!isDeepStrictEqual(expected.bitacora_inspecciones,newRecords))throw Error('Los saldos históricos de las inspecciones restantes deben recalcularse antes de guardar.');
  if(expected.bitacora_horas.some((row,i)=>!isDeepStrictEqual(Number(row?.acum||0),Number(newLogs[i]?.acum||0))))throw Error('La bitácora de horas debe conservar sus acumulados recalculados tras eliminar la inspección.');
  for(const [field,alias]of [['horas_acum_50','horas_totales'],['horas_acum_100','horas_limite']]){
   if(history.asCents(newAircraft[field]??0)!==history.asCents(expected[field]??0)||history.asCents(newAircraft[alias]??0)!==history.asCents(expected[alias]??0))throw Error('Los acumulados no corresponden a la bitácora de inspecciones y horas.');
  }
  if(String(newAircraft.proxima_inspeccion??'')!==String(expected.proxima_inspeccion??''))throw Error('La próxima inspección no coincide con los registros restantes.');
 }
}
module.exports={protectDeletion};
