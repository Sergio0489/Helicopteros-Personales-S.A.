'use strict';
function matchRecord(payload,email,uid){
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return {status:'missing-email'};
 const records=[...(payload.school?.students||[]).map(record=>({record,kind:'student'})),...(payload.school?.personnel||[]).map(p=>({kind:'personnel',record:{...p,phone:p.celular||p.phone||''}})),...(payload.school?.registry?.clients||[]).map(record=>({record,kind:'client'})),...(payload.pilotos||[]).map((p,i)=>({kind:'pilot',record:{...p,id:p.id||'legacy-pilot-'+i,name:p.nombre||p.name||'',phone:p.celular||p.phone||'',residentialPhone:p.telefono||p.residentialPhone||''}}))];
 const matches=records.filter(({record})=>(uid&&record.authUid===uid)||String(record.email||'').trim().toLowerCase()===normalized);
 const pointer=payload.school?.userProfiles?.[uid]?.dossier;
 if(matches.some(p=>p.record.authUid&&p.record.authUid!==uid))return {status:'linked-to-another-user'};
 if(new Set(matches.map(p=>p.kind)).size!==matches.length)return {status:'duplicate-email'};
 if(pointer){const linked=matches.filter(p=>p.kind===pointer.kind&&p.record.id===pointer.id&&p.record.authUid===uid);if(linked.length===1&&matches.every(p=>p.record.authUid===uid))return {...linked[0],status:'matched'};}
 if(matches.length!==1)return {status:matches.length?'duplicate-email':'no-match'};
 if(matches[0].record.authUid&&matches[0].record.authUid!==uid)return {status:'linked-to-another-user'};
 return {...matches[0],status:'matched'};
}
module.exports={matchRecord};

