'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const normalize=v=>String(v||'').trim().toLowerCase();
const common=['identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura','notes'];
const studentFields=['previousSchool','residentialPhone','fatherName','motherName','funding','interests','referredBy'];
const kindFor=role=>role==='Piloto'?'pilot':!role||role==='Estudiante'?'student':'personnel';
const recordRows=data=>[
 ...(data.school?.students||[]).map(record=>({kind:'student',record})),
 ...(data.pilotos||[]).map(record=>({kind:'pilot',record})),
 ...(data.school?.personnel||[]).map(record=>({kind:'personnel',record})),
 ...(data.school?.registry?.clients||[]).map(record=>({kind:'client',record}))
];
function ensure(data,user,account={},now=new Date().toISOString()){
 const next=clone(data),email=normalize(user.email),role=account.role||'Estudiante',kind=user.emailVerified?kindFor(role):'student';
 if(!email||user.disabled)return {data,changed:false,status:'unavailable'};
 const candidates=recordRows(next).filter(p=>normalize(p.record.email)===email);
 // Unverified registrations must never read, claim, or overwrite an existing dossier.
 if(!user.emailVerified&&candidates.length)return {data,changed:false,status:'unverified'};
 if(candidates.some(p=>p.record.authUid&&p.record.authUid!==user.uid))return {data,changed:false,status:'linked-to-another-user'};
 if(['student','pilot','personnel','client'].some(k=>candidates.filter(p=>p.kind===k).length>1))return {data,changed:false,status:'duplicate-email'};
 let target=candidates.find(p=>p.kind===kind)?.record;
 const source=candidates.find(p=>p.kind===account.recordKind)?.record||target||candidates[0]?.record||{};
 const profile={...account.profile};for(const key of [...common,...studentFields,'name','phone'])if(source[key]!=null&&source[key]!==''&&(!Array.isArray(source[key])||source[key].length))profile[key]=source[key];
 profile.name=source.nombre||source.name||profile.name||user.displayName||'';profile.phone=source.celular||source.phone||profile.phone||'';
 if(!String(profile.name).trim())return {data,changed:false,status:'missing-profile'};
 next.school ||= {};
 if(!target){
  target={id:'account-'+user.uid,email:user.email};
  for(const key of common)if(profile[key]!=null)target[key]=String(profile[key]).slice(0,2000);
  if(kind==='student'){for(const key of studentFields)if(profile[key]!=null)target[key]=clone(profile[key]);Object.assign(target,{name:profile.name,phone:profile.phone,courses:[],stage:'Interesado',createdDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),createdAt:now});(next.school.students ||= []).push(target);}
  if(kind==='pilot'){Object.assign(target,{nombre:profile.name,celular:profile.phone,verificaciones:[]});(next.pilotos ||= []).push(target);}
  if(kind==='personnel'){Object.assign(target,{name:profile.name,celular:profile.phone,position:role,fechaInicioHP:''});(next.school.personnel ||= []).push(target);}
 }
 if(target!==source&&user.emailVerified&&account.recordKind&&account.recordKind!==kind){for(const key of common)if(profile[key]!=null)target[key]=String(profile[key]).slice(0,2000);target[kind==='pilot'?'nombre':'name']=profile.name;target[['pilot','personnel'].includes(kind)?'celular':'phone']=profile.phone;}
 if(kind==='personnel'&&(!target.position||target.position===account.syncedRole))target.position=role;
 target.id ||= 'account-'+user.uid;
 target.authUid=user.uid;
 if(user.emailVerified){
  // Keep source academic/financial and aviation records intact. Directory classification only.
  for(const {record,kind:k}of candidates){record.authUid=user.uid;if(k!=='client')record.directoryKind=kind;}
  target.directoryKind=kind;
  next.school.userProfiles ||= {};next.school.userProfiles[user.uid]={...next.school.userProfiles[user.uid],dossier:{kind,id:target.id}};
 }
 const changed=JSON.stringify(data)!==JSON.stringify(next);
 return {data:next,changed,status:user.emailVerified?'matched':'unverified',kind,record:target};
}
module.exports={ensure,kindFor,recordRows};
