'use strict';
(function(root){
 const key=v=>String(v||'').trim().toLocaleLowerCase('es');
 function report(data,now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const current=parts.year+'-'+parts.month,monthOffset=n=>new Date(Date.UTC(+parts.year,+parts.month-1+n,1)).toISOString().slice(0,7);
  const published=monthOffset(parts.day==='01'&&parts.hour==='00'&&parts.minute==='00'?-2:-1);
  const people=new Map((data.school?.students||[]).map(s=>[String(s.id),s.name]));
  const pilots=new Map((data.pilotos||[]).filter(p=>p.id!=null).map(p=>[String(p.id),p.nombre]));
  function rank(month){const maps=[new Map(),new Map(),new Map()],seen=new Set();
   const add=(i,id,name,n)=>{if(!name||!String(name).trim())return;const k=id||key(name),v=maps[i].get(k)||{name:String(name).trim(),hours100:0};v.hours100+=n;maps[i].set(k,v);};
   for(const e of data.school?.registry?.entries||[]){if(e.voidedAt||e.deletedAt||e.equipmentKind==='simulador'||e.equipmentKind==='rpa'||/sim|drone|^rpa$/i.test(e.aircraft||''))continue;
    const date=/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')?e.date:String(e.date||'').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1');
    const n=Number(e.hours100);if(!date.startsWith(month+'-')||date>current+'-'+parts.day||!Number.isFinite(n)||n<=0)continue;if(e.id&&seen.has(e.id))continue;if(e.id)seen.add(e.id);
    add(0,e.pilotId?'pilot:'+e.pilotId:null,pilots.get(String(e.pilotId))||e.pilot,n);add(1,key(e.aircraft).replace(/[^a-z0-9]/g,''),e.aircraft,n);
    if(e.personKind==='student')add(2,e.personId?'student:'+e.personId:null,people.get(String(e.personId))||e.personName,n);
   }
   return maps.map(m=>[...m.values()].sort((a,b)=>b.hours100-a.hours100||a.name.localeCompare(b.name,'es')));
  }
  return {current,published,winners:rank(published).map(rows=>rows.filter(r=>r.hours100===rows[0]?.hours100)),leaders:rank(current).map(rows=>rows.slice(0,3))};
 }
 const api={report};if(typeof module!=='undefined')module.exports=api;else root.HPMonthlyWinners=api;
})(typeof window==='undefined'?globalThis:window);
