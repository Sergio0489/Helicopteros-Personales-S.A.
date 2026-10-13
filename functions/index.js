'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
initializeApp();
const DIRECTOR='glCsyjLhlyNRmazYA6Y9Gj3u0l13';
const fields=['name','identity','birthDate','nationality','address','previousSchool','residentialPhone','phone','fatherName','motherName','emergencyName','emergencyPhone','funding','interests','notes','referredBy'];
const roles=['Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
function cleanProfile(input){const profile={};for(const key of fields){if(key==='interests'){profile[key]=(Array.isArray(input[key])?input[key]:[]).filter(v=>['privado','comercial','ifr','multimotor','rpa','instructor'].includes(v));continue;}profile[key]=String(input[key]||'').trim().slice(0,key==='notes'?4000:500);}if(input.photo){if(typeof input.photo!=='string'||input.photo.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.photo))throw Error('Foto no válida.');profile.photo=input.photo;}if(!profile.name)throw Error('Ingresa el nombre completo.');if(profile.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))throw Error('Revisa la fecha de nacimiento.');return profile;}
function matchStudent(payload,email,uid){const matches=(payload.school?.students||[]).filter(s=>String(s.email||'').trim().toLowerCase()===email.toLowerCase());if(matches.length!==1||matches[0].authUid&&matches[0].authUid!==uid)return null;return matches[0];}
exports.accountRegistration=onRequest({region:'us-central1',cors:['https://sergio0489.github.io'],maxInstances:5},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method==='GET'){res.json({ready:true});return;}if(req.method!=='POST'){res.status(405).end();return;}
 try{
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token){res.status(401).json({error:'Inicia sesión.'});return;}
 const claims=await getAuth().verifyIdToken(token,true),user=await getAuth().getUser(claims.uid),action=req.body?.action,db=getDatabase(),ref=db.ref('accountRequests/'+user.uid);
 if(!user.email){res.status(400).json({error:'La cuenta necesita correo electrónico.'});return;}
 if(action==='list'||action==='assign'){
  if(user.uid!==DIRECTOR){res.status(403).json({error:'Solo el Director puede asignar cargos.'});return;}
  if(action==='list'){const snapshot=await db.ref('accountRequests').get();res.json({requests:Object.entries(snapshot.val()||{}).map(([uid,v])=>({uid,...v}))});return;}
  if(!roles.includes(req.body.role)||!req.body.uid||req.body.uid===DIRECTOR){res.status(400).json({error:'Cargo o usuario no válido.'});return;}
  const target=await getAuth().getUser(req.body.uid);if(!target.emailVerified){res.status(400).json({error:'El usuario debe verificar primero su correo.'});return;}
  const targetRef=db.ref('accountRequests/'+target.uid);if(!(await targetRef.get()).exists()){res.status(404).json({error:'Solicitud no encontrada.'});return;}
  await targetRef.update({role:req.body.role,assignedBy:user.uid,assignedAt:new Date().toISOString()});res.json({ok:true});return;
 }
 if(!['submit','status'].includes(action)){res.status(400).json({error:'Operación no válida.'});return;}
 if(action==='submit'){
  const profile=cleanProfile(req.body.profile||{});await ref.transaction(old=>({...old,role:old?.role||'Estudiante',profile,email:user.email,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}));
 }
 let account=(await ref.get()).val();if(!account){res.json({needsProfile:true,email:user.email,verified:user.emailVerified});return;}
 if(user.emailVerified){
  const root=(await db.ref('dashboard').get()).val();let payload={};if(root?.payload)payload=JSON.parse(root.payload);
  const student=matchStudent(payload,user.email,user.uid);const patch={verified:true,email:user.email,verifiedAt:account.verifiedAt||new Date().toISOString()};
  if(student){const profile={...account.profile};for(const field of fields)if(student[field]!=null&&student[field]!==''&&(!Array.isArray(student[field])||student[field].length))profile[field]=student[field];patch.profile=profile;patch.studentId=student.id;patch.syncStatus='matched';}else{patch.studentId=null;patch.syncStatus='no-unique-match';}
  await ref.update(patch);account=(await ref.get()).val();
 }
 res.json({profile:account.profile,email:user.email,verified:user.emailVerified,role:account.role||'Estudiante',matched:user.emailVerified&&account.syncStatus==='matched',needsProfile:false});
 }catch(error){const authError=String(error.code||'').startsWith('auth/');res.status(authError?401:400).json({error:authError?'No se pudo verificar la sesión. Inicia sesión nuevamente.':error.message||'No se pudo guardar la solicitud.'});}
});

