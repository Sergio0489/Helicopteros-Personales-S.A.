'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const {randomUUID}=require('node:crypto');
const ROLES=['Director','Gerente','Administrativo','Contabilidad','Mecánico','Piloto','Estudiante'];
const email=v=>String(v||'').trim().toLowerCase();
const identity=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
const rows=data=>[
 ...(data.school?.students||[]).map(record=>({kind:'student',record})),
 ...(data.pilotos||[]).map(record=>({kind:'pilot',record})),
 ...(data.school?.personnel||[]).map(record=>({kind:'personnel',record})),
 ...(data.school?.registry?.clients||[]).map(record=>({kind:'client',record}))
];
const highest=values=>ROLES.find(r=>values.includes(r))||'Estudiante';
function personKey(data,kind,id){if(!id)return '';return Object.entries(data.school?.identityLinks||{}).find(([,v])=>(v.records||[]).some(r=>r.kind===kind&&r.id===id))?.[0]||'';}
function items(root){
 const data=JSON.parse(root.dashboard?.payload||'{}');
 return [...Object.entries(root.accountRequests||{}).filter(([,a])=>!a.mergedInto).map(([uid,a])=>({key:'user:'+uid,uid,name:a.profile?.name||'',email:a.email||'',identity:a.profile?.identity||'',role:a.role||'Estudiante',assigned:!!a.assignedAt})),...rows(data).map(({kind,record:r},index)=>({key:kind+':'+(r.id||'index-'+index),kind,id:r.id,index,personKey:personKey(data,kind,r.id),uid:r.authUid||'',name:r.nombre||r.name||'',email:r.email||'',identity:r.identity||''}))];
}
function groups(root){
 const all=items(root),parents=all.map((_,i)=>i),find=i=>parents[i]===i?i:parents[i]=find(parents[i]);const seen=new Map();
 all.forEach((x,i)=>{for(const key of [x.personKey&&'p:'+x.personKey,x.uid&&'u:'+x.uid,email(x.email)&&'e:'+email(x.email),identity(x.identity)&&'i:'+identity(x.identity)].filter(Boolean)){if(seen.has(key))parents[find(i)]=find(seen.get(key));else seen.set(key,i);}});
 const grouped=new Map();all.forEach((x,i)=>{const k=find(i);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(x);});
 return [...grouped.values()].filter(g=>{const records=g.filter(x=>x.kind),uids=new Set(g.filter(x=>x.key.startsWith('user:')).map(x=>x.uid));
  const oneOwner=records.length&&records.every(x=>x.uid&&x.uid===records[0].uid),onePerson=records.length&&records.every(x=>x.personKey&&x.personKey===records[0].personKey);
  const different=g.some(x=>x.kind)&&['name','email','identity'].some(key=>new Set(g.map(x=>key==='identity'?identity(x[key]):email(x[key]).replace(/\s+/g,' ')).filter(Boolean)).size>1);
  return different||uids.size>1||records.some(x=>!x.uid)&&uids.size>0||records.length>1&&!oneOwner&&!onePerson||['student','pilot','personnel','client'].some(k=>records.filter(x=>x.kind===k).length>1);
 }).map(g=>({members:g,uids:[...new Set(g.filter(x=>x.key.startsWith('user:')).map(x=>x.uid))],role:g.some(x=>x.key.startsWith('user:'))?highest(g.filter(x=>x.key.startsWith('user:')&&x.assigned).map(x=>x.role)):null}));
}
const personal=new Set(['name','nombre','phone','celular','email','identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura','notes','position','fechaInicioHP','directoryKind','authUid','id','createdAt','createdDate','updatedAt']);
function combine(a,b,path=''){
 if(a==null||a==='')return clone(b);if(b==null||b==='')return clone(a);if(JSON.stringify(a)===JSON.stringify(b))return clone(a);
 if(Array.isArray(a)&&Array.isArray(b)){const out=clone(a);for(const v of b){const hit=v&&typeof v==='object'&&v.id?out.findIndex(x=>x?.id===v.id):out.findIndex(x=>JSON.stringify(x)===JSON.stringify(v));if(hit<0)out.push(clone(v));else out[hit]=combine(out[hit],v,path+'[]');}return out;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out=clone(a);for(const [k,v]of Object.entries(b))out[k]=k in out?combine(out[k],v,path+'.'+k):clone(v);return out;}
 // Do not silently choose between conflicting financial, flight or credential values.
 throw Error('Hay información distinta en '+path+'. Revisa esos valores antes de unificar.');
}
function merge(root,memberKeys,actorUid,rootDirector,now=new Date().toISOString(),primaryKey=''){
 const selected=groups(root).find(g=>g.members.map(x=>x.key).sort().join('|')===[...memberKeys].sort().join('|'));if(!selected)throw Error('La coincidencia cambió. Vuelve a consultar.');
 const out=clone(root),accounts=out.accountRequests||{},data=JSON.parse(out.dashboard.payload),members=selected.members;
 const ranked=[...selected.uids].sort((a,b)=>{if(a===rootDirector)return -1;if(b===rootDirector)return 1;const rank=uid=>ROLES.indexOf(accounts[uid]?.assignedAt?accounts[uid].role:'Estudiante');return rank(a)-rank(b)||a.localeCompare(b);});
 const uid=ranked[0]||null;if(ranked.some(u=>!accounts[u]?.verified))throw Error('Todos los correos de las cuentas deben estar verificados antes de unificar.');
 const role=!uid?null:uid===rootDirector?'Director':highest(ranked.map(u=>accounts[u].assignedAt?accounts[u].role:'Estudiante'));
 if(members.some(m=>m.kind&&m.uid&&!ranked.includes(m.uid)))throw Error('Un expediente está vinculado a una cuenta no incluida. Actualiza USUARIOS antes de unificar.');
 const primary=members.find(m=>m.key===primaryKey&&m.kind)||members.find(m=>m.kind);
 if((!uid&&!primary)||(primaryKey&&!members.some(m=>m.key===primaryKey&&m.kind)))throw Error('Selecciona un expediente principal válido.');
 const oldRecords=rows(data),originals=members.filter(m=>m.kind).map(m=>{const found=m.id?oldRecords.find(x=>x.kind===m.kind&&x.record.id===m.id):oldRecords[m.index];if(!found||found.kind!==m.kind)throw Error('El expediente cambió. Actualiza.');const original=clone(found.record);found.record.id ||= 'identity-record-'+randomUUID();return {...found,key:m.key,original,record:clone(found.record)};});
 const primaryRecord=originals.find(x=>x.key===primary?.key)?.record||{};
 const principalEmail=uid?accounts[uid].email:primaryRecord.email||originals.find(x=>x.record.email)?.record.email||'';
 const personId='person-'+randomUUID();
 const linkedIds=new Set();
 const mappings=[];for(const kind of ['student','pilot','personnel','client']){
  const source=originals.filter(x=>x.kind===kind).sort((a,b)=>uid?(b.record.authUid===uid)-(a.record.authUid===uid):(b.key===primary.key)-(a.key===primary.key));if(!source.length)continue;
  let target=clone(source[0].record);for(const {record:r}of source.slice(1)){for(const [key,value]of Object.entries(r)){if(personal.has(key)){if(!target[key])target[key]=clone(value);}else target[key]=key in target?combine(target[key],value,kind+'.'+key):clone(value);}mappings.push({kind,from:r.id,to:target.id});}
  if(uid){target.authUid=uid;target.directoryKind=role==='Piloto'?'pilot':role==='Estudiante'?'student':'personnel';}target.email=principalEmail;linkedIds.add(kind+':'+target.id);
  const list=kind==='pilot'?data.pilotos:kind==='student'?data.school.students:kind==='personnel'?data.school.personnel:data.school.registry.clients;
  const ids=new Set(source.map(x=>x.record.id));const at=list.findIndex(x=>ids.has(x.id));list.splice(at,1,target);for(let i=list.length-1;i>=0;i--)if(i!==at&&ids.has(list[i].id))list.splice(i,1);
 }
 // Share the canonical personal fields while retaining each operational section.
 const linked=rows(data).filter(x=>linkedIds.has(x.kind+':'+x.record.id)),profile=uid?clone(accounts[uid].profile||{}):{...clone(primaryRecord),name:primaryRecord.nombre||primaryRecord.name||''};
 for(const u of ranked)for(const [k,v]of Object.entries(accounts[u].profile||{}))if(!profile[k]&&v)profile[k]=clone(v);
 if(primaryKey){for(const k of ['identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura'])if(primaryRecord[k])profile[k]=clone(primaryRecord[k]);profile.name=primaryRecord.nombre||primaryRecord.name||profile.name;}
 for(const {record:r}of linked)for(const k of personal)if(!['id','authUid','directoryKind','position','email','name','nombre','phone','celular'].includes(k)&&!profile[k]&&r[k])profile[k]=clone(r[k]);
 for(const {record:r,kind}of linked){for(const k of ['identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura'])if(profile[k])r[k]=profile[k];if(profile.name)r[kind==='pilot'?'nombre':'name']=profile.name;}
 const map=(kind,id)=>mappings.find(m=>m.kind===kind&&m.from===id)?.to||id;
 function remap(o){if(!o||typeof o!=='object')return;if(o.personRef)o.personRef.id=map(o.personRef.kind,o.personRef.id);if(o.personKind&&o.personId)o.personId=map(o.personKind,o.personId);if(o.recordKind&&o.recordId)o.recordId=map(o.recordKind,o.recordId);if(o.studentId)o.studentId=map('student',o.studentId);if(o.pilotId)o.pilotId=map('pilot',o.pilotId);if(typeof o.personKey==='string'){const [k,...rest]=o.personKey.split(':');o.personKey=k+':'+map(k,rest.join(':'));}for(const value of Object.values(o))if(value&&typeof value==='object')remap(value);}
 remap(data);
 const pilotIds=new Set(originals.filter(x=>x.kind==='pilot').map(x=>x.record.id));
 for(const {kind,record:r}of originals){if(kind!=='pilot'||!profile.name||r.nombre===profile.name)continue;
  if((JSON.parse(root.dashboard.payload).pilotos||[]).some(p=>p.nombre===r.nombre&&!pilotIds.has(p.id)&&!originals.some(x=>x.kind==='pilot'&&!x.original.id&&JSON.stringify(x.original)===JSON.stringify(p))))throw Error('Hay pilotos diferentes con el mismo nombre. Revisa sus nombres antes de unificar.');
  for(const f of data.itinerarios||[])if(f.piloto===r.nombre)f.piloto=profile.name;
  for(const f of data.school?.registry?.entries||[])for(const k of ['pilot','copilot'])if(f[k]===r.nombre)f[k]=profile.name;
 }
 for(const u of ranked){accounts[u].syncedOperation=null;if(u!==uid){accounts[u].mergedInto=uid;accounts[u].mergedAt=now;accounts[u].mergedBy=actorUid;accounts[u].role='Estudiante';accounts[u].assignedAt=null;}}
 if(uid)Object.assign(accounts[uid],{role,profile,syncedOperation:null,mergedAt:now});
 data.school ||= {};data.school.userProfiles ||= {};for(const u of ranked)if(u!==uid)delete data.school.userProfiles[u];if(uid)delete data.school.userProfiles[uid]?.dossier;
 data.school.identityLinks ||= {};const selectedRefs=new Set(originals.map(x=>x.kind+':'+x.record.id));for(const [key,value]of Object.entries(data.school.identityLinks))if((value.records||[]).some(r=>selectedRefs.has(r.kind+':'+r.id)))delete data.school.identityLinks[key];
 data.school.identityLinks[personId]={records:linked.map(x=>({kind:x.kind,id:x.record.id})),mergedAt:now};
 out.dashboard.payload=JSON.stringify(data);
 out.identityMergeArchive ||= {};out.identityMergeArchive[now.replace(/[^0-9]/g,'')+'-'+personId]={actorUid,uid,role,accounts:Object.fromEntries(ranked.map(u=>[u,clone(root.accountRequests[u])])),records:originals,at:now};
 return {root:out,uid,role,mergedUids:ranked.filter(u=>u!==uid),email:principalEmail,personId};
}
function syncLinked(before,after){
 const oldRows=rows(before),newRows=rows(after);
 for(const link of Object.values(before.school?.identityLinks||{})){
  const matches=newRows.filter(x=>(link.records||[]).some(r=>r.kind===x.kind&&r.id===x.record.id));
  for(const key of ['email','identity']){
   const changes=matches.filter(x=>{const old=oldRows.find(r=>r.kind===x.kind&&r.record.id===x.record.id);return old&&String(old.record[key]||'')!==String(x.record[key]||'');});
   if(!changes.length)continue;const normalize=key==='email'?email:identity;
   if(new Set(changes.map(x=>normalize(x.record[key]))).size>1)throw Error('Los expedientes unificados tienen cambios contradictorios en '+(key==='email'?'correo':'cédula')+'.');
   for(const x of matches)x.record[key]=String(changes[0].record[key]||'').trim();
  }
 }
 return after;
}
function assertUnique(before,after){
 const b=rows(before),a=rows(after),samePerson=(x,y)=>{const k=personKey(after,x.kind,x.record.id);return !!k&&k===personKey(after,y.kind,y.record.id);},old=new Map(b.map(x=>[x.kind+':'+x.record.id,x.record]));
 for(const x of a){const r=x.record,prev=old.get(x.kind+':'+r.id);if(prev&&email(prev.email)===email(r.email)&&identity(prev.identity)===identity(r.identity))continue;
  if(a.some(y=>y!==x&&!samePerson(x,y)&&!(r.authUid&&r.authUid===y.record.authUid)&&((email(r.email)&&email(r.email)===email(y.record.email))||(identity(r.identity)&&identity(r.identity)===identity(y.record.identity)))))throw Error('El correo o la cédula ya pertenece a otro expediente. Unifica la coincidencia desde USUARIOS antes de guardar.');
 }
}
module.exports={ROLES,email,identity,highest,groups,merge,assertUnique,syncLinked};
