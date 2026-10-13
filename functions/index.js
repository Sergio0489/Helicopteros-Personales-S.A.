'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
initializeApp();
const {policyFor,visiblePages,projectPage}=require('./access');
const {nativeView}=require('./native-view');
const DIRECTOR='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
const fields=['name','identity','birthDate','nationality','address','previousSchool','residentialPhone','phone','fatherName','motherName','emergencyName','emergencyPhone','funding','interests','notes','referredBy'];
const roles=['Director','Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
function cleanProfile(input){const profile={};for(const key of fields){if(key==='interests'){profile[key]=(Array.isArray(input[key])?input[key]:[]).filter(v=>['privado','comercial','ifr','multimotor','rpa','instructor'].includes(v));continue;}profile[key]=String(input[key]||'').trim().slice(0,key==='notes'?4000:500);}if(input.photo){if(typeof input.photo!=='string'||input.photo.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.photo))throw Error('Foto no válida.');profile.photo=input.photo;}if(!profile.name)throw Error('Ingresa el nombre completo.');if(profile.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))throw Error('Revisa la fecha de nacimiento.');return profile;}
function matchStudent(payload,email,uid){const matches=(payload.school?.students||[]).filter(s=>String(s.email||'').trim().toLowerCase()===email.toLowerCase());if(matches.length!==1||matches[0].authUid&&matches[0].authUid!==uid)return null;return matches[0];}
function matchRecord(payload,email,uid){
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return {status:'missing-email'};
 const records=[...(payload.school?.students||[]).map(record=>({record,kind:'student'})),...(payload.school?.registry?.clients||[]).map(record=>({record,kind:'client'}))];
 const matches=records.filter(({record})=>String(record.email||'').trim().toLowerCase()===normalized);
 if(matches.length!==1)return {status:matches.length?'duplicate-email':'no-match'};
 if(matches[0].record.authUid&&matches[0].record.authUid!==uid)return {status:'linked-to-another-user'};
 return {...matches[0],status:'matched'};
}
async function syncAccount(db,u,account,marker,readRoot){
 if(!u.emailVerified||!u.email)return account||{};
 if(account?.verified&&account.email===u.email&&marker&&account.syncedOperation===marker&&account.syncVersion===2)return account;
 const root=await readRoot(),payload=root?.payload?JSON.parse(root.payload):{},match=matchRecord(payload,u.email,u.uid);
 const profile={...account?.profile};if(match.record)for(const field of fields){const value=match.record[field];if(value!=null&&value!==''&&(!Array.isArray(value)||value.length))profile[field]=value;}
 if(!profile.name)profile.name=u.uid===DIRECTOR?'Sergio Herrera C.':u.displayName||'';
 const patch={profile,email:u.email,verified:true,verifiedAt:account?.verifiedAt||new Date().toISOString(),syncedOperation:root?.operation||null,syncVersion:2,syncStatus:match.status,studentId:match.kind==='student'?match.record.id:null,recordId:match.record?.id||null,recordKind:match.kind||null,recordName:match.record?.name||null};
 const ref=db.ref('accountRequests/'+u.uid);await ref.update(patch);return {...account,...patch};
}
exports.accountRegistration=onRequest({region:'us-central1',cors:['https://sergio0489.github.io'],minInstances:0,maxInstances:2},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method==='GET'){res.json({ready:true});return;}if(req.method!=='POST'){res.status(405).end();return;}
 try{
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token){res.status(401).json({error:'Inicia sesión.'});return;}
 const claims=await getAuth().verifyIdToken(token,true),user=await getAuth().getUser(claims.uid),action=req.body?.action,db=getDatabase(),ref=db.ref('accountRequests/'+user.uid);
 if(!user.email){res.status(400).json({error:'La cuenta necesita correo electrónico.'});return;}
 const actorAccount=(await ref.get()).val();
 const isDirector=!user.disabled&&(user.uid===DIRECTOR||(user.emailVerified&&actorAccount?.role==='Director'&&!!actorAccount.assignedAt));
 if(action==='session'){res.json({director:isDirector,name:actorAccount?.profile?.name||user.displayName||''});return;}
 if(action==='access'){
  if(!user.emailVerified||user.disabled){res.status(403).json({error:'Verifica tu correo para consultar el acceso.'});return;}
  let account=(await ref.get()).val();
  const root=(await db.ref('dashboard').get()).val();const data=root?.payload?JSON.parse(root.payload):{};
  account=await syncAccount(db,user,account,root?.operation,async()=>root);
  const policy=policyFor(data,account),pages=visiblePages(policy);
  if(req.body.page&&!pages.some(p=>p.id===req.body.page)){res.status(403).json({error:'No tienes permiso para consultar esta página.'});return;}
  res.json({mode:'read-only',role:account?.role||'Estudiante',name:account?.profile?.name||user.displayName||'',pages,native:req.body.page&&req.body.layout==='main'?nativeView(data,account,policy,req.body.page):null,page:req.body.page&&req.body.layout!=='main'?projectPage(data,account,policy,req.body.page):null});return;
 }
 if(action==='list'||action==='users'||action==='assign'){
  if(!isDirector){res.status(403).json({error:'Solo el Director puede asignar cargos.'});return;}
  if(action==='users'){
   const page=await getAuth().listUsers(100,typeof req.body.pageToken==='string'?req.body.pageToken:undefined);
   const marker=(await db.ref('dashboard/operation').get()).val();let rootPromise;const readRoot=()=>rootPromise||=(db.ref('dashboard').get().then(s=>s.val()));
   const users=await Promise.all(page.users.map(async u=>{const existing=(await db.ref('accountRequests/'+u.uid).get()).val();const a=await syncAccount(db,u,existing,marker,readRoot);return {uid:u.uid,name:a.profile?.name||u.displayName||(u.uid===DIRECTOR?'Sergio Herrera C.':''),email:u.email||'',phone:a.profile?.phone||u.phoneNumber||'',role:u.uid===DIRECTOR?'Director':a.role||'Estudiante',verified:!!u.emailVerified,disabled:!!u.disabled,createdAt:u.metadata.creationTime||a.createdAt||'',lastSignIn:u.metadata.lastSignInTime||'',assignedAt:a.assignedAt||'',studentId:u.emailVerified?a.studentId||'':'',recordName:u.emailVerified?a.recordName||'':'',recordKind:u.emailVerified?a.recordKind||'':'',syncStatus:u.emailVerified?a.syncStatus||'no-match':'unverified',hasProfile:!!a.profile};}));
   res.json({users,nextPageToken:page.pageToken||null});return;
  }
  if(action==='list'){const snapshot=await db.ref('accountRequests').get();res.json({requests:Object.entries(snapshot.val()||{}).map(([uid,v])=>({uid,...v}))});return;}
  if(!roles.includes(req.body.role)||!req.body.uid||req.body.uid===DIRECTOR||req.body.uid===user.uid){res.status(400).json({error:'Cargo o usuario no válido.'});return;}
  const target=await getAuth().getUser(req.body.uid);if(!target.emailVerified||target.disabled){res.status(400).json({error:'El usuario debe verificar primero su correo.'});return;}
  const targetRef=db.ref('accountRequests/'+target.uid);
  await targetRef.update({role:req.body.role,assignedBy:user.uid,assignedAt:new Date().toISOString()});res.json({ok:true});return;
 }
 if(!['submit','status'].includes(action)){res.status(400).json({error:'Operación no válida.'});return;}
 if(action==='submit'){
  const profile=cleanProfile(req.body.profile||{});await ref.transaction(old=>({...old,role:old?.role||'Estudiante',profile,email:user.email,syncedOperation:null,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}));
 }
 let account=(await ref.get()).val();
 if(user.emailVerified){const marker=(await db.ref('dashboard/operation').get()).val();account=await syncAccount(db,user,account,marker,async()=>(await db.ref('dashboard').get()).val());}
 if(!account?.profile?.name){res.json({needsProfile:true,email:user.email,verified:user.emailVerified});return;}

 res.json({profile:account.profile,email:user.email,verified:user.emailVerified,role:account.role||'Estudiante',matched:user.emailVerified&&account.syncStatus==='matched',needsProfile:false});
 }catch(error){const authError=String(error.code||'').startsWith('auth/');res.status(authError?401:400).json({error:authError?'No se pudo verificar la sesión. Inicia sesión nuevamente.':error.message||'No se pudo guardar la solicitud.'});}
});







