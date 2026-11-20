'use strict';
const {isDeepStrictEqual}=require('node:util');
function list(value){if(value==null)return [];if(!Array.isArray(value))throw Error('El historial de reinicios de inspección no es válido.');return value;}
function protect(before={},after={}){
 const oldFleet=before.fleet||{},newFleet=after.fleet||{};
 for(const [key,oldAircraft]of Object.entries(oldFleet)){
  const oldEvents=list(oldAircraft?.bitacora_reinicios_inspeccion);
  if(oldEvents.length&&!Object.hasOwn(newFleet,key))throw Error('No se puede eliminar un avión con historial de reinicios de inspección.');
 }
 for(const [key,aircraft]of Object.entries(newFleet)){
  const oldAircraft=oldFleet[key]||{},oldEvents=list(oldAircraft.bitacora_reinicios_inspeccion),events=list(aircraft?.bitacora_reinicios_inspeccion);
  if(events.length<oldEvents.length||!isDeepStrictEqual(oldEvents,events.slice(0,oldEvents.length)))throw Error('El historial de reinicios de inspección es permanente y no se puede modificar ni eliminar.');
  const knownIds=new Set(oldEvents.map(event=>String(event.id)));
  for(const event of events.slice(oldEvents.length)){
   const limit=Number(event?.limitHours),field=limit===50?'horas_acum_50':limit===100?'horas_acum_100':'';
   const previous=Number(oldAircraft[field]??0),afterValue=Number(event?.after),beforeValue=Number(event?.before),offset=Array.isArray(oldAircraft.bitacora_horas)?oldAircraft.bitacora_horas.length:0;
   if(!field||typeof event.id!=='string'||!event.id.trim()||knownIds.has(event.id)||!Number.isFinite(beforeValue)||beforeValue<0||afterValue!==0||Number(aircraft[field]??0)!==0||beforeValue!==previous||!Number.isInteger(event.hour_offset)||event.hour_offset!==offset||typeof event.reason!=='string'||!event.reason.trim()||event.reason.trim().length>500||!Number.isFinite(Date.parse(event.createdAt))||!/^\d{2}\/\d{2}\/\d{4}$/.test(String(event.fecha||''))||typeof event.hora!=='string'||!event.hora.trim())throw Error('El reinicio de inspección debe tener un motivo válido y reiniciar únicamente la barra correspondiente.');
   if(limit===50&&Number(aircraft.horas_totales??0)!==0||limit===100&&Number(aircraft.horas_limite??0)!==0)throw Error('El reinicio no coincide con el acumulado de inspección.');
   const otherField=limit===50?'horas_acum_100':'horas_acum_50',otherAlias=limit===50?'horas_limite':'horas_totales';
   if(Number(aircraft[otherField]??0)!==Number(oldAircraft[otherField]??0)||Number(aircraft[otherAlias]??0)!==Number(oldAircraft[otherAlias]??0))throw Error('Cada reinicio solo puede cambiar su barra de inspección correspondiente.');
   knownIds.add(event.id);
  }
 }
}
module.exports={protect};
