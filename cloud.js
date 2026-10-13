'use strict';
const ADMIN_UID='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
window.getPaymentReceivers=()=>{
 const user=firebase.auth().currentUser;
 return user&&user.uid===ADMIN_UID?[{uid:user.uid,label:profileName(user)}]:[];
};

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
 const script=document.createElement('script');script.src='dashboard.js?v=20261012-7';
 await new Promise((resolve,reject)=>{script.onload=()=>window.DASHBOARD_READY?resolve():reject(Error('El dashboard no terminó de cargar. Recarga la página; los datos guardados se conservan.'));script.onerror=()=>reject(Error('No se pudo cargar el dashboard. Recarga la página.'));document.body.appendChild(script);});
 window.STUDENTS_READY=false;
 const schoolScript=document.createElement('script');schoolScript.src='students.js?v=20261012-23';
 await new Promise((resolve,reject)=>{schoolScript.onload=()=>window.STUDENTS_READY?resolve():reject(Error('El panel de estudiantes no terminó de cargar. Recarga la página.'));schoolScript.onerror=()=>reject(Error('No se pudo cargar Estudiantes. Recarga la página.'));document.body.appendChild(schoolScript);});
 window.REGISTRO_READY=false;
 const registroScript=document.createElement('script');registroScript.src='registro.js?v=20261012-15';
 await new Promise((resolve,reject)=>{registroScript.onload=()=>window.REGISTRO_READY?resolve():reject(Error('Registro no terminó de cargar. Recarga la página.'));registroScript.onerror=()=>reject(Error('No se pudo cargar Registro. Recarga la página.'));document.body.appendChild(registroScript);});
 appLoaded=true;el('access-screen').hidden=true;el('dashboard-app').hidden=false;
 setCloudStatus('Conectado a Firebase · Datos cargados');
}
async function refreshCloud(){
 const result=await cloudRequest('GET');cloudETag=result.etag;cloudVersion=result.value?.revision||0;
 if(!cloudETag)throw Error('No se pudo verificar la versión de los datos. Recarga la página.');
 if(result.value){if(result.value.schemaVersion!==1||typeof result.value.payload!=='string')throw Error('Formato de base de datos no reconocido.');await openDashboard(JSON.parse(result.value.payload));}
 else{el('login-form').hidden=true;el('import-panel').hidden=false;el('access-logout').hidden=false;accessMessage('Tu acceso está listo. Falta importar el respaldo inicial.');}
}
function confirmLeaving(){return !cloudBusy&&(!(profileDirty||window.hasDraftChanges?.()||cloudBlocked)||confirm('Hay cambios pendientes o un guardado sin confirmar. Descarga un respaldo antes de continuar. ¿Deseas continuar?'));}
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
window.addEventListener('beforeunload',event=>{if(cloudBusy||cloudBlocked||profileDirty||window.hasDraftChanges?.()){event.preventDefault();event.returnValue='';}});
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
































let profileDirty=false;
function profileUser(){const user=firebase.auth().currentUser;if(!user||user.uid!==ADMIN_UID)throw Error('Inicia sesión con el usuario autorizado.');return user;}
function profileName(user){return previewData.school?.userProfiles?.[user.uid]?.name||user.displayName||previewData.school?.paymentReceiverNames?.[user.uid]||'';}
function profileError(error){return ({'auth/wrong-password':'La contraseña actual no es correcta.','auth/invalid-credential':'No se pudo verificar la contraseña actual.','auth/weak-password':'La contraseña nueva no cumple los requisitos de Firebase.','auth/requires-recent-login':'Vuelve a iniciar sesión e inténtalo de nuevo.','auth/too-many-requests':'Demasiados intentos. Espera unos minutos.','auth/network-request-failed':'No se pudo conectar. Revisa tu conexión.','auth/email-already-in-use':'Ese correo ya está asociado a otra cuenta.','auth/invalid-email':'El correo no es válido.'})[error.code]||error.message||'No se pudo completar la operación.';}
function openUserProfile(){
 const user=profileUser(),stored=previewData.school?.userProfiles?.[user.uid]||{};
 el('profile-menu').open=false;
 const dialog=document.createElement('dialog');dialog.className='user-profile-dialog';
 dialog.innerHTML='<div class="profile-heading"><h2>Mi perfil</h2><button type="button" data-profile-close aria-label="Cerrar">×</button></div><form data-profile-info><label>Nombre completo<input name="name" required maxlength="160" autocomplete="name"></label><label>Teléfono<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label><label>Cargo<input name="role" maxlength="100" autocomplete="organization-title"></label><label>Correo actual<input name="email" type="email" readonly></label><button type="submit">Guardar información</button></form><details><summary>Cambiar contraseña</summary><form data-profile-password><label>Contraseña actual<input name="current" type="password" required autocomplete="current-password"></label><label>Nueva contraseña<input name="next" type="password" required minlength="6" autocomplete="new-password"></label><label>Confirmar nueva contraseña<input name="confirm" type="password" required minlength="6" autocomplete="new-password"></label><button type="submit">Cambiar contraseña</button></form></details><details><summary>Cambiar correo electrónico</summary><form data-profile-email><label>Nuevo correo<input name="email" type="email" required autocomplete="email"></label><label>Contraseña actual<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Enviar verificación al nuevo correo</button></form></details><p data-profile-status role="status" aria-live="polite"></p><button type="button" data-profile-logout class="profile-logout">Cerrar sesión</button>';
 document.body.appendChild(dialog);const info=dialog.querySelector('[data-profile-info]');info.elements.name.value=profileName(user);info.elements.phone.value=stored.phone||'';info.elements.role.value=stored.role||'';info.elements.email.value=user.email||'';
 let saving=false;const status=dialog.querySelector('[data-profile-status]');
 const run=async task=>{if(saving)return;saving=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Procesando…';try{status.textContent=await task();profileDirty=false;}catch(error){status.textContent=profileError(error);}finally{saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 dialog.oninput=()=>{profileDirty=true;};
 const close=()=>{if(saving)return;if(profileDirty&&!confirm('¿Cerrar el perfil sin guardar los cambios pendientes?'))return;profileDirty=false;dialog.close();};
 dialog.querySelector('[data-profile-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{dialog.remove();profileDirty=false;});
 info.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser(),name=info.elements.name.value.trim();if(!name||name.includes('@'))throw Error('Ingresa tu nombre completo, sin correo electrónico.');const next=structuredClone(previewData);next.school ||= {};next.school.userProfiles ||= {};next.school.paymentReceiverNames ||= {};next.school.userProfiles[current.uid]={...next.school.userProfiles[current.uid],name,phone:info.elements.phone.value.trim(),role:info.elements.role.value.trim(),updatedAt:new Date().toISOString()};next.school.paymentReceiverNames[current.uid]=name;if(!await commitPreview(next))throw Error('No se pudo guardar el perfil. Revisa la conexión.');window.School?.refresh();return 'Información del perfil guardada.';});};
 const password=dialog.querySelector('[data-profile-password]');password.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser();if(password.elements.next.value!==password.elements.confirm.value)throw Error('Las contraseñas nuevas no coinciden.');if(password.elements.next.value.length<6)throw Error('La contraseña debe tener al menos 6 caracteres.');try{await current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(current.email,password.elements.current.value));await current.updatePassword(password.elements.next.value);return 'Contraseña actualizada. Usa la nueva contraseña en tu próximo inicio de sesión.';}finally{password.reset();}});};
 const email=dialog.querySelector('[data-profile-email]');email.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser(),address=email.elements.email.value.trim();if(address===current.email)throw Error('Escribe un correo diferente al actual.');try{await current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(current.email,email.elements.password.value));await current.verifyBeforeUpdateEmail(address);return 'Revisa el nuevo correo y abre el enlace de Firebase para confirmar el cambio. Hasta entonces seguirá activo el correo actual.';}finally{email.elements.password.value='';}});};
 dialog.querySelector('[data-profile-logout]').onclick=()=>{logout().catch(error=>{status.textContent=profileError(error);});};dialog.showModal();
}
el('profile-edit').onclick=openUserProfile;
el('profile-logout').onclick=()=>logout().catch(error=>showCloudError(error));
document.addEventListener('click',event=>{const menu=el('profile-menu');if(menu&&!menu.contains(event.target))menu.open=false;});
