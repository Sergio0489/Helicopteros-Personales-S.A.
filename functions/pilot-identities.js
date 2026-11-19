'use strict';

const {randomUUID}=require('node:crypto');
const list=value=>Array.isArray(value)?value:[];
const legacyId=value=>/^legacy-pilot-\d+$/.test(String(value||''));
const normalized=(value,mode)=>{
 const text=String(value||'').trim();if(!text)return '';
 if(mode==='email')return text.toLowerCase();
 if(mode==='identity')return text.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
 if(mode==='name')return text.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 return text.normalize('NFKC').toUpperCase().replace(/\s+/g,' ');
};
const keys=[['authUid','plain'],['identity','identity'],['email','email'],['numeroLicencia','plain'],['name','name']];
const value=(pilot,key)=>key==='name'?pilot?.nombre||pilot?.name||'':pilot?.[key];
const sameWithoutId=(a,b)=>{const left={...a},right={...b};delete left.id;delete right.id;return JSON.stringify(left)===JSON.stringify(right);};
function assertUniqueIds(pilots,label){
 const seen=new Set();for(const pilot of list(pilots)){const id=String(pilot?.id||'');if(!id)continue;if(seen.has(id))throw Error('Hay identificadores de piloto duplicados en '+label+'. Revisa los expedientes antes de migrar.');seen.add(id);}
}
function uniquePairs(oldRows,newRows){
 const oldLeft=new Set(oldRows.map((_,i)=>i)),newLeft=new Set(newRows.map((_,i)=>i)),pairs=[];
 for(const [field,mode]of keys){
  const oldBy=new Map(),newBy=new Map();
  for(const i of oldLeft){const k=normalized(value(oldRows[i],field),mode);if(k){if(!oldBy.has(k))oldBy.set(k,[]);oldBy.get(k).push(i);}}
  for(const i of newLeft){const k=normalized(value(newRows[i],field),mode);if(k){if(!newBy.has(k))newBy.set(k,[]);newBy.get(k).push(i);}}
  for(const [k,oldIndices]of oldBy){const newIndices=newBy.get(k);if(oldIndices.length!==1||newIndices?.length!==1)continue;const oldIndex=oldIndices[0],newIndex=newIndices[0];if(field==='name'&&!sameWithoutId(oldRows[oldIndex],newRows[newIndex]))continue;pairs.push([oldIndex,newIndex]);oldLeft.delete(oldIndex);newLeft.delete(newIndex);}
 }
 return {pairs,oldLeft,newLeft};
}
function pilotReferences(oldRows,oldToId){
 const ids=new Map(),names=new Map();
 const add=(map,key,id)=>{if(!key||!id)return;const values=map.get(key)||new Set();values.add(String(id));map.set(key,values);};
 for(let i=0;i<oldRows.length;i++){
  const pilot=oldRows[i],id=oldToId.get(i)||(!legacyId(pilot?.id)?String(pilot?.id||''):'');
  if(!id)continue;
  add(ids,String(pilot?.id||'legacy-pilot-'+i),id);if(!pilot?.id)add(ids,'legacy-pilot-'+i,id);
 }
 for(let i=0;i<oldRows.length;i++){const name=normalized(oldRows[i]?.nombre||oldRows[i]?.name,'name');if(name){if(!names.has(name))names.set(name,[]);names.get(name).push(i);}}
 const pilotIdMap=Object.fromEntries([...ids].filter(([,values])=>values.size===1).map(([ref,values])=>[ref,[...values][0]])),pilotNameMap={};
 for(const [name,indices]of names)if(indices.length===1){const i=indices[0],id=oldToId.get(i)||(!legacyId(oldRows[i]?.id)?String(oldRows[i]?.id||''):'');if(id)pilotNameMap[name]=id;}
 return {pilotIdMap,pilotNameMap};
}
function pilotIdentity(before,after,makeId=randomUUID){
 const oldRows=list(before.pilotos),newRows=list(after.pilotos);assertUniqueIds(oldRows,'anteriores');assertUniqueIds(newRows,'actuales');
 const oldStable=new Map(oldRows.map((p,i)=>[String(p?.id||''),i]).filter(([id])=>id&&!legacyId(id)));
 const newStable=new Map(newRows.map((p,i)=>[String(p?.id||''),i]).filter(([id])=>id&&!legacyId(id)));
 const pairs=[],usedOld=new Set(),usedNew=new Set();
 for(const [id,oldIndex]of oldStable){const newIndex=newStable.get(id);if(newIndex!==undefined){pairs.push([oldIndex,newIndex]);usedOld.add(oldIndex);usedNew.add(newIndex);}}
 // An existing permanent ID is part of the dossier's identity. Do not accept
 // a replacement ID on a row that can still be matched to that dossier.
 const remainingOldStable=oldRows.map((p,i)=>i).filter(i=>oldRows[i]?.id&&!legacyId(oldRows[i].id)&&!usedOld.has(i));
 const remainingNew=newRows.map((p,i)=>i).filter(i=>!usedNew.has(i));
 if(remainingOldStable.length&&remainingNew.length){
  const possible=uniquePairs(remainingOldStable.map(i=>oldRows[i]),remainingNew.map(i=>newRows[i])).pairs;
  if(possible.length)throw Error('No se puede cambiar el identificador permanente de un expediente de piloto.');
 }
 const oldLegacy=oldRows.map((p,i)=>i).filter(i=>(!oldRows[i]?.id||legacyId(oldRows[i].id))&&!usedOld.has(i));
 const newLegacyCandidates=newRows.map((p,i)=>i).filter(i=>!usedNew.has(i));
 const matched=uniquePairs(oldLegacy.map(i=>oldRows[i]),newLegacyCandidates.map(i=>newRows[i]));
 for(const [oldLocal,newLocal]of matched.pairs){const oldIndex=oldLegacy[oldLocal],newIndex=newLegacyCandidates[newLocal];pairs.push([oldIndex,newIndex]);usedOld.add(oldIndex);usedNew.add(newIndex);}
 if(matched.oldLeft.size&&matched.newLeft.size){
  // Identical unchanged snapshots can be assigned IDs once without guessing
  // which person moved. Other ambiguous edits wait for an explicit identity key.
  const unchanged=JSON.stringify(oldRows)===JSON.stringify(newRows);
  if(unchanged){for(const oldIndex of matched.oldLeft){const newIndex=oldIndex;if(matched.newLeft.has(newLegacyCandidates.indexOf(newIndex))){pairs.push([oldIndex,newIndex]);usedOld.add(oldIndex);usedNew.add(newIndex);}}}
  else throw Error('No se pudo vincular sin ambigüedad un expediente antiguo. Guarda la migración de identidad antes de cambiar, reordenar o eliminar ese piloto.');
 }
 const oldToId=new Map(),oldNameToIds=new Map();
 for(const [oldIndex,newIndex]of pairs){
  const oldPilot=oldRows[oldIndex],newPilot=newRows[newIndex];
  if(oldPilot.id&&!legacyId(oldPilot.id)&&String(oldPilot.id)!==String(newPilot.id||''))throw Error('No se puede cambiar el identificador permanente de un expediente de piloto.');
  if(!newPilot.id||legacyId(newPilot.id))newPilot.id=makeId();
  const id=String(newPilot.id);oldToId.set(oldIndex,id);
  const name=normalized(oldPilot.nombre||oldPilot.name,'name');if(name){if(!oldNameToIds.has(name))oldNameToIds.set(name,[]);oldNameToIds.get(name).push(id);}
 }
 for(const pilot of newRows)if(!pilot.id||legacyId(pilot.id))pilot.id=makeId();
 assertUniqueIds(newRows,'actuales');
 const currentByName=new Map();for(const pilot of newRows){const name=normalized(pilot.nombre||pilot.name,'name');if(name){if(!currentByName.has(name))currentByName.set(name,[]);currentByName.get(name).push(String(pilot.id));}}
 const oldByName=new Map();for(let i=0;i<oldRows.length;i++){const p=oldRows[i],name=normalized(p.nombre||p.name,'name'),id=oldToId.get(i)||(legacyId(p.id)?'':String(p.id||''));if(name&&id){if(!oldByName.has(name))oldByName.set(name,[]);oldByName.get(name).push(id);}}
 const findName=(name)=>{const key=normalized(name,'name');if(!key)return '';const old=oldByName.get(key)||[],current=currentByName.get(key)||[];const matches=old.length?old:current;return matches.length===1?matches[0]:'';};
 function migrateRecords(rows){for(const record of list(rows)){
  const id=String(record?.pilotId||'');if(id&&!legacyId(id))continue;
  const matchedId=findName(record?.pilot);if(matchedId)record.pilotId=matchedId;
 }}
 migrateRecords(after.school?.honorarios?.records);migrateRecords(after.school?.registry?.entries);
 const refs=after.school?.userProfiles||{};for(const [uid,profile]of Object.entries(refs))if(profile?.dossier?.kind==='pilot'&&legacyId(profile.dossier.id)){
  const matches=newRows.filter(p=>String(p.authUid||'')===String(uid));if(matches.length===1)profile.dossier.id=String(matches[0].id);
 }
 return {changed:JSON.stringify(oldRows)!==JSON.stringify(newRows),pilots:newRows,...pilotReferences(oldRows,oldToId)};
}
module.exports={pilotIdentity,legacyId,normalized};

