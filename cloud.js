'use strict';
const ADMIN_UID='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
let cloudETag=null,cloudVersion=0,cloudBusy=false,cloudBlocked=false,appLoaded=false,importData=null;
const el=id=>document.getElementById(id);
function accessMessage(text){el('access-message').textContent=text;}
function setCloudStatus(text){
 const warning=cloudBlocked||/no se pudo|denegado|otro equipo|antes de guardar|error|unavailable/i.test(text);
 const saving=/guardando/i.test(text);
 const state=warning?'error':navigator.onLine===false?'offline':saving?'saving':'online';
 const label=state==='error'?'Revisar conexión':state==='offline'?'Sin conexión':saving?'Guardando…':/guardado/i.test(text)?'Guardado':'Conectado';
 el('preview-save').textContent=label;el('cloud-connection').dataset.state=state;el('cloud-connection').title=text;
 el('cloud-status-detail').textContent=warning?text:'';el('cloud-status-detail').hidden=!warning;
}
function showCloudError(error){setCloudStatus(error.message||'No se pudo guardar.');}
window.showCloudError=showCloudError;
async function cloudRequest(method,body,etag){
 const user=firebase.auth().currentUser;
 if(!user||user.uid!==ADMIN_UID)throw Error('Inicia sesión con el usuario autorizado.');
 const token=await user.getIdToken();
 const url=new URL(window.FIREBASE_CONFIG.databaseURL.replace(/\/$/,'')+'/dashboard.json');url.searchParams.set('auth',token);
 const headers={'X-Firebase-ETag':'true'};if(etag)headers['if-match']=etag;if(body)headers['Content-Type']='application/json';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});
  if(response.status===412)throw Error('Hay cambios guardados desde otro equipo. Descarga un respaldo y pulsa Actualizar datos antes de continuar.');
  if(!response.ok)throw Error(response.status===401||response.status===403?'Acceso denegado. Revisa las reglas de Firebase y el usuario autorizado.':'Firebase no pudo completar la operación.');
  return {value:await response.json(),etag:response.headers.get('ETag')};
 }catch(error){if(error.name==='AbortError')throw Error('No se pudo confirmar el guardado. Actualiza los datos antes de volver a guardar.');throw error;}finally{clearTimeout(timer);}
}
window.cloudWrite=async function(data){
 if(cloudBusy)throw Error('Espera a que termine el guardado actual.');
 if(cloudBlocked||!cloudETag)throw Error('Actualiza los datos antes de guardar para evitar sobrescribir cambios.');
 cloudBusy=true;el('dashboard-app').inert=true;el('cloud-busy').hidden=false;
 setCloudStatus('Guardando en Firebase…');
 const operation=crypto.randomUUID();
 const envelope={schemaVersion:1,revision:cloudVersion+1,operation,updatedAt:new Date().toISOString(),updatedBy:ADMIN_UID,payload:JSON.stringify(data)};
 try{
  const result=await cloudRequest('PUT',envelope,cloudETag);
  window.failedCloudData=null;cloudVersion=envelope.revision;cloudETag=result.etag;
  if(!cloudETag){
    // Never replace a newer snapshot silently while obtaining the next ETag.
    try{const latest=await cloudRequest('GET');if(latest.value?.operation===operation)cloudETag=latest.etag;}catch{}
  }
  cloudBlocked=!cloudETag;
  setCloudStatus(cloudBlocked?'Guardado confirmado. Actualiza antes de seguir editando.':'✓ Guardado en Firebase');
  return true;
 }catch(error){window.failedCloudData=structuredClone(data);cloudBlocked=true;showCloudError(error);throw error;}
 finally{cloudBusy=false;el('dashboard-app').inert=false;el('cloud-busy').hidden=true;}
};
function validateBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||!data.fleet||typeof data.fleet!=='object'||Array.isArray(data.fleet))throw Error('El archivo no es un respaldo del dashboard.');
 if(data.pilotos!=null&&!Array.isArray(data.pilotos))throw Error('La lista de pilotos no es válida.');
 if(data.itinerarios!=null&&!Array.isArray(data.itinerarios))throw Error('La lista de itinerarios no es válida.');
 const allowed=new Set(['HP_1784','HP_1819','HP_1930','HP_1815','HP_1579','HP_1907','HP_880BL','HP_18BLM','HP1186','HP_1805BLM','HP_11BL']);
 for(const [key,value]of Object.entries(data.fleet))if(!allowed.has(key)||!value||typeof value!=='object'||Array.isArray(value))throw Error('El respaldo contiene una aeronave no reconocida: '+key);
 const school=data.school||{version:1,students:[],rates:{},intakes:[],brochureUrl:''};
 if(typeof school!=='object'||Array.isArray(school)||!Array.isArray(school.students)||!Array.isArray(school.intakes)||!school.rates||typeof school.rates!=='object'||Array.isArray(school.rates))throw Error('El registro de estudiantes del respaldo no es válido.');
 for(const student of school.students){
  if(!student||typeof student.id!=='string'||typeof student.name!=='string'||!Array.isArray(student.courses))throw Error('El respaldo contiene un expediente de estudiante no válido.');
  for(const course of student.courses)if(!course||!['privado','comercial','ifr','multimotor','rpa','instructor'].includes(course.type)||!Array.isArray(course.payments)||!Array.isArray(course.flights))throw Error('El respaldo contiene un curso de estudiante no válido.');
 }
 return {fleet:data.fleet,pilotos:data.pilotos||[],itinerarios:data.itinerarios||[],undoFleet:data.undoFleet||{},school};
}
async function openDashboard(data){
 window.CLOUD_INITIAL=validateBackup(data);
 window.DASHBOARD_READY=false;
 const script=document.createElement('script');script.src='dashboard.js?v=20261009-21';
 await new Promise((resolve,reject)=>{script.onload=()=>window.DASHBOARD_READY?resolve():reject(Error('El dashboard no terminó de cargar. Recarga la página; los datos guardados se conservan.'));script.onerror=()=>reject(Error('No se pudo cargar el dashboard. Recarga la página.'));document.body.appendChild(script);});
 window.STUDENTS_READY=false;
 const schoolScript=document.createElement('script');schoolScript.src='students.js?v=20261009-1';
 await new Promise((resolve,reject)=>{schoolScript.onload=()=>window.STUDENTS_READY?resolve():reject(Error('El panel de estudiantes no terminó de cargar. Recarga la página.'));schoolScript.onerror=()=>reject(Error('No se pudo cargar Estudiantes. Recarga la página.'));document.body.appendChild(schoolScript);});
 appLoaded=true;el('access-screen').hidden=true;el('dashboard-app').hidden=false;
 setCloudStatus('Conectado a Firebase · Datos cargados');
}
async function refreshCloud(){
 const result=await cloudRequest('GET');cloudETag=result.etag;cloudVersion=result.value?.revision||0;
 if(!cloudETag)throw Error('No se pudo verificar la versión de los datos. Recarga la página.');
 if(result.value){if(result.value.schemaVersion!==1||typeof result.value.payload!=='string')throw Error('Formato de base de datos no reconocido.');await openDashboard(JSON.parse(result.value.payload));}
 else{el('login-form').hidden=true;el('import-panel').hidden=false;el('access-logout').hidden=false;accessMessage('Tu acceso está listo. Falta importar el respaldo inicial.');}
}
function confirmLeaving(){return !cloudBusy&&(!(window.hasDraftChanges?.()||cloudBlocked)||confirm('Hay cambios pendientes o un guardado sin confirmar. Descarga un respaldo antes de continuar. ¿Deseas continuar?'));}
el('cloud-reload').onclick=()=>{if(confirmLeaving())location.reload();};
async function logout(){if(!confirmLeaving())return;await firebase.auth().signOut();location.reload();}
el('cloud-logout').onclick=logout;el('access-logout').onclick=logout;
el('backup-file').onchange=async event=>{
 importData=null;el('import-confirm').disabled=true;
 try{const file=event.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('El respaldo supera 10 MB.');importData=validateBackup(JSON.parse(await file.text()));el('import-summary').textContent=`${Object.keys(importData.fleet).length} aeronaves · ${importData.pilotos.length} pilotos · ${importData.itinerarios.length} itinerarios`;el('import-confirm').disabled=false;}catch(error){accessMessage(error.message);}
};
el('import-confirm').onclick=async()=>{
 if(!importData||cloudBusy)return;el('import-confirm').disabled=true;
 try{await window.cloudWrite(importData);await openDashboard(importData);}catch(error){accessMessage(error.message);}
};
window.addEventListener('beforeunload',event=>{if(cloudBusy||cloudBlocked||window.hasDraftChanges?.()){event.preventDefault();event.returnValue='';}});
try{
 firebase.initializeApp(window.FIREBASE_CONFIG);
 firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION).then(()=>{
  firebase.auth().onAuthStateChanged(async user=>{
   if(!user){if(appLoaded){location.reload();return;}accessMessage('Ingresa con tu usuario autorizado.');return;}
   if(user.uid!==ADMIN_UID){await firebase.auth().signOut();accessMessage('Este usuario no tiene acceso al dashboard.');return;}
   el('login-form').hidden=true;el('access-logout').hidden=false;accessMessage('Cargando datos…');
   try{await refreshCloud();}catch(error){accessMessage(error.message);}
  });
 }).catch(()=>accessMessage('No se pudo iniciar la sesión. Revisa los permisos del navegador.'));
 el('login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;accessMessage('Verificando acceso…');
  try{await firebase.auth().signInWithEmailAndPassword(el('login-email').value.trim(),el('login-password').value);el('login-password').value='';}
  catch(error){accessMessage(error.code==='auth/too-many-requests'?'Demasiados intentos. Espera unos minutos.':'No se pudo ingresar. Revisa tu correo, contraseña y conexión.');}
  finally{button.disabled=false;}
 };
}catch{accessMessage('No se pudo conectar con Firebase. Revisa tu conexión y recarga la página.');}

document.addEventListener('click',event=>{const menu=el('cloud-menu');if(menu&&!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=el('cloud-menu');if(menu?.open){menu.open=false;menu.querySelector('summary').focus();}}});
window.addEventListener('offline',()=>setCloudStatus('Sin conexión a internet.'));
window.addEventListener('online',()=>{if(!cloudBlocked){el('cloud-connection').dataset.state='online';el('preview-save').textContent='Conexión disponible';el('cloud-connection').title='Conexión a internet disponible';}});

