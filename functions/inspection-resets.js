'use strict';
const {isDeepStrictEqual}=require('node:util');
const {randomUUID}=require('node:crypto');
const history=require('./inspection-history');
function list(value){if(value==null)return [];if(!Array.isArray(value))throw Error('El historial de reinicios de inspección no es válido.');return value;}
function rows(value){if(value==null)return [];if(Array.isArray(value))return value;if(typeof value==='object')return Object.keys(value).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(key=>value[key]);throw Error('La bitácora de horas no es válida.');}
function cents(value){return history.asCents(value);}
function sameCents(left,right){if((left==null||left==='')&&(right==null||right===''))return true;const a=left==null||left===''?0:Number(left),b=right==null||right===''?0:Number(right);return Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>=0?Math.round(a*100)===Math.round(b*100):isDeepStrictEqual(left,right);}
function adjustmentRows(value){if(value==null)return [];if(!Array.isArray(value))throw Error('El historial de ajustes de inspección no es válido.');return value;}
function counter(aircraft,limit){const alias=limit===50?'horas_totales':'horas_limite';return cents(aircraft['horas_acum_'+limit]??aircraft[alias]??0);}
function adjustmentAnchor(aircraft,limit){
 const field='before'+limit;
 return list(aircraft.bitacora_inspecciones).some(record=>Number.isInteger(record.hour_offset)&&record[field]!==undefined&&record[field]!==null&&record[field]!=='')||
  list(aircraft.bitacora_reinicios_inspeccion).some(record=>Number(record.limitHours)===limit&&history.effectiveOffset(record)!==null&&record.before!==undefined&&record.before!==null&&record.before!=='')||
  adjustmentRows(aircraft.bitacora_ajustes_inspeccion).some(record=>record['opening_balance'+limit]!==undefined&&record['opening_balance'+limit]!==null&&record['opening_balance'+limit]!=='');
}
function signedCents(value){const number=Number(value);if(!Number.isFinite(number))throw Error('El ajuste de inspección no es válido.');const result=Math.round(number*100);if(!Number.isSafeInteger(result))throw Error('El ajuste de inspección excede el rango permitido.');return result;}
function adjustmentRecord(before,after,offset,account={},source='director-manual-adjustment',opening={}){
 const values={};
 for(const limit of [50,100]){
  const b=counter(before,limit),a=counter(after,limit);
  values['before'+limit]=history.asHours(b);values['after'+limit]=history.asHours(a);values['delta'+limit]=history.asHours(a-b);
 }
 const record={id:randomUUID(),source,hour_offset:offset,effective_hour_offset:offset,...values,createdAt:new Date().toISOString(),createdBy:source==='legacy-counter-reconciliation'?null:account.uid||null,reason:source==='legacy-counter-reconciliation'?'Se preservó un saldo previo sin evento; el autor y la fecha originales no están disponibles.':String(account.reason||'Ajuste manual registrado por Dirección').trim().slice(0,500)};
 for(const limit of [50,100])if(opening[limit]!==undefined&&opening[limit]!==null)record['opening_balance'+limit]=history.asHours(opening[limit]);
 return record;
}
function appendLegacyResidual(aircraft,account={}){
 aircraft.bitacora_ajustes_inspeccion=adjustmentRows(aircraft.bitacora_ajustes_inspeccion);
 const replay=structuredClone(aircraft);history.rebuild(replay);
 const residuals=[50,100].map(limit=>counter(aircraft,limit)-counter(replay,limit));
 if(residuals.every(value=>value===0))return false;
 const opening={};for(const limit of [50,100])if(!adjustmentAnchor(aircraft,limit))opening[limit]=openingBalance(aircraft,limit,counter(replay,limit));
 const event=adjustmentRecord(replay,aircraft,rows(aircraft.bitacora_horas).length,account,'legacy-counter-reconciliation',opening);
 if(event.delta50==='0.00'&&event.delta100==='0.00')return false;
 aircraft.bitacora_ajustes_inspeccion.push(event);
 const verified=structuredClone(aircraft);history.rebuild(verified);
 if([50,100].some(limit=>counter(verified,limit)!==counter(aircraft,limit)))throw Error('No se pudo preservar el saldo manual anterior. Revisa el historial antes de continuar.');
 return true;
}
function openingBalance(aircraft,limit,beforeValue){
 if(adjustmentAnchor(aircraft,limit))return null;
 const existing=adjustmentRows(aircraft.bitacora_ajustes_inspeccion).find(record=>record['opening_balance'+limit]!==undefined&&record['opening_balance'+limit]!==null&&record['opening_balance'+limit]!=='');
 if(existing)return cents(existing['opening_balance'+limit]);
 const logTotal=rows(aircraft.bitacora_horas).reduce((sum,row)=>sum+cents(row?.hv??0),0);
 const deltaTotal=adjustmentRows(aircraft.bitacora_ajustes_inspeccion).reduce((sum,record)=>sum+signedCents(record['delta'+limit]??0),0);
 const result=beforeValue-logTotal-deltaTotal;
 if(result<0)throw Error('No se pudo derivar el saldo inicial de la barra de inspección.');
 return result;
}
function captureManualAdjustment(oldAircraft,aircraft,account){
 const beforeRows=rows(oldAircraft.bitacora_horas),afterRows=rows(aircraft.bitacora_horas);
 if(!isDeepStrictEqual(beforeRows,afterRows))return;
 const changed=[50,100].some(limit=>counter(oldAircraft,limit)!==counter(aircraft,limit));
 if(!changed)return;
 if(account.role!=='Director')throw Error('Solo el Director puede ajustar manualmente las horas de inspección.');
 const oldAdjustments=adjustmentRows(oldAircraft.bitacora_ajustes_inspeccion),submitted=adjustmentRows(aircraft.bitacora_ajustes_inspeccion);
 if(!isDeepStrictEqual(oldAdjustments,submitted))throw Error('El historial de ajustes de inspección no puede editarse desde el cliente.');
 const working=structuredClone(oldAircraft);working.bitacora_ajustes_inspeccion=oldAdjustments.map(record=>({...record}));
 appendLegacyResidual(working,account);
 const opening={};for(const limit of [50,100])opening[limit]=openingBalance(working,limit,counter(oldAircraft,limit));
 const event=adjustmentRecord(oldAircraft,aircraft,beforeRows.length,account,'director-manual-adjustment',opening);
 working.bitacora_ajustes_inspeccion.push(event);
 const verified=structuredClone(working);history.rebuild(verified);
 if([50,100].some(limit=>counter(verified,limit)!==counter(aircraft,limit)))throw Error('El ajuste manual no coincide con el historial recalculado.');
 aircraft.bitacora_ajustes_inspeccion=verified.bitacora_ajustes_inspeccion;
 aircraft.bitacora_horas=verified.bitacora_horas;
 aircraft.bitacora_inspecciones=verified.bitacora_inspecciones;
 for(const [limit,alias]of [[50,'horas_totales'],[100,'horas_limite']]){aircraft['horas_acum_'+limit]=verified['horas_acum_'+limit];aircraft[alias]=verified[alias];}
}
function withoutAccum(row){const {acum,...rest}=row||{};return rest;}
function withoutHourAndAccum(row){const {hv,acum,...rest}=row||{};return rest;}
function hasAnchor(aircraft,limit){return adjustmentAnchor(aircraft,limit);}
function shiftCounterAliases(aircraft,delta){
 const change=Math.round(Number(delta)*100);
 for(const [limit,alias]of [[50,'horas_totales'],[100,'horas_limite']]){
  if(hasAnchor(aircraft,limit))continue;
  const field='horas_acum_'+limit,raw=aircraft[field]??aircraft[alias]??0,next=cents(raw)+change;
  if(next<0)throw Error('La corrección dejaría un acumulado de inspección negativo. Revisa la bitácora.');
  aircraft[field]=(next/100).toFixed(2);aircraft[alias]=aircraft[field];
 }
}
function assertHistoryIntent(expected,actual){
 const expectedInspections=list(expected.bitacora_inspecciones),actualInspections=list(actual.bitacora_inspecciones);
 const stripDerived=record=>{const {before50,before100,hour_offset,...rest}=record||{};return rest;};
 if(expectedInspections.length!==actualInspections.length||expectedInspections.some((record,index)=>!isDeepStrictEqual(stripDerived(record),stripDerived(actualInspections[index]))))throw Error('No se permite combinar la corrección de horas con cambios en el historial de inspecciones.');
 const expectedLogs=rows(expected.bitacora_horas),actualLogs=rows(actual.bitacora_horas);
 if(expectedLogs.length!==actualLogs.length||expectedLogs.some((row,index)=>!isDeepStrictEqual(withoutAccum(row),withoutAccum(actualLogs[index]))))throw Error('La corrección de horas no coincide con la bitácora enviada.');
 if(String(expected.proxima_inspeccion??'')!==String(actual.proxima_inspeccion??''))throw Error('La próxima inspección debe conservarse al corregir las horas.');
}
function assertRebuiltHistory(expected,actual){
 const expectedLogs=rows(expected.bitacora_horas),actualLogs=rows(actual.bitacora_horas);
 if(!isDeepStrictEqual(expected.bitacora_inspecciones,list(actual.bitacora_inspecciones))||!isDeepStrictEqual(expected.bitacora_reinicios_inspeccion,list(actual.bitacora_reinicios_inspeccion))||!isDeepStrictEqual(expected.bitacora_ajustes_inspeccion,adjustmentRows(actual.bitacora_ajustes_inspeccion)))throw Error('El historial de inspecciones debe actualizarse junto con la corrección de la bitácora.');
 if(expectedLogs.length!==actualLogs.length||expectedLogs.some((row,i)=>!isDeepStrictEqual(withoutAccum(row),withoutAccum(actualLogs[i]))||!sameCents(row?.acum,actualLogs[i]?.acum)))throw Error('Los acumulados de la bitácora deben coincidir con las horas recalculadas.');
 for(const [field,alias]of [['horas_acum_50','horas_totales'],['horas_acum_100','horas_limite']])if(!sameCents(expected[field],actual[field])||!sameCents(expected[alias],actual[alias]))throw Error('Los acumulados de inspección deben coincidir con el historial recalculado.');
 if(String(expected.proxima_inspeccion??'')!==String(actual.proxima_inspeccion??''))throw Error('La próxima inspección debe conservarse al corregir las horas.');
}
function protectHistoricalHourChanges(oldAircraft,aircraft,account={}){
 const oldLogs=rows(oldAircraft.bitacora_horas),newLogs=rows(aircraft.bitacora_horas);let index=null,delta=0,deleteRow=false;
 if(oldLogs.length!==newLogs.length){
  if(newLogs.length>oldLogs.length){if(oldLogs.some((row,i)=>!isDeepStrictEqual(row,newLogs[i])))throw Error('Agregar horas no puede modificar filas históricas en el mismo guardado.');return;}
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
 const oldAdjustments=adjustmentRows(oldAircraft.bitacora_ajustes_inspeccion),submittedAdjustments=adjustmentRows(aircraft.bitacora_ajustes_inspeccion),allowedAdjustments=oldAdjustments.map(record=>({...record}));
 if(deleteRow)for(const event of allowedAdjustments){const offset=history.effectiveOffset(event);if(offset!==null&&offset>index)event.effective_hour_offset=offset-1;}
 if(!isDeepStrictEqual(allowedAdjustments,submittedAdjustments))throw Error('El historial de ajustes de inspección no puede editarse desde el cliente.');
 const expected=structuredClone(oldAircraft);expected.bitacora_horas=oldLogs.map(row=>({...row}));expected.bitacora_inspecciones=list(expected.bitacora_inspecciones).map(row=>({...row}));expected.bitacora_reinicios_inspeccion=list(expected.bitacora_reinicios_inspeccion).map(row=>({...row}));expected.bitacora_ajustes_inspeccion=oldAdjustments.map(row=>({...row}));
 const reconciledLegacy=appendLegacyResidual(expected,account);
 history.shiftInspectionSnapshots(expected,index,delta);shiftCounterAliases(expected,delta);
 if(deleteRow){
  for(const inspection of expected.bitacora_inspecciones)if(inspection.hour_offset>index)inspection.hour_offset--;
  for(const reset of expected.bitacora_reinicios_inspeccion){const offset=history.effectiveOffset(reset);if(offset!==null&&offset>index)reset.effective_hour_offset=offset-1;}
  for(const adjustment of expected.bitacora_ajustes_inspeccion){const offset=history.effectiveOffset(adjustment);if(offset!==null&&offset>index)adjustment.effective_hour_offset=offset-1;}
  expected.bitacora_horas.splice(index,1);
 }else expected.bitacora_horas[index].hv=newLogs[index].hv;
 history.rebuild(expected);
 if(reconciledLegacy){
  assertHistoryIntent(expected,aircraft);
  aircraft.bitacora_horas=expected.bitacora_horas;aircraft.bitacora_inspecciones=expected.bitacora_inspecciones;aircraft.bitacora_ajustes_inspeccion=expected.bitacora_ajustes_inspeccion;
  for(const [limit,alias]of [[50,'horas_totales'],[100,'horas_limite']]){aircraft['horas_acum_'+limit]=expected['horas_acum_'+limit];aircraft[alias]=expected[alias];}
 }else{aircraft.bitacora_ajustes_inspeccion=expected.bitacora_ajustes_inspeccion;assertRebuiltHistory(expected,aircraft);}
}
function protect(before={},after={},account={}){
 const oldFleet=before.fleet||{},newFleet=after.fleet||{};
 for(const [key,oldAircraft]of Object.entries(oldFleet)){
  const oldEvents=list(oldAircraft?.bitacora_reinicios_inspeccion),oldAdjustments=adjustmentRows(oldAircraft?.bitacora_ajustes_inspeccion);
  if((oldEvents.length||oldAdjustments.length)&&!Object.hasOwn(newFleet,key))throw Error('No se puede eliminar un avión con historial de inspecciones.');
 }
 for(const [key,aircraft]of Object.entries(newFleet)){
  const oldAircraft=oldFleet[key]||{},oldEvents=list(oldAircraft.bitacora_reinicios_inspeccion),events=list(aircraft?.bitacora_reinicios_inspeccion);
  const oldAdjustments=adjustmentRows(oldAircraft.bitacora_ajustes_inspeccion),submittedAdjustments=adjustmentRows(aircraft?.bitacora_ajustes_inspeccion),oldLogs=rows(oldAircraft.bitacora_horas),newLogs=rows(aircraft?.bitacora_horas),deletedForAdjustments=history.findDeletedLogIndex(oldLogs,newLogs),allowedAdjustments=oldAdjustments.map(record=>({...record}));
  if(deletedForAdjustments!==null)for(const event of allowedAdjustments){const offset=history.effectiveOffset(event);if(offset!==null&&offset>deletedForAdjustments)event.effective_hour_offset=offset-1;}
  if(!isDeepStrictEqual(allowedAdjustments,submittedAdjustments))throw Error('El historial de ajustes de inspección no puede editarse desde el cliente.');
  const logHistoryChanged=!isDeepStrictEqual(oldLogs,newLogs);
  protectHistoricalHourChanges(oldAircraft,aircraft,account);
  if(events.length>oldEvents.length&&account.role!=='Director')throw Error('Solo el Director puede registrar reinicios de inspección.');
  if(events.length<oldEvents.length)throw Error('El historial de reinicios de inspección es permanente y no se puede modificar ni eliminar.');
  const deletedIndex=deletedForAdjustments;
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
  if(!logHistoryChanged&&events.length===oldEvents.length)captureManualAdjustment(oldAircraft,aircraft,account);
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
