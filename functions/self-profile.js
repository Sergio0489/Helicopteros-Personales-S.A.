'use strict';
const {matchRecord}=require('./record-link');
const clone=v=>JSON.parse(JSON.stringify(v));
function clean(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','phone','photo'].includes(k)))throw Error('Solo puedes modificar nombre, celular y foto de tu perfil.');
 const name=String(input.name||'').trim(),phone=String(input.phone||'').trim(),photo=input.photo||'';
 if(!name||name.length>160||name.includes('@'))throw Error('Ingresa tu nombre completo.');
 if(phone.length>40)throw Error('Revisa el celular.');
 if(typeof photo!=='string'||photo.length>300000||(photo&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)))throw Error('Foto no válida.');
 return {name,phone,photo};
}
function locate(data,kind,id){const rows=kind==='student'?data.school?.students:kind==='client'?data.school?.registry?.clients:kind==='pilot'?data.pilotos:kind==='personnel'?data.school?.personnel:[];return (rows||[]).find((p,i)=>(p.id||(kind==='pilot'?'legacy-pilot-'+i:''))===id);}
function apply(data,user,profile){
 const next=clone(data),match=user.emailVerified?matchRecord(next,user.email,user.uid):{status:'unverified'};
 if(match.status==='duplicate-email'||match.status==='linked-to-another-user')throw Error('El correo no identifica un expediente único. Solicita al Director revisar la vinculación.');
 if(match.record){const record=locate(next,match.kind,match.record.id);record[match.kind==='pilot'?'nombre':'name']=profile.name;record[['pilot','personnel'].includes(match.kind)?'celular':'phone']=profile.phone;record.authUid=user.uid;for(const linked of require('./account-dossiers').recordRows(next)){if(linked.record===record||linked.record.authUid!==user.uid)continue;linked.record[linked.kind==='pilot'?'nombre':'name']=profile.name;linked.record[['pilot','personnel'].includes(linked.kind)?'celular':'phone']=profile.phone;}}
 // Keep receipt names and Director profile displays consistent with the own profile.
 next.school ||= {};next.school.userProfiles ||= {};next.school.paymentReceiverNames ||= {};
 next.school.userProfiles[user.uid]={...next.school.userProfiles[user.uid],...profile};next.school.paymentReceiverNames[user.uid]=profile.name;
 return {data:next,match};
}
function migrateEmail(data,user,account){
 if(!user.emailVerified||!account?.verified||!account.email||account.email.toLowerCase()===user.email.toLowerCase()||!account.recordId)return null;
 const next=clone(data),record=locate(next,account.recordKind,account.recordId);
 if(!record||String(record.email||'').trim().toLowerCase()!==account.email.trim().toLowerCase()||(record.authUid&&record.authUid!==user.uid))return null;
 const match=matchRecord(next,user.email,user.uid);
 if(match.status!=='no-match'&&!(match.kind===account.recordKind&&match.record?.id===account.recordId))throw Error('El nuevo correo coincide con otro expediente. El Director debe revisar la vinculación.');
 record.email=user.email;record.authUid=user.uid;for(const linked of require('./account-dossiers').recordRows(next))if(linked.record.authUid===user.uid&&String(linked.record.email||'').trim().toLowerCase()===account.email.trim().toLowerCase())linked.record.email=user.email;return next;
}
module.exports={clean,apply,migrateEmail,locate};
