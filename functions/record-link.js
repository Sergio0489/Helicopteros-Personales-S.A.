'use strict';
function matchRecord(payload,email,uid){
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return {status:'missing-email'};
 const records=[...(payload.school?.students||[]).map(record=>({record,kind:'student'})),...(payload.school?.registry?.clients||[]).map(record=>({record,kind:'client'})),...(payload.pilotos||[]).map((p,i)=>({kind:'pilot',record:{...p,id:p.id||'legacy-pilot-'+i,name:p.nombre||p.name||'',phone:p.celular||p.phone||'',residentialPhone:p.telefono||p.residentialPhone||''}}))];
 const matches=records.filter(({record})=>String(record.email||'').trim().toLowerCase()===normalized);
 if(matches.length!==1)return {status:matches.length?'duplicate-email':'no-match'};
 if(matches[0].record.authUid&&matches[0].record.authUid!==uid)return {status:'linked-to-another-user'};
 return {...matches[0],status:'matched'};
}
module.exports={matchRecord};
