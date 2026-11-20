'use strict';
const {isDeepStrictEqual}=require('node:util');
function list(value){if(value==null)return [];if(!Array.isArray(value))throw Error('El historial de reinicios de inspección no es válido.');return value;}
function rows(value){if(value==null)return [];if(Array.isArray(value))return value;if(typeof value==='object')return Object.keys(value).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(key=>value[key]);throw Error('La bitácora de horas no es válida.');}
function cents(value){if(value==null||value==='')return 0;const number=Number(value);if(!Number.isFinite(number)||number<0)throw Error('El acumulado de horas no es válido.');const result=Math.round(number*100);if(!Number.isSafeInteger(result))throw Error('El acumulado de horas no es válido.');return result;}
function sameCents(left,right){if((left==null||left==='')&&(right==null||right===''))return true;const a=left==null||left===''?0:Number(left),b=right==null||right===''?0:Number(right);return Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>=0?Math.round(a*100)===Math.round(b*100):isDeepStrictEqual(left,right);}
function pairCents(aircraft,field,alias){const value=aircraft?.[field];return cents(value==null||value===''?aircraft?.[alias]:value);}
function protect(before={},after={},account={}){
 const oldFleet=before.fleet||{},newFleet=after.fleet||{};
 for(const [key,oldAircraft]of Object.entries(oldFleet)){
  const oldEvents=list(oldAircraft?.bitacora_reinicios_inspeccion);
  if(oldEvents.length&&!Object.hasOwn(newFleet,key))throw Error('No se puede eliminar un avión con historial de reinicios de inspección.');
 }
 for(const [key,aircraft]of Object.entries(newFleet)){
  const oldAircraft=oldFleet[key]||{},oldEvents=list(oldAircraft.bitacora_reinicios_inspeccion),events=list(aircraft?.bitacora_reinicios_inspeccion);
  if(events.length>oldEvents.length&&account.role!=='Director')throw Error('Solo el Director puede registrar reinicios de inspección.');
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
 if(account.role!=='Director')protectFlightHourChanges(oldFleet,newFleet);
}
function protectFlightHourChanges(oldFleet,newFleet){
 for(const [key,aircraft]of Object.entries(newFleet)){
  const old=oldFleet[key]||{};
  const fields=['horas_acum_50','horas_acum_100','horas_totales','horas_limite'];
  if(!fields.some(field=>!sameCents(old[field],aircraft?.[field])))continue;
  const previous=rows(old.bitacora_horas),current=rows(aircraft?.bitacora_horas);
  if(current.length<=previous.length||!isDeepStrictEqual(previous,current.slice(0,previous.length)))throw Error('Solo el Director puede reiniciar o corregir acumulados sin agregar vuelos a la bitácora.');
  const added=current.slice(previous.length).reduce((sum,row)=>sum+cents(row?.hv),0);
  const expected50=pairCents(old,'horas_acum_50','horas_totales')+added;
  const expected100=pairCents(old,'horas_acum_100','horas_limite')+added;
  if(cents(aircraft?.horas_acum_50)!==expected50||cents(aircraft?.horas_totales)!==expected50||cents(aircraft?.horas_acum_100)!==expected100||cents(aircraft?.horas_limite)!==expected100)throw Error('Los acumulados deben coincidir con las horas nuevas registradas en la bitácora.');
 }
}
module.exports={protect};
