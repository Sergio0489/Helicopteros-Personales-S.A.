'use strict';
// Individual grants supplement the existing company role; they never broaden a role policy.
const {email}=require('./prospects');
const STAFF=['Administrativo','Gerente'];
function scope(user,account,director=false){
 if(!user.emailVerified||user.disabled||account?.mergedInto)return null;
 if(director)return {director:true,area:null,name:account?.profile?.name||user.displayName||''};
 const grant=account?.prospectAccess;
 if(!account?.assignedAt||!STAFF.includes(account.role)||!grant?.assignedAt||!['charters','school'].includes(grant.area)||grant.email!==String(user.email||'').toLowerCase())return null;
 return {director:false,area:grant.area,name:account.profile?.name||user.displayName||''};
}
async function configure(auth,db,input,actor,now=new Date().toISOString()){
 if(input.confirm!==true)throw Error('Confirma el acceso individual antes de guardarlo.');
 const address=email(input.email),area=input.area,name=String(input.name||'').trim().slice(0,160);
 if(!['charters','school'].includes(area)||!name)throw Error('Selecciona un área e indica el nombre.');
 let target,created=false;
 try{target=await auth.getUserByEmail(address);}catch(e){if(e.code!=='auth/user-not-found')throw e;if(input.createAdministrative!==true)throw Error('Ese correo no tiene usuario. Autoriza crear su cuenta administrativa.');target=await auth.createUser({email:address,displayName:name,emailVerified:false,disabled:false});created=true;}
 if(target.disabled||target.uid===actor.uid)throw Error('No se puede asignar este acceso a esa cuenta.');
 let failure='';const result=await db.ref('accountRequests/'+target.uid).transaction(old=>{
  failure='';if(old===null&&!created&&input.createAdministrative!==true)return old;
  if(old?.mergedInto){failure='La cuenta fue unificada. Usa la cuenta principal.';return;}
  if(old?.assignedAt&&!STAFF.includes(old.role)){failure='El usuario tiene otro cargo. Revísalo en Usuarios.';return;}
  if(!old?.assignedAt&&input.createAdministrative!==true){failure='Primero confirma su cargo administrativo.';return;}
  const next={...old,email:address,profile:{...old?.profile,name:old?.profile?.name||name},prospectAccess:{area,email:address,assignedAt:now,assignedBy:actor.uid},updatedAt:now};
  if(!old?.assignedAt)Object.assign(next,{role:'Administrativo',assignedAt:now,assignedBy:actor.uid,createdAt:old?.createdAt||now});
  return require('./audit').attach(old,next,actor,'account','Acceso individual a interesados: '+area,target.uid);
 },undefined,false);
 if(failure||!result.committed||!result.snapshot.val())throw Error(failure||'No se confirmó el acceso. Confirma primero el cargo del usuario.');
 return {ok:true,email:address,area,role:result.snapshot.val().role,created,verified:target.emailVerified};
}
module.exports={scope,configure};
