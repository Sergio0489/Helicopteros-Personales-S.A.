'use strict';
const {isDeepStrictEqual}=require('node:util');
function array(value){return Array.isArray(value)?value:[];}
function offsets(aircraft,limit){
 const inspections=array(aircraft.bitacora_inspecciones).filter(r=>limit===50?[50,100].includes(Number(r.tipo)):Number(r.tipo)===100).map(r=>Number(r.hour_offset));
 const manual=array(aircraft.bitacora_reinicios_inspeccion).filter(r=>Number(r.limitHours)===limit).map(r=>Number(r.hour_offset));
 return [...inspections,...manual].filter(n=>Number.isInteger(n)&&n>=0);
}
function recordsAfterDeletion(before,after){
 const remaining=array(before).map(record=>({record,used:false}));
 for(const record of array(after)){const entry=remaining.find(item=>!item.used&&isDeepStrictEqual(item.record,record));if(!entry)throw Error('El guardado de la bitácora de inspecciones no coincide con una eliminación.');entry.used=true;}
 return remaining.filter(item=>!item.used).map(item=>item.record);
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
  const record=removed[0],type=Number(record.tipo),offset=Number(record.hour_offset),oldLogs=array(oldAircraft.bitacora_horas),newLogs=array(newAircraft.bitacora_horas);
  if(![50,100].includes(type)||!Number.isInteger(offset)||offset<0||offset>oldLogs.length||newLogs.length!==oldLogs.length)throw Error('La inspección no tiene una posición válida en la bitácora de horas.');
  const base50=Number(record.before50||0),base100=Number(record.before100||0),hoursAfter=oldLogs.slice(offset).reduce((sum,row)=>{const hours=Number(row?.hv||0);if(!Number.isFinite(hours)||hours<0)throw Error('La bitácora contiene horas no válidas.');return sum+hours;},0);
  if(!Number.isFinite(base50)||base50<0||!Number.isFinite(base100)||base100<0)throw Error('La inspección contiene acumulados anteriores no válidos.');
  const later50=offsets(newAircraft,50).some(n=>n>=offset),later100=offsets(newAircraft,100).some(n=>n>=offset);
  const expected50=[50,100].includes(type)&&!later50?base50+hoursAfter:Number(oldAircraft.horas_acum_50||0);
  const expected100=type===100&&!later100?base100+hoursAfter:Number(oldAircraft.horas_acum_100||0);
  if(Number(newAircraft.horas_acum_50??0)!==Number(expected50.toFixed(2))||Number(newAircraft.horas_totales??0)!==Number(expected50.toFixed(2))||Number(newAircraft.horas_acum_100??0)!==Number(expected100.toFixed(2))||Number(newAircraft.horas_limite??0)!==Number(expected100.toFixed(2)))throw Error('Los acumulados no corresponden a la inspección eliminada y a la bitácora de horas.');
  const next100=offsets(newAircraft,100).filter(n=>n>=offset),end=Math.min(next100.length?Math.min(...next100):Infinity,oldLogs.length);
  for(let i=0;i<oldLogs.length;i++){
   const expectedAccum=type===100&&i>=offset&&i<end?Number(oldLogs[i]?.acum||0)+base100:Number(oldLogs[i]?.acum||0);
   if(!isDeepStrictEqual(withoutAccum(oldLogs[i]),withoutAccum(newLogs[i]))||!Number.isFinite(Number(newLogs[i]?.acum||0))||Number(newLogs[i]?.acum||0)!==Number(expectedAccum.toFixed(2)))throw Error('La bitácora de horas debe conservar sus registros y ajustar sus acumulados tras eliminar la inspección.');
  }
  const expectedNext=newRecords.length?String(newRecords[newRecords.length-1].proxima??''):'';
  if(String(newAircraft.proxima_inspeccion??'')!==expectedNext)throw Error('La próxima inspección no coincide con los registros restantes.');
 }
}
module.exports={protectDeletion};
