'use strict';
const ADMIN_UID='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
let directorSessionUid=null;
function isDirectorUser(user=firebase.auth().currentUser){return !!user&&(user.uid===ADMIN_UID||directorSessionUid===user.uid);}
async function loadDirectorSession(user){
 if(user.uid===ADMIN_UID)return true;
 const token=await user.getIdToken();
 const response=await fetch('https://us-central1-helicopteros-personales.cloudfunctions.net/accountRegistration',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'session'}),signal:AbortSignal.timeout(15000)});
 if(response.status===400)return false;
 if(!response.ok)throw Error('No se pudo verificar tu cargo. Recarga la página.');
 const session=await response.json();directorSessionUid=session.director?user.uid:null;return isDirectorUser(user);
}
window.getPaymentReceivers=()=>{
 const user=firebase.auth().currentUser;
 return isDirectorUser(user)?[{uid:user.uid,label:profileName(user)}]:[];
};

let cloudETag=null,cloudVersion=0,cloudBusy=false,cloudBlocked=false,appLoaded=false,importData=null;
let lastCloudPayload=null;
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
async function cloudRequest(method,body,etag,{silent=false,path=""}={}){
 const user=firebase.auth().currentUser;
 if(!isDirectorUser(user))throw Error('Inicia sesión con el usuario autorizado.');
 const token=await user.getIdToken();
 const url=new URL(window.FIREBASE_CONFIG.databaseURL.replace(/\/$/,'')+'/dashboard'+path+'.json');url.searchParams.set('auth',token);if(silent)url.searchParams.set('print','silent');
 const headers={'X-Firebase-ETag':'true'};if(etag)headers['if-match']=etag;if(body)headers['Content-Type']='application/json';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});
  if(response.status===412)throw Error('Hay cambios guardados desde otro equipo. Descarga un respaldo y pulsa Actualizar datos antes de continuar.');
  if(!response.ok){
   let detail='';try{const failure=await response.json();if(typeof failure?.error==='string')detail=failure.error.slice(0,400);}catch{}
   const message=response.status===401||response.status===403?'Acceso denegado. Revisa las reglas de Firebase y el usuario autorizado.':'Firebase no pudo completar la operación';
   throw Error(message+' (HTTP '+response.status+')'+(detail?': '+detail:'.'));
  }
  return {value:response.status===204?null:await response.json(),etag:response.headers.get('ETag')};
 }catch(error){if(error.name==='AbortError')throw Error('No se pudo confirmar el guardado. Actualiza los datos antes de volver a guardar.');throw error;}finally{clearTimeout(timer);}
}
window.cloudWrite=async function(data){
 if(cloudBusy)throw Error('Espera a que termine el guardado actual.');
 if(cloudBlocked||!cloudETag)throw Error('Actualiza los datos antes de guardar para evitar sobrescribir cambios.');
 const payload=JSON.stringify(data);
 if(payload===lastCloudPayload){setCloudStatus('✓ Sin cambios pendientes');return true;}
 cloudBusy=true;el('dashboard-app').inert=true;el('cloud-busy').hidden=false;
 setCloudStatus('Guardando en Firebase…');
 const operation=crypto.randomUUID();
 const envelope={schemaVersion:1,revision:cloudVersion+1,operation,updatedAt:new Date().toISOString(),updatedBy:firebase.auth().currentUser.uid,payload};
 try{
  // Keep conditional writes on the standard REST response path.
  const result=await cloudRequest('PUT',envelope,cloudETag);
  window.failedCloudData=null;lastCloudPayload=payload;cloudVersion=envelope.revision;cloudETag=result.etag;
  if(!cloudETag){
    // Never replace a newer snapshot silently while obtaining the next ETag.
    try{const latest=await cloudRequest('GET',null,null,{silent:true});const marker=await cloudRequest('GET',null,null,{path:'/operation'});if(marker.value===operation)cloudETag=latest.etag;}catch{}
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
 const script=document.createElement('script');script.src='dashboard.js?v=20261014-aircraft-1';
 await new Promise((resolve,reject)=>{script.onload=()=>window.DASHBOARD_READY?resolve():reject(Error('El dashboard no terminó de cargar. Recarga la página; los datos guardados se conservan.'));script.onerror=()=>reject(Error('No se pudo cargar el dashboard. Recarga la página.'));document.body.appendChild(script);});
 window.STUDENTS_READY=false;
 const schoolScript=document.createElement('script');schoolScript.src='students.js?v=20261014-aircraft-1';
 await new Promise((resolve,reject)=>{schoolScript.onload=()=>window.STUDENTS_READY?resolve():reject(Error('El panel de estudiantes no terminó de cargar. Recarga la página.'));schoolScript.onerror=()=>reject(Error('No se pudo cargar Estudiantes. Recarga la página.'));document.body.appendChild(schoolScript);});
 window.REGISTRO_READY=false;
 const registroScript=document.createElement('script');registroScript.src='registro.js?v=20261012-15';
 await new Promise((resolve,reject)=>{registroScript.onload=()=>window.REGISTRO_READY?resolve():reject(Error('Registro no terminó de cargar. Recarga la página.'));registroScript.onerror=()=>reject(Error('No se pudo cargar Registro. Recarga la página.'));document.body.appendChild(registroScript);});
 window.AccountRegistration?.installUsersPage();appLoaded=true;el('access-screen').hidden=true;el('dashboard-app').hidden=false;
 setCloudStatus('Conectado a Firebase · Datos cargados');updateProfileAvatar();
}
async function refreshCloud(){
 const result=await cloudRequest('GET');cloudETag=result.etag;cloudVersion=result.value?.revision||0;
 if(!cloudETag)throw Error('No se pudo verificar la versión de los datos. Recarga la página.');
 if(result.value){if(result.value.schemaVersion!==1||typeof result.value.payload!=='string')throw Error('Formato de base de datos no reconocido.');lastCloudPayload=result.value.payload;await openDashboard(JSON.parse(result.value.payload));}
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
 if(typeof firebase==='undefined'||typeof firebase.auth!=='function')throw Error('No se descargó el módulo de acceso. Recarga la página y comprueba que el navegador permita cargar www.gstatic.com.');
 if(!firebase.apps.length)firebase.initializeApp(window.FIREBASE_CONFIG);
 firebase.auth().languageCode='es';
 firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION).then(()=>{
  firebase.auth().onAuthStateChanged(async user=>{
   directorSessionUid=null;
   if(!user){if(appLoaded){location.reload();return;}accessMessage('Ingresa con tu usuario autorizado.');return;}
   let director=false;try{director=await loadDirectorSession(user);}catch(error){accessMessage(error.message);return;}
   if(!director){if(window.AccountRegistration)await window.AccountRegistration.landing();else accessMessage('Recarga la página para consultar tu solicitud.');return;}
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
}catch(error){accessMessage(error.code==='app/duplicate-app'?'La sesión ya está iniciada en esta página. Recarga para continuar.':error.message||'No se pudo iniciar el módulo de acceso. Recarga la página.');}

document.addEventListener('click',event=>{const menu=el('cloud-menu');if(menu&&!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=el('cloud-menu');if(menu?.open){menu.open=false;menu.querySelector('summary').focus();}}});
window.addEventListener('offline',()=>setCloudStatus('Sin conexión a internet.'));
window.addEventListener('online',()=>{if(!cloudBlocked){el('cloud-connection').dataset.state='online';el('preview-save').textContent='Conexión disponible';el('cloud-connection').title='Conexión a internet disponible';}});
































let profileDirty=false;
function profileUser(){const user=firebase.auth().currentUser;if(!isDirectorUser(user))throw Error('Inicia sesión con el usuario autorizado.');return user;}
function profileName(user){return previewData.school?.userProfiles?.[user.uid]?.name||user.displayName||previewData.school?.paymentReceiverNames?.[user.uid]||(user.uid===ADMIN_UID?'Sergio Herrera C.':'');}
function profileError(error){return ({'auth/wrong-password':'La contraseña actual no es correcta.','auth/invalid-credential':'No se pudo verificar la contraseña actual.','auth/weak-password':'La contraseña nueva no cumple los requisitos de Firebase.','auth/requires-recent-login':'Vuelve a iniciar sesión e inténtalo de nuevo.','auth/too-many-requests':'Demasiados intentos. Espera unos minutos.','auth/network-request-failed':'No se pudo conectar. Revisa tu conexión.','auth/email-already-in-use':'Ese correo ya está asociado a otra cuenta.','auth/invalid-email':'El correo no es válido.'})[error.code]||error.message||'No se pudo completar la operación.';}
async function prepareProfilePhoto(file){
 if(!file)return null;if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una foto JPG, PNG o WebP.');if(file.size>10*1024*1024)throw Error('La foto debe pesar menos de 10 MB.');
 const url=URL.createObjectURL(file);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo abrir la foto.'));img.src=url;});const canvas=document.createElement('canvas'),scale=Math.min(1,400/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);const photo=canvas.toDataURL('image/jpeg',.8);if(photo.length>300000)throw Error('La foto es demasiado grande. Selecciona otra.');return photo;}finally{URL.revokeObjectURL(url);}
}
function updateProfileAvatar(){const user=firebase.auth().currentUser,avatar=el('profile-avatar');if(!avatar||!user)return;const photo=previewData.school?.userProfiles?.[user.uid]?.photo||'';avatar.hidden=!photo;if(photo)avatar.src=photo;else avatar.removeAttribute('src');}
el('forgot-password').onclick=async()=>{
 const input=el('login-email'),button=el('forgot-password');if(!input.value.trim()||!input.checkValidity()){accessMessage('Escribe tu correo electrónico para recuperar la contraseña.');input.focus();return;}
 button.disabled=true;accessMessage('Enviando solicitud…');try{firebase.auth().languageCode='es';await firebase.auth().sendPasswordResetEmail(input.value.trim());accessMessage('Si el correo tiene una cuenta, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.');}catch(error){accessMessage(error.code==='auth/user-not-found'?'Si el correo tiene una cuenta, recibirás un enlace para restablecer tu contraseña.':profileError(error));}finally{button.disabled=false;}
};
function openUserProfile(){
 const user=profileUser(),stored=previewData.school?.userProfiles?.[user.uid]||{};
 el('profile-menu').open=false;
 const dialog=document.createElement('dialog');dialog.className='user-profile-dialog';
 dialog.innerHTML='<div class="profile-heading"><h2>Mi perfil</h2><button type="button" data-profile-close aria-label="Cerrar">×</button></div><form data-profile-info><div class="profile-photo"><img data-profile-photo alt="Foto de perfil" hidden><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="profile-photo-add" data-add-photo aria-label="Seleccionar foto de perfil" title="Seleccionar foto de perfil">+</button><button type="button" data-remove-photo>Quitar foto</button></div><label>Nombre completo<input name="name" required maxlength="160" autocomplete="name"></label><label>Celular<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label><label>Cargo<input name="role" maxlength="100" autocomplete="organization-title"></label><label><span>Correo actual <span data-email-verified class="profile-verified" role="status" hidden>✓ Verificado</span></span><input name="email" type="email" readonly></label><button type="submit">Guardar información</button><button type="button" data-verify-email>Verificar correo actual</button></form><details><summary>Cambiar contraseña</summary><form data-profile-password><label>Contraseña actual<input name="current" type="password" required autocomplete="current-password"></label><label>Nueva contraseña<input name="next" type="password" required minlength="6" autocomplete="new-password"></label><label>Confirmar nueva contraseña<input name="confirm" type="password" required minlength="6" autocomplete="new-password"></label><button type="submit">Cambiar contraseña</button></form></details><details><summary>Cambiar correo electrónico</summary><form data-profile-email><label>Nuevo correo<input name="email" type="email" required autocomplete="email"></label><label>Contraseña actual<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Enviar verificación al nuevo correo</button></form></details><p data-profile-status role="status" aria-live="polite"></p><button type="button" data-profile-logout class="profile-logout">Cerrar sesión</button>';
 document.body.appendChild(dialog);const info=dialog.querySelector('[data-profile-info]');info.elements.name.value=profileName(user);info.elements.phone.value=stored.phone||'';info.elements.role.value='Director';info.elements.email.value=user.email||'';info.elements.role.readOnly=true;
 let pendingPhoto=stored.photo||'',photoBusy=false;const photoPreview=dialog.querySelector('[data-profile-photo]');const drawPhoto=()=>{photoPreview.hidden=!pendingPhoto;if(pendingPhoto)photoPreview.src=pendingPhoto;else photoPreview.removeAttribute('src');};drawPhoto();
 let saving=false;const status=dialog.querySelector('[data-profile-status]');
 const run=async task=>{if(saving)return;saving=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Procesando…';try{status.textContent=await task();profileDirty=false;}catch(error){status.textContent=profileError(error);}finally{saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 dialog.oninput=()=>{profileDirty=true;};
 dialog.querySelector('[data-add-photo]').onclick=()=>info.elements.photo.click();
 info.elements.photo.onchange=async()=>{if(saving)return;photoBusy=true;try{pendingPhoto=await prepareProfilePhoto(info.elements.photo.files[0])||pendingPhoto;drawPhoto();profileDirty=true;status.textContent='Foto lista. Pulsa Guardar información.';}catch(error){status.textContent=profileError(error);}finally{photoBusy=false;info.elements.photo.value='';}};
 dialog.querySelector('[data-remove-photo]').onclick=()=>{if(photoBusy)return;if(pendingPhoto&&!confirm('¿Quitar la foto del perfil?'))return;pendingPhoto='';drawPhoto();profileDirty=true;};
 const verify=dialog.querySelector('[data-verify-email]'),verifiedBadge=dialog.querySelector('[data-email-verified]');
 const paintVerification=()=>{const current=profileUser();verifiedBadge.hidden=!current.emailVerified;verify.hidden=!!current.emailVerified;info.elements.email.value=current.email||'';};
 let checkingVerification=false;
 const refreshVerification=async()=>{if(checkingVerification||saving)return;checkingVerification=true;try{await profileUser().reload();paintVerification();}catch{}finally{checkingVerification=false;}};
 paintVerification();window.addEventListener('focus',refreshVerification);dialog.addEventListener('close',()=>window.removeEventListener('focus',refreshVerification));
 verify.onclick=()=>run(async()=>{const current=profileUser();await current.reload();paintVerification();if(current.emailVerified)return 'Tu correo ya está verificado.';firebase.auth().languageCode='es';await current.sendEmailVerification();return 'Enlace de verificación enviado. Revisa tu correo y abre el enlace de Firebase.';});
 const close=()=>{if(saving)return;if(profileDirty&&!confirm('¿Cerrar el perfil sin guardar los cambios pendientes?'))return;profileDirty=false;dialog.close();};
 dialog.querySelector('[data-profile-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{dialog.remove();profileDirty=false;});
 info.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser(),name=info.elements.name.value.trim();if(photoBusy)throw Error('Espera a que termine de cargar la foto.');if(!name||name.includes('@'))throw Error('Ingresa tu nombre completo, sin correo electrónico.');const next=structuredClone(previewData);next.school ||= {};next.school.userProfiles ||= {};next.school.paymentReceiverNames ||= {};next.school.userProfiles[current.uid]={...next.school.userProfiles[current.uid],name,phone:info.elements.phone.value.trim(),role:'Director',photo:pendingPhoto,updatedAt:new Date().toISOString()};next.school.paymentReceiverNames[current.uid]=name;if(!await commitPreview(next))throw Error('No se pudo guardar el perfil. Revisa la conexión.');window.School?.refresh();updateProfileAvatar();return 'Información del perfil guardada.';});};
 const password=dialog.querySelector('[data-profile-password]');password.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser();if(password.elements.next.value!==password.elements.confirm.value)throw Error('Las contraseñas nuevas no coinciden.');if(password.elements.next.value.length<6)throw Error('La contraseña debe tener al menos 6 caracteres.');try{await current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(current.email,password.elements.current.value));await current.updatePassword(password.elements.next.value);return 'Contraseña actualizada. Usa la nueva contraseña en tu próximo inicio de sesión.';}finally{password.reset();}});};
 const email=dialog.querySelector('[data-profile-email]');email.onsubmit=event=>{event.preventDefault();run(async()=>{const current=profileUser(),address=email.elements.email.value.trim();if(address===current.email)throw Error('Escribe un correo diferente al actual.');try{await current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(current.email,email.elements.password.value));firebase.auth().languageCode='es';await current.verifyBeforeUpdateEmail(address);return 'Revisa el nuevo correo y abre el enlace de Firebase para confirmar el cambio. Hasta entonces seguirá activo el correo actual.';}finally{email.elements.password.value='';}});};
 dialog.querySelector('[data-profile-logout]').onclick=()=>{logout().catch(error=>{status.textContent=profileError(error);});};dialog.showModal();refreshVerification();
}
el('profile-edit').onclick=openUserProfile;
el('profile-logout').onclick=()=>logout().catch(error=>showCloudError(error));
document.addEventListener('click',event=>{const menu=el('profile-menu');if(menu&&!menu.contains(event.target))menu.open=false;});




// Role policies are staged until Firebase supports isolated per-page access.
const STAFF_ROLES=['Director','Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
const ROLE_ACTIONS={view:'Ver',create:'Crear',edit:'Modificar',delete:'Eliminar',print:'Imprimir',export:'Exportar',resolve:'Resolver / aprobar'};
const ROLE_PAGES=[
 {id:'horario',name:'Horario del día',areas:['Vuelos y rutas','Tripulación y pasajeros'],actions:['view','print','export']},
 {id:'pendientes',name:'Pendientes',areas:['Alertas de aeronaves','Alertas de pilotos','Alertas de escuela y empresa'],actions:['view','print','export']},
 {id:'aeronaves',name:'Aeronaves',areas:['Información y estatus','Motores y hélices','Horas e inspecciones','Mantenimiento y taller','Documentos y emergencia','Pedidos','Tarifas'],actions:['view','create','edit','delete','print','export','resolve']},
 {id:'pilotos',name:'Pilotos',areas:['Datos personales','Licencias y habilitaciones','Vencimientos y documentos'],actions:['view','create','edit','delete','print','export','resolve']},
 {id:'bitacora',name:'Registro de bitácora',areas:['Vuelos e instructores','Tacómetros y horas','Cargos por servicios','Historial de registros'],actions:['view','create','edit','delete','print','export']},
 {id:'pagos',name:'Registro de pago',areas:['Abonos y recibos','Comprobantes de transferencia','Movimientos de pago'],actions:['view','create','edit','delete','print','export']},
 {id:'itinerario',name:'Itinerario',areas:['Calendario','Programación de vuelos','Solicitudes de vuelos'],actions:['view','create','edit','delete','print','export','resolve']},
 {id:'estudiantes',name:'Estudiantes / Clientes',areas:['Datos personales','Cursos y licencias','Horas registradas','Estado de cuenta y abonos','Documentos'],actions:['view','create','edit','delete','print','export']},
 {id:'escuela',name:'Escuela',areas:['Información y documentos','Cursos y fechas','Tarifas de servicios'],actions:['view','create','edit','delete','print','export','resolve']},
 {id:'charter',name:'HP CHARTER',areas:['Información de la empresa','Documentos y vencimientos','Servicios'],actions:['view','create','edit','delete','print','export','resolve']},
 {id:'estadisticas',name:'Estadísticas',areas:['Estadísticas generales','Estadísticas para AAC','Estadísticas Helicópteros Personales'],actions:['view','print','export']},
 {id:'saldos',name:'Alerta de saldos',areas:['Estudiantes','Clientes'],actions:['view','edit','print','export']}
];
function suggestedRolePolicy(role){
 const read={Gerente:ROLE_PAGES.map(p=>p.id),Administrativo:['horario','pendientes','aeronaves','pilotos','bitacora','pagos','itinerario','estudiantes','escuela','charter','estadisticas','saldos'],Piloto:['horario','pendientes','aeronaves','pilotos','bitacora','itinerario'],Estudiante:[],Mecánico:['pendientes','aeronaves'],Contabilidad:['pagos','estudiantes','escuela','charter','estadisticas','saldos']}[role]||[];
 const edit={Gerente:['aeronaves','pilotos','bitacora','pagos','itinerario','estudiantes','escuela','charter','saldos'],Administrativo:['pilotos','bitacora','pagos','itinerario','estudiantes'],Piloto:['bitacora'],Estudiante:[],Mecánico:['aeronaves'],Contabilidad:['pagos']}[role]||[];
 return Object.fromEntries(ROLE_PAGES.map(page=>{const full=role==='Director',view=full||read.includes(page.id),write=edit.includes(page.id);const actions=Object.fromEntries(Object.keys(ROLE_ACTIONS).map(action=>[action,page.actions.includes(action)&&(full||(view&&(action==='view'||(write&&['create','edit'].includes(action))||(['Gerente','Administrativo','Contabilidad'].includes(role)&&['print','export'].includes(action)))))]));const areas=Object.fromEntries(page.areas.map(area=>[area,view]));if(role==='Mecánico'&&page.id==='aeronaves')areas.Tarifas=false;if(role==='Contabilidad'&&page.id==='estudiantes')for(const area of page.areas)areas[area]=['Estado de cuenta y abonos','Cursos y licencias'].includes(area);return [page.id,{actions,areas}];}));
}
function normalizeRolePolicy(role,policy){
 if(role==='Director')return suggestedRolePolicy(role);
 if(!STAFF_ROLES.includes(role))throw Error('Cargo no válido.');
 return Object.fromEntries(ROLE_PAGES.map(page=>{const input=policy?.[page.id]||{},view=!!input.actions?.view;return [page.id,{actions:Object.fromEntries(Object.keys(ROLE_ACTIONS).map(action=>[action,view&&page.actions.includes(action)&&!!input.actions?.[action]])),areas:Object.fromEntries(page.areas.map(area=>[area,view&&!!input.areas?.[area]]))}];}));
}
function saveRoleConfiguration(data,role,policy,actorUid){
 if(!isDirectorUser()||actorUid!==firebase.auth().currentUser.uid)throw Error('Solo el Director puede administrar los permisos.');
 if(role==='Director')throw Error('El Director conserva acceso total.');
 const next=structuredClone(data);next.school ||= {};next.school.accessConfiguration ||= {version:1,status:'read-only-server-enforcement',roles:{}};
 next.school.accessConfiguration.roles ||= {};next.school.accessConfiguration.roles[role]=normalizeRolePolicy(role,policy);next.school.accessConfiguration.status='read-only-server-enforcement';next.school.accessConfiguration.updatedAt=new Date().toISOString();next.school.accessConfiguration.updatedBy=actorUid;return next;
}
function openRolePermissions(){
 profileUser();el('profile-menu').open=false;const dialog=document.createElement('dialog');dialog.className='role-permissions-dialog';
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 dialog.innerHTML='<div class="profile-heading"><h2>Roles y permisos</h2><button type="button" data-close>×</button></div><p>Todos los usuarios con cargo <b>Director</b> tienen acceso total. Los cargos se asignan desde Usuarios.</p><p class="role-pending">Consulta por páginas y secciones disponible al publicar la función actualizada. Crear, modificar, eliminar y resolver siguen pendientes de validación en el servidor.</p><label>Cargo<select data-role>'+STAFF_ROLES.map(role=>'<option>'+role+'</option>').join('')+'</select></label><p data-role-note></p><div class="role-matrix" data-matrix></div><div class="role-footer"><div class="role-buttons"><button type="button" data-reset>Restablecer sugerencia</button><button type="button" data-save>Guardar permisos del cargo</button></div><p data-role-status role="status" aria-live="polite"></p></div>';
 document.body.appendChild(dialog);let role='Director',policy=suggestedRolePolicy(role),dirty=false,saving=false;
 const selector=dialog.querySelector('[data-role]'),matrix=dialog.querySelector('[data-matrix]'),status=dialog.querySelector('[data-role-status]');
 const render=()=>{const locked=role==='Director';dialog.querySelector('[data-save]').disabled=locked||saving;dialog.querySelector('[data-reset]').disabled=locked||saving;dialog.querySelector('[data-role-note]').textContent=locked?'El Director tiene todos los permisos. Este cargo no se puede quitar desde esta tabla.':role==='Estudiante'?'Sin acceso global por defecto. Su expediente personal requiere restringir los datos a su usuario antes de activar este cargo.':'Marca las acciones por página. En “Secciones visibles” puedes escoger la información que se mostrará. Eliminar no se incluye en las sugerencias.';
 matrix.innerHTML='<table><thead><tr><th>Página / acceso rápido</th>'+Object.values(ROLE_ACTIONS).map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+ROLE_PAGES.map((page,index)=>{const row=policy[page.id];return '<tr><td><b>'+page.name+'</b><select data-mode="'+index+'" '+(locked?'disabled':'')+'><option value="custom">Personalizado</option><option value="none">Sin acceso</option><option value="view">Solo ver</option><option value="edit">Ver y modificar</option></select><details><summary>Secciones visibles</summary>'+page.areas.map((area,i)=>'<label><input type="checkbox" data-area="'+index+':'+i+'" '+(row.areas[area]?'checked':'')+' '+(locked||!row.actions.view?'disabled':'')+'>'+escape(area)+'</label>').join('')+'</details></td>'+Object.keys(ROLE_ACTIONS).map(action=>'<td>'+(page.actions.includes(action)?'<input type="checkbox" aria-label="'+page.name+' · '+ROLE_ACTIONS[action]+'" data-action="'+index+':'+action+'" '+(row.actions[action]?'checked':'')+' '+(locked?'disabled':'')+'>':'—')+'</td>').join('')+'</tr>';}).join('')+'</tbody></table>';
 matrix.querySelectorAll('[data-action]').forEach(input=>input.onchange=()=>{const [index,action]=input.dataset.action.split(':'),page=ROLE_PAGES[index],row=policy[page.id];row.actions[action]=input.checked;if(input.checked){row.actions.view=true;if(!Object.values(row.areas).some(Boolean))page.areas.forEach(area=>row.areas[area]=true);}if(action==='view'&&!input.checked){Object.keys(row.actions).forEach(a=>row.actions[a]=false);page.areas.forEach(area=>row.areas[area]=false);}dirty=true;render();});
 matrix.querySelectorAll('[data-area]').forEach(input=>input.onchange=()=>{const [index,areaIndex]=input.dataset.area.split(':'),page=ROLE_PAGES[index];policy[page.id].areas[page.areas[areaIndex]]=input.checked;dirty=true;});
 matrix.querySelectorAll('[data-mode]').forEach(select=>select.onchange=()=>{if(select.value==='custom')return;const page=ROLE_PAGES[select.dataset.mode],view=select.value!=='none';policy[page.id]={actions:Object.fromEntries(Object.keys(ROLE_ACTIONS).map(a=>[a,page.actions.includes(a)&&view&&(a==='view'||(select.value==='edit'&&['create','edit'].includes(a)))])),areas:Object.fromEntries(page.areas.map(a=>[a,view]))};dirty=true;render();});};
 selector.onchange=()=>{if(dirty&&!confirm('¿Descartar los cambios de este cargo?')){selector.value=role;return;}role=selector.value;policy=normalizeRolePolicy(role,previewData.school?.accessConfiguration?.roles?.[role]||suggestedRolePolicy(role));dirty=false;status.textContent='';render();};
 dialog.querySelector('[data-reset]').onclick=()=>{if(!confirm('¿Restablecer los permisos sugeridos para '+role+'?'))return;policy=suggestedRolePolicy(role);dirty=true;render();};
 dialog.querySelector('[data-save]').onclick=async()=>{if(saving)return;saving=true;selector.disabled=true;matrix.inert=true;render();try{status.textContent='Guardando permisos de '+role+'…';status.dataset.state='saving';const next=saveRoleConfiguration(previewData,role,policy,profileUser().uid);await window.cloudWrite(next);previewData=structuredClone(next);dirty=false;status.dataset.state='success';status.textContent='Configuración guardada. Los permisos de consulta se aplican al actualizar el portal. Las operaciones de escritura siguen bloqueadas.';}catch(error){status.dataset.state='error';status.textContent=profileError(error)+' Tus selecciones siguen en esta ventana.';}finally{saving=false;selector.disabled=false;matrix.inert=false;render();}};
 const close=()=>{if(saving)return;if(dirty&&!confirm('¿Cerrar sin guardar los permisos?'))return;dialog.close();};dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>dialog.remove());render();dialog.showModal();
}
el('profile-roles').onclick=openRolePermissions;









