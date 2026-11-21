'use strict';
const {isDeepStrictEqual}=require('node:util');
const history=require('./inspection-history');
function list(value){if(value==null)return [];if(!Array.isArray(value))throw Error('El historial de reinicios de inspección no es válido.');return value;}
function rows(value){if(value==null)return [];if(Array.isArray(value))return value;if(typeof value==='object')return Object.keys(value).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(key=>value[key]);throw Error('La bitácora de horas no es válida.');}
function cents(value){return history.asCents(value);}
function sameCents(left,right){if((left==null||left==='')&&(right==null||right===''))return true;const a=left==null||left===''?0:Number(left),b=right==null||right===''?0:Number(right);return Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>=0?Math.round(a*100)===Math.round(b*100):isDeepStrictEqual(left,right);}
function withoutAccum(row){const {acum,...rest}=row||{};return rest;}
function withoutHourAndAccum(row){const {hv,acum,...rest}=row||{};return rest;}
function hasAnchor(aircraft,limit){
 const field='before'+limit;
 return list(aircraft.bitacora_inspecciones).some(record=>Number.isInteger(record.hour_offset)&&record[ field ]!==undefined&&record[field]!==null&&record[field]!=='')||list(aircraft.bitacora_reinicios_inspeccion).some(record=>Number(record.limitHours)===limit&&history.effectiveOffset(record)!==null&&record.before!==undefined&&record.before!==null&&record.before!=='');
}
function shiftCounterAliases(aircraft,delta){
 const change=Math.round(Number(delta)*100);
 for(const [limit,alias]of [[50,'horas_totales'],[100,'horas_limite']]){
  if(hasAnchor(aircraft,limit))continue;
  const field='horas_acum_'+limit,raw=aircraft[field]??aircraft[alias]??0,next=cents(raw)+change;
  if(next<0)throw Error('La corrección dejaría un acumulado de inspección negativo. Revisa la bitácora.');
  aircraft[field]=(next/100).toFixed(2);aircraft[alias]=aircraft[field];
 }
}
function assertRebuiltHistory(expected,actual){
 const expectedLogs=rows(expected.bitacora_horas),actualLogs=rows(actual.bitacora_horas);
 if(!isDeepStrictEqual(expected.bitacora_inspecciones,list(actual.bitacora_inspecciones))||!isDeepStrictEqual(expected.bitacora_reinicios_inspeccion,list(actual.bitacora_reinicios_inspeccion)))throw Error('El historial de inspecciones debe actualizarse junto con la corrección de la bitácora.');
 if(expectedLogs.length!==actualLogs.length||expectedLogs.some((row,i)=>!isDeepStrictEqual(withoutAccum(row),withoutAccum(actualLogs[i]))||!sameCents(row?.acum,actualLogs[i]?.acum)))throw Error('Los acumulados de la bitácora deben coincidir con las horas recalculadas.');
 for(const [field,alias]of [['horas_acum_50','horas_totales'],['horas_acum_100','horas_limite']])if(!sameCents(expected[field],actual[field])||!sameCents(expected[alias],actual[alias]))throw Error('Los acumulados de inspección deben coincidir con el historial recalculado.');
 if(String(expected.proxima_inspeccion??'')!==String(actual.proxima_inspeccion??''))throw Error('La próxima inspección debe conservarse al corregir las horas.');
}
function protectHistoricalHourChanges(oldAircraft,aircraft){
 const oldLogs=rows(oldAircraft.bitacora_horas),newLogs=rows(aircraft.bitacora_horas);let index=null,delta=0,deleteRow=false;
 if(oldLogs.length!==newLogs.length){
  if(newLogs.length!==oldLogs.length-1)throw Error('Corrige una sola fila de la bitácora por guardado.');
  index=history.findDeletedLogIndex(oldLogs,newLogs);if(index===null)throw Error('No se pudo identificar con seguridad la fila eliminada de la bitácora.');
  deleteRow=true;delta=-Number(oldLogs[index]?.hv??0);
  if(!Number.isFinite(delta))throw Error('La fila eliminada contiene horas no válidas.');
 }else{
  const changed=[];
  for(let i=0;i<oldLogs.length;i++)if(!sameCents(oldLogs[i]?.hv,newLogs[i]?.hv))changed.push(i);
  if(!changed.length)return;
  if(changed.length!==1)throw Error('Corrige una sola fila de horas por guardado.');
  index=changed[0];delta=Number(newLogs[index]?.hv??0)-Number(oldLogs[index]?.hv??0);
  if(!Number.isFinite(delta)||delta===0||delta+Number(oldLogs[index]?.hv??0)<0)throw Error('La corrección de horas no es válida.');
  for(let i=0;i<oldLogs.length;i++)if(!isDeepStrictEqual(withoutHourAndAccum(oldLogs[i]),withoutHourAndAccum(newLogs[i])))throw Error('Una corrección de horas solo puede cambiar el valor de vuelo de la fila seleccionada.');
 }
 const expected=structuredClone(oldAircraft);expected.bitacora_horas=oldLogs.map(row=>({...row}));expected.bitacora_inspecciones=list(expected.bitacora_inspecciones).map(row=>({...row}));expected.bitacora_reinicios_inspeccion=list(expected.bitacora_reinicios_inspeccion).map(row=>({...row}));
 history.shiftInspectionSnapshots(expected,index,delta);shiftCounterAliases(expected,delta);
 if(deleteRow){
  for(const inspection of expected.bitacora_inspecciones)if(inspection.hour_offset>index)inspection.hour_offset--;
  for(const reset of expected.bitacora_reinicios_inspeccion){const offset=history.effectiveOffset(reset);if(offset!==null&&offset>index)reset.effective_hour_offset=offset-1;}
  expected.bitacora_horas.splice(index,1);
 }else expected.bitacora_horas[index].hv=newLogs[index].hv;
 history.rebuild(expected);assertRebuiltHistory(expected,aircraft);
}
function protect(before={},after={},account={}){
 const oldFleet=before.fleet||{},newFleet=after.fleet||{};
 for(const [key,oldAircraft]of Object.entries(oldFleet)){
  const oldEvents=list(oldAircraft?.bitacora_reinicios_inspeccion);
  if(oldEvents.length&&!Object.hasOwn(newFleet,key))throw Error('No se puede eliminar un avión con historial de reinicios de inspección.');
 }
 for(const [key,aircraft]of Object.entries(newFleet)){
  const oldAircraft=oldFleet[key]||{},oldEvents=list(oldAircraft.bitacora_reinicios_inspeccion),events=list(aircraft?.bitacora_reinicios_inspeccion);
  protectHistoricalHourChanges(oldAircraft,aircraft);
  if(events.length>oldEvents.length&&account.role!=='Director')throw Error('Solo el Director puede registrar reinicios de inspección.');
  if(events.length<oldEvents.length)throw Error('El historial de reinicios de inspección es permanente y no se puede modificar ni eliminar.');
  const deletedIndex=history.findDeletedLogIndex(rows(oldAircraft.bitacora_horas),rows(aircraft.bitacora_horas));
  for(let i=0;i<oldEvents.length;i++){
   const previous=oldEvents[i],current=events[i];
   if(!current||!isDeepStrictEqual(history.stripEffectiveOffset(previous),history.stripEffectiveOffset(current)))throw Error('El historial de reinicios de inspección es permanente y no se puede modificar ni eliminar.');
   const previousOffset=history.effectiveOffset(previous),currentOffset=history.effectiveOffset(current),oldEffective=previous?.effective_hour_offset,newEffective=current?.effective_hour_offset;
   if(previousOffset!==currentOffset){
    const expected=deletedIndex!==null&&deletedIndex<previousOffset?previousOffset-1:previousOffset;
    if(deletedIndex===null||currentOffset!==expected||newEffective!==expected)throw Error('La posición del reinicio solo puede ajustarse al eliminar una fila anterior de la bitácora.');
   }else if(!isDeepStrictEqual(oldEffective,newEffective))throw Error('El historial de reinicios de inspección es permanente y no se puede modificar ni eliminar.');
  }
  const knownIds=new Set(oldEvents.map(event=>String(event.id)));
  for(const event of events.slice(oldEvents.length)){
   const limit=Number(event?.limitHours),field=limit===50?'horas_acum_50':limit===100?'horas_acum_100':'',previous=Number(oldAircraft[field]??0),afterValue=Number(event?.after),beforeValue=Number(event?.before),offset=Array.isArray(oldAircraft.bitacora_horas)?oldAircraft.bitacora_horas.length:0;
   if(!field||typeof event.id!=='string'||!event.id.trim()||knownIds.has(event.id)||!Number.isFinite(beforeValue)||beforeValue<0||afterValue!==0||Number(aircraft[field]??0)!==0||beforeValue!==previous||!Number.isInteger(event.hour_offset)||event.hour_offset!==offset||event.effective_hour_offset!==event.hour_offset||typeof event.reason!=='string'||!event.reason.trim()||event.reason.trim().length>500||!Number.isFinite(Date.parse(event.createdAt))||!/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(String(event.fecha||''))||typeof event.hora!=='string'||!event.hora.trim())throw Error('El reinicio de inspección debe tener un motivo válido y reiniciar únicamente la barra correspondiente.');
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
  const old=oldFleet[key]||{},fields=['horas_acum_50','horas_acum_100','horas_totales','horas_limite'];
  if(!fields.some(field=>!sameCents(old[field],aircraft?.[field])))continue;
  const previous=rows(old.bitacora_horas),current=rows(aircraft?.bitacora_horas);
  if(current.length<=previous.length||!isDeepStrictEqual(previous,current.slice(0,previous.length)))throw Error('Solo el Director puede reiniciar o corregir acumulados sin agregar vuelos a la bitácora.');
  const added=current.slice(previous.length).reduce((sum,row)=>sum+cents(row?.hv),0),base50=old.horas_acum_50==null||old.horas_acum_50===''?old.horas_totales:old.horas_acum_50,base100=old.horas_acum_100==null||old.horas_acum_100===''?old.horas_limite:old.horas_acum_100,expected50=history.asCents(base50??0)+added,expected100=history.asCents(base100??0)+added;
  if(cents(aircraft?.horas_acum_50)!==expected50||cents(aircraft?.horas_totales)!==expected50||cents(aircraft?.horas_acum_100)!==expected100||cents(aircraft?.horas_limite)!==expected100)throw Error('Los acumulados deben coincidir con las horas nuevas registradas en la bitácora.');
 }
}
module.exports={protect};
