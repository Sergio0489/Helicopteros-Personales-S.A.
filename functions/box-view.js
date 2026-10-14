'use strict';
const {catalog,permissions,normalize,aircraftAllowed}=require('./boxes');
const {boxFor,allowed}=require('./box-write');
const {nativeView}=require('./native-view');
const clone=v=>JSON.parse(JSON.stringify(v));
function filterTree(value,path,data,test){
 if(value===null||typeof value!=='object')return test(path)?value:undefined;
 const out=Array.isArray(value)?[]:{};
 for(const [key,v]of Object.entries(value)){const found=filterTree(v,[...path,key],data,test);if(found!==undefined)out[key]=found;}
 if(Array.isArray(value)){if(!out.some(v=>v!==undefined))return undefined;return out.map(v=>v??{});}
 if(!Object.keys(out).length)return test(path)?{}:undefined;
 if(value.id!==undefined)out.id=value.id;
 return out;
}
function merge(a,b){if(b===undefined)return a;if(!a||typeof a!=='object'||!b||typeof b!=='object')return b;if(Array.isArray(b)){if(!Array.isArray(a))return b;const out=a.slice();b.forEach((v,i)=>{const j=v?.id!=null?out.findIndex(x=>x?.id===v.id):i;if(j<0)out.push(v);else out[j]=merge(out[j],v);});return out;}const out={...a};for(const k of Object.keys(b))out[k]=merge(out[k],b[k]);return out;}
function boxView(data,account,rawPolicy,page){
 const policy=normalize(rawPolicy),base=nativeView(data,account,policy,page);
 const fine=filterTree(base.data,[],base.data,path=>{const pair=boxFor(path,base.data);if(!pair||pair[0]!==page)return true;return allowed(policy,path,base.data,'view');})||{};
 if(page==='horario'){fine.itinerarios=(fine.itinerarios||[]).filter(f=>aircraftAllowed(policy,f.aeronave));return {...base,data:fine,policy,boxes:policy[page]?.boxes||{},editable:false};}
 // Include editable source records only when this role has explicit view access to them.
 const sources=clone(data);delete sources.undoFleet;if(sources.school)delete sources.school.paymentReceiverNames;
 if(account.role==='Estudiante'){
  sources.school ||= {};sources.school.students=(sources.school.students||[]).filter(p=>account.recordKind==='student'&&account.syncStatus==='matched'&&p.id===account.recordId);
  sources.pilotos=[];sources.itinerarios=[];
  sources.school.registry ||= {};sources.school.registry.clients=(sources.school.registry.clients||[]).filter(p=>account.recordKind==='client'&&account.syncStatus==='matched'&&p.id===account.recordId);
  const own=account.syncStatus==='matched'?account.recordKind+':'+account.recordId:null;
  sources.school.registry.entries=(sources.school.registry.entries||[]).filter(e=>own===e.personKind+':'+e.personId);
  sources.school.registry.deletedEntries=[];sources.school.deletedStudents=[];
  sources.school.paymentReceipts=(sources.school.paymentReceipts||[]).filter(r=>r.personKey===own);
  sources.school.balanceAlertDismissals=Object.fromEntries(Object.entries(sources.school.balanceAlertDismissals||{}).filter(([key])=>key===own));
 }
 const visible=filterTree(sources,[],sources,path=>allowed(policy,path,sources,'view'))||{};
 return {...base,data:merge(fine,visible),policy,boxes:policy[page]?.boxes||{},editable:Object.values(policy[page]?.boxes||{}).some(b=>b.edit)};
}
module.exports={boxView};
