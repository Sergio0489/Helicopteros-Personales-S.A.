(function(root){
'use strict';

const array=value=>Array.isArray(value)?value:[];
const asCents=value=>{
 const number=Number(value??0);
 if(!Number.isFinite(number)||number<0)throw Error('El acumulado de horas no es válido.');
 const cents=Math.round(number*100);
 if(!Number.isSafeInteger(cents))throw Error('El acumulado de horas excede el rango permitido.');
 return cents;
};
const asHours=cents=>(cents/100).toFixed(2);
const signedCents=value=>{const number=Number(value);if(!Number.isFinite(number))throw Error('El ajuste de horas no es válido.');const cents=Math.round(number*100);if(!Number.isSafeInteger(cents))throw Error('El ajuste de horas excede el rango permitido.');return cents;};
function effectiveOffset(event){
 const value=event?.effective_hour_offset??event?.hour_offset;
 return Number.isInteger(value)&&value>=0?value:null;
}
function panamaTimestamp(event){
 if(event?.createdAt){const value=Date.parse(event.createdAt);if(Number.isFinite(value))return value;}
 const date=String(event?.fecha||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 const time=String(event?.hora||'').toLowerCase().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)/);
 if(!date||!time)return null;
 let hour=Number(time[1])%12;if(time[4].startsWith('p'))hour+=12;
 return Date.UTC(Number(date[3]),Number(date[2])-1,Number(date[1]),hour+5,Number(time[2]),Number(time[3]||0));
}
function compareEvents(a,b){
 if(a.offset!==b.offset)return a.offset-b.offset;
 const at=panamaTimestamp(a.record),bt=panamaTimestamp(b.record);
 if(at!==null&&bt!==null&&at!==bt)return at-bt;
 const ak=a.kind==='anchor'?'inspection':a.kind,bk=b.kind==='anchor'?'inspection':b.kind;
 if(ak!==bk)return ak==='inspection'?-1:1;
 return a.index-b.index;
}
function inspectionEvents(aircraft){
 return array(aircraft.bitacora_inspecciones).map((record,index)=>({kind:'inspection',record,index,offset:record.hour_offset})).filter(event=>Number.isInteger(event.offset)&&event.offset>=0);
}
function timelineEvents(aircraft,limit){
 const inspections=inspectionEvents(aircraft);
 const manual=array(aircraft.bitacora_reinicios_inspeccion).map((record,index)=>({kind:'manual',record,index,offset:effectiveOffset(record)})).filter(event=>Number(event.record.limitHours)===limit&&Number.isInteger(event.offset));
 return [...inspections,...manual].sort(compareEvents);
}
function resetEvents(aircraft,limit){
 return timelineEvents(aircraft,limit).filter(event=>event.kind==='manual'||(limit===50?[50,100].includes(Number(event.record.tipo)):Number(event.record.tipo)===100));
}
function snapshotValue(event,limit){
 if(event.kind==='inspection')return event.record['before'+limit];
 return Number(event.record.limitHours)===limit?event.record.before:undefined;
}
function candidateAnchors(aircraft,limit,extraAnchors){
 const candidates=[];
 for(const event of inspectionEvents(aircraft)){
  const value=snapshotValue(event,limit);
  if(value!==undefined&&value!==null&&value!==''&&Number.isInteger(event.offset))candidates.push({...event,baseline:asCents(value)});
 }
 for(const event of array(aircraft.bitacora_reinicios_inspeccion).map((record,index)=>({kind:'manual',record,index,offset:effectiveOffset(record)}))){
  if(Number(event.record.limitHours)===limit&&event.offset!==null&&event.record.before!==undefined)candidates.push({...event,baseline:asCents(event.record.before)});
 }
 for(const item of extraAnchors){
  const record=item?.record||item,offset=Number(record?.hour_offset),value=record?.['before'+limit],index=Number.isInteger(item?.index)?item.index:Number.MAX_SAFE_INTEGER;
  if(Number.isInteger(offset)&&offset>=0&&value!==undefined&&value!==null&&value!=='')candidates.push({kind:'anchor',record,index,offset,baseline:asCents(value)});
 }
 return candidates.sort(compareEvents);
}
function logHours(logs,index){return asCents(logs[index]?.hv??0);}
function replayLimit(aircraft,limit,extraAnchors=[]){
 const logs=array(aircraft.bitacora_horas),events=timelineEvents(aircraft,limit),candidates=candidateAnchors(aircraft,limit,extraAnchors);
 let anchor=candidates[0],startOffset=0,balance=0,anchorEvent=anchor;
 if(anchor){
  startOffset=anchor.offset;
  if(startOffset>logs.length)throw Error('La posición del historial de inspecciones no coincide con la bitácora de horas.');
  balance=anchor.baseline;
 }else{
  if(events.length)throw Error('No se puede reconstruir el saldo inicial de inspecciones. Revisa el historial.');
  const field='horas_acum_'+limit,alias=limit===50?aircraft.horas_totales:aircraft.horas_limite,raw=aircraft[field],existing=asCents(raw==null||raw===''?alias:raw),sum=logs.reduce((total,_,index)=>total+logHours(logs,index),0);
  if(existing<sum)throw Error('No se puede reconstruir el saldo inicial de inspecciones. Revisa la bitácora histórica.');
  balance=existing-sum;
 }
 const applyEvent=event=>{
  if(event.kind==='inspection'){
   event.record['before'+limit]=asHours(balance);
   if(limit===50||Number(event.record.tipo)===100)balance=0;
  }else balance=0;
 };
 let cursor=startOffset;
 for(let boundary=startOffset;boundary<=logs.length;boundary++){
  const atBoundary=events.filter(event=>event.offset===boundary&&(!anchorEvent||compareEvents(event,anchorEvent)>=0));
  for(const event of atBoundary){
   if(boundary>cursor){for(let i=cursor;i<boundary;i++)balance+=logHours(logs,i);cursor=boundary;}
   applyEvent(event);
  }
  if(boundary<logs.length){balance+=logHours(logs,boundary);if(limit===100)logs[boundary].acum=asHours(balance);cursor=boundary+1;}
 }
 if(cursor<logs.length){for(let i=cursor;i<logs.length;i++){balance+=logHours(logs,i);if(limit===100)logs[i].acum=asHours(balance);}}
 aircraft['horas_acum_'+limit]=asHours(balance);
 return balance;
}
function rebuild(aircraft,{anchors=[]}={}){
 if(!aircraft||typeof aircraft!=='object')throw Error('La aeronave no es válida.');
 aircraft.bitacora_horas=Array.isArray(aircraft.bitacora_horas)?aircraft.bitacora_horas:[];
 aircraft.bitacora_inspecciones=Array.isArray(aircraft.bitacora_inspecciones)?aircraft.bitacora_inspecciones:[];
 aircraft.bitacora_reinicios_inspeccion=Array.isArray(aircraft.bitacora_reinicios_inspeccion)?aircraft.bitacora_reinicios_inspeccion:[];
 for(const event of [...inspectionEvents(aircraft),...aircraft.bitacora_reinicios_inspeccion.map(record=>({record,offset:effectiveOffset(record)}))])if(!Number.isInteger(event.offset)||event.offset<0||event.offset>aircraft.bitacora_horas.length)throw Error('La posición del historial de inspecciones no coincide con la bitácora de horas.');
 replayLimit(aircraft,50,anchors);replayLimit(aircraft,100,anchors);
 aircraft.horas_totales=aircraft.horas_acum_50;aircraft.horas_limite=aircraft.horas_acum_100;
 return aircraft;
}
function resetPrecedesInspection(reset,inspection){
 if(reset.offset!==inspection.offset)return reset.offset<inspection.offset;
 return compareEvents(reset,inspection)<0;
}
function shiftInspectionSnapshots(aircraft,logIndex,deltaHours){
 const delta=signedCents(deltaHours);if(!delta)return;
 for(const limit of [50,100]){
  const resets=resetEvents(aircraft,limit);
  for(const inspection of inspectionEvents(aircraft)){
   if(inspection.offset<=logIndex)continue;
   const resetBetween=resets.some(reset=>reset.offset>logIndex&&(reset.offset<inspection.offset||resetPrecedesInspection(reset,inspection)));
   if(resetBetween)continue;
   const field='before'+limit,current=asCents(inspection.record[field]??0),next=current+delta;
   if(next<0)throw Error('La corrección dejaría un acumulado histórico negativo. Revisa las lecturas.');
   inspection.record[field]=asHours(next);
  }
 }
}
function findDeletedLogIndex(beforeRows,afterRows){
 const before=array(beforeRows),after=array(afterRows);if(before.length!==after.length+1)return null;
 const withoutAccum=row=>{const {acum,...rest}=row||{};return rest;},matches=[];
 for(let index=0;index<before.length;index++){
  let same=true;
  for(let i=0;i<index&&same;i++)same=JSON.stringify(withoutAccum(before[i]))===JSON.stringify(withoutAccum(after[i]));
  for(let i=index+1;i<before.length&&same;i++)same=JSON.stringify(withoutAccum(before[i]))===JSON.stringify(withoutAccum(after[i-1]));
  if(same)matches.push(index);
 }
 if(matches.length===1)return matches[0];
 const ids=before.map((row,index)=>({index,id:row?.registryId||row?.tac_id||row?.id})).filter(item=>item.id!==undefined&&item.id!==null);
 if(ids.length===before.length&&new Set(ids.map(item=>String(item.id))).size===before.length){
  const afterIds=new Set(after.map(row=>String(row?.registryId||row?.tac_id||row?.id)));
  const removed=ids.filter(item=>!afterIds.has(String(item.id)));
  if(removed.length===1)return removed[0].index;
 }
 return null;
}
function stripEffectiveOffset(event){const {effective_hour_offset,...rest}=event||{};return rest;}
const api={asCents,asHours,effectiveOffset,resetEvents,rebuild,shiftInspectionSnapshots,findDeletedLogIndex,stripEffectiveOffset};
if(typeof module==='object'&&module.exports)module.exports=api;
root.HPInspectionHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this);
