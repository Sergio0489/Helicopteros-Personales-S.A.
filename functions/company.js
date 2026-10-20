'use strict';
(function(root){
 const clone=v=>JSON.parse(JSON.stringify(v));
 const defaults={people:[
  {id:'manager',role:'Gerente General / Administrador responsable',name:'Por asignar',parent:''},
  {id:'director',role:'Director de Operaciones / Jefe de Pilotos',name:'Por asignar',parent:'manager'},
  {id:'deputy',role:'Asistente del Director de Operaciones',name:'Por asignar',parent:'director'},
  {id:'maintenance',role:'Director de Mantenimiento',name:'Por asignar',parent:'director'},
  {id:'instruction',role:'Jefe de Instrucción',name:'Por asignar',parent:'director'}
 ],certificates:[{id:'operation',name:'Certificado de Operación'},{id:'exploitation',name:'Certificado de Explotación'}],courses:[],institution:[
  {id:'name',label:'Razón social y comercial',value:'Helicópteros Personales, S.A.'},
  {id:'base',label:'Base de operaciones',value:'Aeropuerto Internacional Marcos A. Gelabert, Hangar 19A, Vía Diógenes de la Rosa, Albrook, corregimiento de Ancón.'},
  {id:'service',label:'Servicios',value:'Transporte aéreo no regular de pasajeros, correo y carga, en modalidad de taxi aéreo.'}
 ],note:''};
 function value(school){const v=clone({...defaults,...school?.charter?.information});if(v.certificatesEmpty)v.certificates=[];return v;}
 function people(data){return [
  ...(data.school?.personnel||[]).map(p=>({kind:'personnel',id:p.id,name:p.name})),
  ...(data.pilotos||[]).map(p=>({kind:'pilot',id:p.id,name:p.nombre})),
  ...(data.school?.students||[]).map(p=>({kind:'student',id:p.id,name:p.name}))
 ].filter(p=>p.name).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));}
 function resolve(row,data){const ref=row.personRef;return ref?people(data).find(p=>p.kind===ref.kind&&p.id===ref.id)?.name||row.name:row.name;}
 // Materialize names before projecting permissions, without exposing source dossiers.
 function project(data){if(!data.school)return data;const names=new Map(people(data).map(p=>[p.kind+':'+p.id,p.name]));const info=value=>value?{...value,people:(value.people||[]).map(row=>row.personRef?{...row,name:names.get(row.personRef.kind+':'+row.personRef.id)||row.name}:row)}:value;const out={...data,school:{...data.school}};if(data.school.information)out.school.information=info(data.school.information);if(data.school.charter)out.school.charter={...data.school.charter,...(data.school.charter.information?{information:info(data.school.charter.information)}:{})};return out;}
 const fields=['authUid','directoryKind','id','name','identity','peso','estatura','birthDate','nationality','address','celular','email','emergencyName','emergencyPhone','fechaInicioHP','position','notes'];
 function validateChanges(before,after){
  const school=typeof module==='object'&&module.exports?require('./school-information'):root.HPSchoolInformation;
  const cert=typeof module==='object'&&module.exports?require('./school-certificates'):root.HPSchoolCertificates;
  if(JSON.stringify(before.school?.charter)!==JSON.stringify(after.school?.charter)){
   const v=value(after.school);school.validate(v,true);
   cert.validateChanges({school:{certificates:before.school?.charter?.certificates}},{school:{information:v,certificates:after.school?.charter?.certificates||{}}});
  }
  if(JSON.stringify(before.school?.personnel)===JSON.stringify(after.school?.personnel))return;
  const rows=after.school?.personnel||[];if(!Array.isArray(rows)||rows.length>2000)throw Error('Directorio de personal no válido.');
  const ids=new Set(),emails=new Set();for(const row of rows){
   if(!row||Object.keys(row).some(k=>!fields.includes(k))||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Expediente de personal no válido.');ids.add(row.id);
   for(const [k,v]of Object.entries(row))if(typeof v!=='string'||v.length>2000)throw Error('Revisa la información del personal.');
   if(!row.name?.trim())throw Error('Ingresa el nombre del colaborador.');
   for(const k of ['birthDate','fechaInicioHP'])if(row[k]&&!Number.isFinite(cert.day(row[k])))throw Error('Revisa la fecha.');
   if(row.birthDate&&row.birthDate>cert.today())throw Error('La fecha de nacimiento no puede estar en el futuro.');
   for(const k of ['peso','estatura'])if(row[k]&&(!Number.isFinite(Number(row[k]))||Number(row[k])<=0))throw Error('Peso y estatura deben ser mayores que cero.');
   const email=(row.email||'').trim().toLowerCase();if(email&&(emails.has(email)||!/^\S+@\S+\.\S+$/.test(email)))throw Error('Revisa el correo: debe ser válido y no repetirse en el personal.');if(email)emails.add(email);
  }
 }
 const api={defaults,value,people,resolve,project,fields,validateChanges};if(typeof module==='object'&&module.exports)module.exports=api;else root.HPCompany=api;
})(typeof globalThis==='undefined'?this:globalThis);
