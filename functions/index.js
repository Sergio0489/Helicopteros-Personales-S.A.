'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
initializeApp();
const {policyFor,visiblePages,projectPage}=require('./access');
const {nativeView}=require('./native-view');
const {boxView}=require('./box-view');
const {applyChanges}=require('./box-write');
const {randomUUID}=require('node:crypto');
const DIRECTOR='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
const fields=['name','identity','birthDate','nationality','address','previousSchool','residentialPhone','phone','fatherName','motherName','emergencyName','emergencyPhone','funding','interests','notes','referredBy'];
const identities=require('./identity-merge');
const roles=identities.ROLES;
function cleanProfile(input){const profile={};for(const key of fields){if(key==='interests'){profile[key]=(Array.isArray(input[key])?input[key]:[]).filter(v=>['privado','comercial','ifr','multimotor','rpa','instructor'].includes(v));continue;}profile[key]=String(input[key]||'').trim().slice(0,key==='notes'?4000:500);}if(input.photo){if(typeof input.photo!=='string'||input.photo.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.photo))throw Error('Foto no válida.');profile.photo=input.photo;}if(!profile.name)throw Error('Ingresa el nombre completo.');if(profile.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))throw Error('Revisa la fecha de nacimiento.');return profile;}
function matchStudent(payload,email,uid){const matches=(payload.school?.students||[]).filter(s=>String(s.email||'').trim().toLowerCase()===email.toLowerCase());if(matches.length!==1||matches[0].authUid&&matches[0].authUid!==uid)return null;return matches[0];}
const {matchRecord}=require('./record-link');
const selfProfile=require('./self-profile');
const audit=require('./audit');
const dossiers=require('./account-dossiers');
const SYNC_VERSION=4;
async function syncAccount(db,u,account,marker,readRoot){
 if(account?.mergedInto||!u.emailVerified||!u.email)return account||{};
 if(account?.verified&&account.email===u.email&&marker&&account.syncedOperation===marker&&account.syncVersion===SYNC_VERSION&&account.syncedRole===(u.uid===DIRECTOR?'Director':account.role||'Estudiante'))return account;
 let root=await readRoot();
 if(account?.verified&&account.email&&account.email.toLowerCase()!==u.email.toLowerCase()&&account.recordId){
  let failure='';const moved=await db.ref('dashboard').transaction(current=>{
   if(!current)return current;try{const next=selfProfile.migrateEmail(JSON.parse(current.payload),u,account);return next?audit.attach(current,{...current,payload:JSON.stringify(next),operation:randomUUID(),revision:(current.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:u.uid},null,'dashboard','Sincronización de correo verificado'):current;}catch(e){failure=e.message;return;}
  },undefined,false);
  if(failure||!moved.committed)throw Error(failure||'No se pudo sincronizar el nuevo correo. Intenta nuevamente.');
  root=moved.snapshot.val();
 }
 const effective={...account,profile:{...account?.profile,name:account?.profile?.name||(u.uid===DIRECTOR?'Sergio Herrera C.':u.displayName||'')},role:u.uid===DIRECTOR?'Director':account?.role||'Estudiante'};
 let dossierStatus='';
 if(root?.payload){
  const prepared=dossiers.ensure(JSON.parse(root.payload),u,effective);dossierStatus=prepared.status;
  if(prepared.changed){
   let failure='';const result=await db.ref('dashboard').transaction(current=>{
    failure='';if(!current?.payload)return current;
    try{const applied=dossiers.ensure(JSON.parse(current.payload),u,effective);if(!applied.changed)return current;
     return audit.attach(current,{...current,payload:JSON.stringify(applied.data),operation:randomUUID(),revision:(current.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:u.uid},null,'dashboard','Creación o clasificación automática del expediente');
    }catch(e){failure=e.message;return;}
   },undefined,false);
   if(failure||!result.committed)throw Error(failure||'No se pudo sincronizar el expediente. Actualiza e intenta nuevamente.');
   root=result.snapshot.val();
  }
 }
 const payload=root?.payload?JSON.parse(root.payload):{},match=dossierStatus==='duplicate-identity'?{status:dossierStatus}:matchRecord(payload,u.email,u.uid);
 const profile={...account?.profile};if(match.record)for(const field of fields){const value=match.record[field];if(value!=null&&value!==''&&(!Array.isArray(value)||value.length))profile[field]=value;}
 if(!profile.name)profile.name=u.uid===DIRECTOR?'Sergio Herrera C.':u.displayName||'';
 const patch={auditReason:'Sincronización de expediente y correo verificado',profile,email:u.email,verified:true,verifiedAt:account?.verifiedAt||new Date().toISOString(),syncedOperation:root?.operation||null,syncVersion:SYNC_VERSION,syncedRole:effective.role,syncStatus:match.status,studentId:match.kind==='student'?match.record.id:null,pilotId:match.kind==='pilot'?match.record.id:null,personnelId:match.kind==='personnel'?match.record.id:null,recordId:match.record?.id||null,recordKind:match.kind||null,recordName:match.record?.name||null};
 const ref=db.ref('accountRequests/'+u.uid);await ref.transaction(old=>audit.attach(old,{...old,...patch},null,'account','Sincronización de expediente y correo verificado',u.uid));return {...account,...patch};
}
exports.accountRegistration=onRequest({region:'us-central1',cors:['https://sergio0489.github.io'],minInstances:0,maxInstances:2},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method==='GET'){res.json({ready:true});return;}if(req.method!=='POST'){res.status(405).end();return;}
 try{
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token){res.status(401).json({error:'Inicia sesión.'});return;}
 const claims=await getAuth().verifyIdToken(token,true),user=await getAuth().getUser(claims.uid),action=req.body?.action,db=getDatabase(),ref=db.ref('accountRequests/'+user.uid);
 if(!user.email){res.status(400).json({error:'La cuenta necesita correo electrónico.'});return;}
 const actorAccount=(await ref.get()).val();
 if(actorAccount?.mergedInto){res.status(403).json({error:'Esta cuenta fue unificada. Inicia sesión con la cuenta principal indicada por el Director.'});return;}
 const actor={uid:user.uid,name:actorAccount?.profile?.name||user.displayName||user.email,role:actorAccount?.role||'Estudiante'};
 const isDirector=!user.disabled&&(user.uid===DIRECTOR||(user.emailVerified&&actorAccount?.role==='Director'&&!!actorAccount.assignedAt));
 if(action==='identity-preview'||action==='identity-merge'){
  if(!isDirector){res.status(403).json({error:'Solo Directores pueden unificar identidades.'});return;}
  const [dash,requests]=await Promise.all([db.ref('dashboard').get(),db.ref('accountRequests').get()]);
  const current={dashboard:dash.val(),accountRequests:requests.val()||{}};
  if(action==='identity-preview'){res.json({operation:current.dashboard?.operation,groups:identities.groups(current).map(g=>({...g,role:g.uids.includes(DIRECTOR)?'Director':g.role})),roles:identities.ROLES});return;}
  if(req.body.confirm!==true||!Array.isArray(req.body.members)||!req.body.members.length)throw Error('Confirma la coincidencia antes de unificar.');
  const candidate=identities.groups(current).find(g=>g.members.map(x=>x.key).sort().join('|')===[...req.body.members].sort().join('|'));if(!candidate)throw Error('La coincidencia cambió. Actualiza.');
  for(const uid of candidate.uids){const u=await getAuth().getUser(uid);if(u.disabled||!u.emailVerified||identities.email(u.email)!==identities.email(current.accountRequests[uid]?.email))throw Error('Verifica y actualiza todas las cuentas antes de unificarlas.');}
  let failure='',applied;const operation=randomUUID(),now=new Date().toISOString();
  const result=await db.ref().transaction(root=>{failure='';try{if(root?.dashboard?.operation!==req.body.operation)throw Error('Los datos cambiaron. Revisa nuevamente la coincidencia.');
   if(user.uid!==DIRECTOR&&!(root.accountRequests?.[user.uid]?.role==='Director'&&root.accountRequests[user.uid].assignedAt&&!root.accountRequests[user.uid].mergedInto))throw Error('El permiso de Director cambió.');
   applied=identities.merge(root,req.body.members,user.uid,DIRECTOR,now);const next=applied.root;
   next.dashboard=audit.attach(root.dashboard,{...next.dashboard,operation,revision:(root.dashboard.revision||0)+1,updatedAt:now,updatedBy:user.uid},actor,'dashboard','Unificación de identidad por correo o cédula');
   for(const uid of [applied.uid,...applied.mergedUids])next.accountRequests[uid]=audit.attach(root.accountRequests[uid],next.accountRequests[uid],actor,'account','Unificación de identidad',uid);
   return next;
  }catch(e){failure=e.message;return;}},undefined,false);
  if(!result.committed||failure){res.status(409).json({error:failure||'No se pudo unificar.'});return;}
  // The mergedInto gate and removed grants take effect atomically; disabling Auth is additional protection.
  const warnings=[];for(const uid of applied.mergedUids)try{await getAuth().updateUser(uid,{disabled:true});await getAuth().revokeRefreshTokens(uid);}catch{warnings.push('La cuenta secundaria quedó bloqueada en la app; falta deshabilitar su acceso en Firebase Authentication.');}
  res.json({ok:true,uid:applied.uid,email:applied.email,role:applied.role,operation,warnings});return;
 }
 if(action==='audit-list'||action==='audit-detail'){if(!isDirector){res.status(403).json({error:'Solo Directores pueden consultar el historial.'});return;}res.json(await (action==='audit-list'?audit.list(db,req.body):audit.detail(db,req.body)));return;}
 if(isDirector)actor.role='Director';
 if(action==='director-save'){
  if(!isDirector){res.status(403).json({error:'Solo Directores.'});return;}
  if(typeof req.body.payload!=='string'||Buffer.byteLength(req.body.payload)>10000000)throw Error('Datos no válidos.');
  const data=JSON.parse(req.body.payload);if(!data||typeof data!=='object'||!data.fleet)throw Error('Respaldo no válido.');
  let failure='';const operation=randomUUID();const saved=await db.ref('dashboard').transaction(root=>{failure='';if(root===null&&req.body.operation!=null){failure='Los datos cambiaron. Actualiza antes de guardar.';return null;}if((root?.operation||null)!==(req.body.operation||null)){failure='Los datos cambiaron. Actualiza antes de guardar.';return;}try{identities.assertUnique(root?.payload?JSON.parse(root.payload):{},data);}catch(e){failure=e.message;return;}return audit.attach(root,{...root,schemaVersion:1,payload:req.body.payload,operation,revision:(root?.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:user.uid},actor,'dashboard',req.body.reason);},undefined,false);
  if(!saved.committed||failure){res.status(409).json({error:failure||'No se pudo confirmar el guardado.'});return;}res.json({ok:true,operation,revision:saved.snapshot.val().revision});return;
 }
 if(action==='session'){res.json({director:isDirector,name:actorAccount?.profile?.name||user.displayName||''});return;}
 if(action==='permission-capabilities'){if(!isDirector){res.status(403).json({error:'Solo Directores.'});return;}res.json({version:7,auditHistory:true,selfProfile:true,outputPermissions:true,schoolCertificates:true,pilotDossiers:true,boxEditing:true,aircraftSchedule:true,ownStatement:true,monthlyWinners:true});return;}
 if(action==='self-profile'||action==='self-profile-save'){
  if(user.disabled){res.status(403).json({error:'La cuenta está deshabilitada.'});return;}
  let root=(await db.ref('dashboard').get()).val();
  let account=await syncAccount(db,user,actorAccount,root?.operation,async()=>root);
  if(account?.syncedOperation&&root?.operation!==account.syncedOperation)root=(await db.ref('dashboard').get()).val();
  if(action==='self-profile-save'){
   const profile=selfProfile.clean(req.body.profile);if(typeof req.body.operation!=='string')throw Error('Cierra el perfil y vuelve a abrirlo antes de guardar.');
   let failure='',applied;const operation=randomUUID();
   const result=await db.ref('dashboard').transaction(current=>{
    failure='';if(!current)return current;if(current.operation!==req.body.operation){failure='Los datos cambiaron. Cierra el perfil, vuelve a abrirlo y revisa los datos antes de guardar.';return;}
    try{applied=selfProfile.apply(JSON.parse(current.payload),user,profile);return audit.attach(current,{...current,payload:JSON.stringify(applied.data),operation,revision:(current.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:user.uid},actor,'dashboard',req.body.reason);}catch(e){failure=e.message;return;}
   },undefined,false);
   if(!result.committed||failure||!applied){res.status(409).json({error:failure||'No se confirmó el guardado. Vuelve a abrir el perfil.'});return;}
   root=result.snapshot.val();
   await ref.transaction(old=>audit.attach(old,{...old,profile:{...account?.profile,...profile},syncedOperation:null,updatedAt:new Date().toISOString()},actor,'account',req.body.reason,user.uid));
   account=await syncAccount(db,user,{...account,profile:{...account?.profile,...profile},syncedOperation:null},root.operation,async()=>root);
  }
  const data=root?.payload?JSON.parse(root.payload):{},stored=data.school?.userProfiles?.[user.uid]||{},match=user.emailVerified?matchRecord(data,user.email,user.uid):{status:'unverified'};
  res.json({profile:{name:match.record?.name||stored.name||account?.profile?.name||user.displayName||'',phone:match.record?.phone??stored.phone??account?.profile?.phone??'',photo:stored.photo??account?.profile?.photo??''},role:isDirector?'Director':account?.role||'Estudiante',email:user.email,verified:user.emailVerified,linked:match.status==='matched',syncStatus:match.status,operation:root?.operation||null});return;
 }
 if(action==='access'){
  if(!user.emailVerified||user.disabled){res.status(403).json({error:'Verifica tu correo para consultar el acceso.'});return;}
  let account=(await ref.get()).val();
  let root=(await db.ref('dashboard').get()).val();
  account=await syncAccount(db,user,account,root?.operation,async()=>root);
  if(account?.syncedOperation&&root?.operation!==account.syncedOperation)root=(await db.ref('dashboard').get()).val();
  const data=root?.payload?JSON.parse(root.payload):{};
  const policy=policyFor(data,account),pages=visiblePages(policy);
  if(req.body.page&&!pages.some(p=>p.id===req.body.page)){res.status(403).json({error:'No tienes permiso para consultar esta página.'});return;}
  res.json({mode:'box-permissions',role:account?.role||'Estudiante',name:account?.profile?.name||user.displayName||'',pages,native:req.body.page&&req.body.layout==='main'?{...boxView(data,account,policy,req.body.page),operation:root.operation,uid:user.uid}:null,page:req.body.page&&req.body.layout!=='main'?projectPage(boxView(data,account,policy,req.body.page).data,account,policy,req.body.page):null});return;
 }
 if(action==='box-save'){
  if(!user.emailVerified||user.disabled||!actorAccount?.assignedAt){res.status(403).json({error:'Tu cuenta no tiene acceso de edición.'});return;}
  if(typeof req.body.operation!=='string'||JSON.stringify(req.body).length>12000000){res.status(400).json({error:'Solicitud no válida.'});return;}
  let failure='',writes=0;const operation=randomUUID();
  const result=await db.ref('dashboard').transaction(root=>{
   failure='';writes=0;if(root===null){failure='No hay datos disponibles para guardar.';return null;}if(root.operation!==req.body.operation){failure='Los datos cambiaron. Actualiza la página antes de guardar.';return;}
   try{const data=JSON.parse(root.payload),policy=policyFor(data,actorAccount);if(!visiblePages(policy).some(p=>p.id===req.body.page))throw Error('Ya no tienes acceso a esta página.');
    const applied=applyChanges(data,req.body.before,req.body.after,policy,{...actorAccount,uid:user.uid});writes=applied.writes;
    return audit.attach(root,{...root,payload:JSON.stringify(applied.data),revision:(root.revision||0)+1,operation,updatedBy:user.uid,updatedAt:new Date().toISOString()},actor,'dashboard',req.body.reason);
   }catch(e){failure=e.message;return;}
  },undefined,false);
  if(!result.committed||failure){res.status(409).json({error:failure||'No se pudo guardar. Actualiza la página.'});return;}
  res.json({ok:true,operation,writes});return;
 }
 if(action==='list'||action==='users'||action==='assign'){
  if(!isDirector){res.status(403).json({error:'Solo el Director puede asignar cargos.'});return;}
  if(action==='users'){
   const page=await getAuth().listUsers(100,typeof req.body.pageToken==='string'?req.body.pageToken:undefined);
   const marker=(await db.ref('dashboard/operation').get()).val();let rootPromise;const readRoot=()=>rootPromise||=(db.ref('dashboard').get().then(s=>s.val()));
   const users=[];for(const u of page.users){const existing=(await db.ref('accountRequests/'+u.uid).get()).val();if(existing?.mergedInto)continue;const a=await syncAccount(db,u,existing,marker,readRoot);users.push({uid:u.uid,name:a.profile?.name||u.displayName||(u.uid===DIRECTOR?'Sergio Herrera C.':''),email:u.email||'',phone:a.profile?.phone||u.phoneNumber||'',role:u.uid===DIRECTOR?'Director':a.role||'Estudiante',verified:!!u.emailVerified,disabled:!!u.disabled,createdAt:u.metadata.creationTime||a.createdAt||'',lastSignIn:u.metadata.lastSignInTime||'',assignedAt:a.assignedAt||'',studentId:u.emailVerified?a.studentId||'':'',recordName:u.emailVerified?a.recordName||'':'',recordKind:u.emailVerified?a.recordKind||'':'',recordId:u.emailVerified?a.recordId||'':'',syncStatus:u.emailVerified?a.syncStatus||'no-match':'unverified',hasProfile:!!a.profile});}
   res.json({users,nextPageToken:page.pageToken||null});return;
  }
  if(action==='list'){const snapshot=await db.ref('accountRequests').get();res.json({requests:Object.entries(snapshot.val()||{}).map(([uid,v])=>({uid,...v}))});return;}
  if(!roles.includes(req.body.role)||!req.body.uid||req.body.uid===DIRECTOR||req.body.uid===user.uid){res.status(400).json({error:'Cargo o usuario no válido.'});return;}
  const target=await getAuth().getUser(req.body.uid);if(!target.emailVerified||target.disabled){res.status(400).json({error:'El usuario debe verificar primero su correo.'});return;}
  const targetRef=db.ref('accountRequests/'+target.uid);if((await targetRef.get()).val()?.mergedInto)throw Error('La cuenta ya fue unificada. Usa la cuenta principal.');
  const assignedAt=new Date().toISOString();await targetRef.transaction(old=>audit.attach(old,{...old,role:req.body.role,assignedBy:user.uid,assignedAt,syncedOperation:null},actor,'account',req.body.reason,target.uid));await db.ref('dashboard').update({operation:randomUUID(),updatedAt:assignedAt,updatedBy:user.uid});
  try{const linked=await syncAccount(db,target,(await targetRef.get()).val(),null,async()=>(await db.ref('dashboard').get()).val());res.json({ok:true,recordKind:linked.recordKind,recordId:linked.recordId,recordName:linked.recordName,syncStatus:linked.syncStatus});}
  catch(error){res.json({ok:true,syncStatus:'sync-error',warning:'Cargo guardado. No se completó la sincronización del expediente: '+error.message});}return;
 }
 if(!['submit','status'].includes(action)){res.status(400).json({error:'Operación no válida.'});return;}
 if(action==='submit'){
  const profile=cleanProfile(req.body.profile||{});
  let failure='';const saved=await db.ref().transaction(root=>{failure='';try{
   root ||= {};root.accountRequests ||= {};const requests=root.accountRequests,old=requests[user.uid];if(old?.mergedInto)throw Error('La cuenta fue unificada. Usa la cuenta principal.');
   const key=identities.identity(profile.identity);
   if(key&&Object.entries(requests).some(([uid,a])=>uid!==user.uid&&!a.mergedInto&&identities.identity(a.profile?.identity)===key))throw Error('Ya existe una cuenta con esa cédula. Solicita al Director unificar la identidad.');
   const data=root.dashboard?.payload?JSON.parse(root.dashboard.payload):{};
   if(key&&dossiers.recordRows(data).some(({record:r})=>identities.identity(r.identity)===key&&r.authUid!==user.uid&&identities.email(r.email)!==identities.email(user.email)))throw Error('La cédula ya pertenece a un expediente con otro correo. Solicita al Director revisar la identidad.');
   requests[user.uid]=audit.attach(old,{...old,role:old?.role||'Estudiante',profile,email:user.email,syncedOperation:null,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()},actor,'account',req.body.reason,user.uid);return root;
  }catch(e){failure=e.message;return;}},undefined,false);
  if(!saved.committed||failure)throw Error(failure||'No se pudo guardar el registro.');
 }
 let account=(await ref.get()).val();
 if(action==='submit'&&!user.emailVerified){
  await db.ref('dashboard').transaction(current=>{if(!current?.payload)return current;const applied=dossiers.ensure(JSON.parse(current.payload),user,account);if(!applied.changed)return current;return audit.attach(current,{...current,payload:JSON.stringify(applied.data),operation:randomUUID(),revision:(current.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:user.uid},actor,'dashboard','Registro inicial de estudiante');},undefined,false);
 }
 if(user.emailVerified){const marker=(await db.ref('dashboard/operation').get()).val();account=await syncAccount(db,user,account,marker,async()=>(await db.ref('dashboard').get()).val());}
 if(!account?.profile?.name){res.json({needsProfile:true,email:user.email,verified:user.emailVerified});return;}

 res.json({profile:account.profile,email:user.email,verified:user.emailVerified,role:account.role||'Estudiante',matched:user.emailVerified&&account.syncStatus==='matched',needsProfile:false});
 }catch(error){const authError=String(error.code||'').startsWith('auth/');res.status(authError?401:400).json({error:authError?'No se pudo verificar la sesión. Inicia sesión nuevamente.':error.message||'No se pudo guardar la solicitud.'});}
});










