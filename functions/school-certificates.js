'use strict';
(function(root){
 const certificates=[
  {id:'exploitation',name:'Certificado de Explotación'},
  {id:'operation',name:'Certificado de Operación'},
  {id:'simulator',name:'Certificado de Simulador'}
 ];
 function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return y>=1900&&date.toISOString().slice(0,10)===value?date.getTime()/86400000:NaN;
 }
 function today(now=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 function status(expiry,at=today()){
  if(!expiry)return {level:'empty',days:null,label:'Sin fecha registrada'};
  const days=day(expiry)-day(at);
  if(!Number.isFinite(days))return {level:'invalid',days:null,label:'Revisar fecha'};
  return {days,level:days<0?'danger':days<=60?'orange':days<=90?'warn':'ok',label:days<0?'Vencido hace '+Math.abs(days)+' día'+(days===-1?'':'s'):days===0?'Vence hoy':'Vence en '+days+' día'+(days===1?'':'s')};
 }
 const catalog=information=>information?.certificatesEmpty?[]:information?.certificates||certificates;
 function alerts(data,at=today(),information){
  return catalog(information).map(c=>({...c,date:data?.[c.id]?.expiresOn||'',...status(data?.[c.id]?.expiresOn,at)})).filter(c=>['warn','orange','danger'].includes(c.level));
 }
 function validateChanges(before,after){
  const previous=before.school?.certificates,next=after.school?.certificates;
  if(JSON.stringify(previous)===JSON.stringify(next))return;
  if(!next||typeof next!=='object'||Array.isArray(next))throw Error('Certificados de la escuela no válidos.');
  for(const [id,value]of Object.entries(next)){
   if(!catalog(after.school?.information).some(c=>c.id===id)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='expiresOn'))throw Error('Certificado de la escuela no válido.');
   if(typeof value.expiresOn!=='string'||value.expiresOn!==''&&!Number.isFinite(day(value.expiresOn)))throw Error('Ingresa una fecha de vencimiento válida.');
  }
 }
 const api={catalog,certificates,day,today,status,alerts,validateChanges};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HPSchoolCertificates=api;
})(typeof globalThis==='undefined'?this:globalThis);

