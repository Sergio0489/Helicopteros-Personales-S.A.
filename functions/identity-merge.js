'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
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
function items(root){
 const data=JSON.parse(root.dashboard?.payload||'{}');
 return [...Object.entries(root.accountRequests||{}).filter(([,a])=>!a.mergedInto).map(([uid,a])=>({key:'user:'+uid,uid,name:a.profile?.name||'',email:a.email||'',identity:a.profile?.identity||'',role:a.role||'Estudiante',assigned:!!a.assignedAt})),...rows(data).map(({kind,record:r},index)=>({key:kind+':'+(r.id||'index-'+index),kind,id:r.id,uid:r.authUid||'',name:r.nombre||r.name||'',email:r.email||'',identity:r.identity||''}))];
}
function groups(root){
 const all=items(root),parents=all.map((_,i)=>i),find=i=>parents[i]===i?i:parents[i]=find(parents[i]);const seen=new Map();
 all.forEach((x,i)=>{for(const key of [x.uid&&'u:'+x.uid,email(x.email)&&'e:'+email(x.email),identity(x.identity)&&'i:'+identity(x.identity)].filter(Boolean)){if(seen.has(key))parents[find(i)]=find(seen.get(key));else seen.set(key,i);}});
 const grouped=new Map();all.forEach((x,i)=>{const k=find(i);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(x);});
 return [...grouped.values()].filter(g=>{const u=new Set(g.filter(x=>x.key.startsWith('user:')).map(x=>x.uid));return u.size>1||g.some(x=>x.kind&&!x.uid)&&g.length>1||['student','pilot','personnel','client'].some(k=>g.filter(x=>x.kind===k).length>1);}).map(g=>({members:g,uids:[...new Set(g.filter(x=>x.key.startsWith('user:')).map(x=>x.uid))],role:highest(g.filter(x=>x.key.startsWith('user:')&&x.assigned).map(x=>x.role))}));
}
const personal=new Set(['name','nombre','phone','celular','email','identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura','notes','position','fechaInicioHP','directoryKind','authUid','id','createdAt','createdDate','updatedAt']);
function combine(a,b,path=''){
 if(a==null||a==='')return clone(b);if(b==null||b==='')return clone(a);if(JSON.stringify(a)===JSON.stringify(b))return clone(a);
 if(Array.isArray(a)&&Array.isArray(b)){const out=clone(a);for(const v of b){const hit=v&&typeof v==='object'&&v.id?out.findIndex(x=>x?.id===v.id):out.findIndex(x=>JSON.stringify(x)===JSON.stringify(v));if(hit<0)out.push(clone(v));else out[hit]=combine(out[hit],v,path+'[]');}return out;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out=clone(a);for(const [k,v]of Object.entries(b))out[k]=k in out?combine(out[k],v,path+'.'+k):clone(v);return out;}
 // Do not silently choose between conflicting financial, flight or credential values.
 throw Error('Hay información distinta en '+path+'. Revisa esos valores antes de unificar.');
}
function merge(root,memberKeys,actorUid,rootDirector,now=new Date().toISOString()){
 const selected=groups(root).find(g=>g.members.map(x=>x.key).sort().join('|')===[...memberKeys].sort().join('|'));if(!selected)throw Error('La coincidencia cambió. Vuelve a consultar.');
 if(!selected.uids.length)throw Error('La coincidencia necesita una cuenta de usuario para vincularse.');
 const out=clone(root),accounts=out.accountRequests,data=JSON.parse(out.dashboard.payload),members=selected.members;
 const ranked=[...selected.uids].sort((a,b)=>{if(a===rootDirector)return -1;if(b===rootDirector)return 1;const rank=uid=>ROLES.indexOf(accounts[uid]?.assignedAt?accounts[uid].role:'Estudiante');return rank(a)-rank(b)||a.localeCompare(b);});
 const uid=ranked[0];if(ranked.some(u=>!accounts[u]?.verified))throw Error('Todos los correos de las cuentas deben estar verificados antes de unificar.');
 const role=uid===rootDirector?'Director':highest(ranked.map(u=>accounts[u].assignedAt?accounts[u].role:'Estudiante'));
 const originals=members.filter(m=>m.kind).map(m=>{const found=rows(data).find(x=>x.kind===m.kind&&x.record.id===m.id);if(!found||!m.id)throw Error('Actualiza primero los expedientes sin identificador.');return {...found,record:clone(found.record)};});
 const mappings=[];for(const kind of ['student','pilot','personnel','client']){
  const source=originals.filter(x=>x.kind===kind).sort((a,b)=>(b.record.authUid===uid)-(a.record.authUid===uid));if(!source.length)continue;
  let target=clone(source[0].record);for(const {record:r}of source.slice(1)){for(const [key,value]of Object.entries(r)){if(personal.has(key)){if(!target[key])target[key]=clone(value);}else target[key]=key in target?combine(target[key],value,kind+'.'+key):clone(value);}mappings.push({kind,from:r.id,to:target.id});}
  target.authUid=uid;target.email=accounts[uid].email;target.directoryKind=role==='Piloto'?'pilot':role==='Estudiante'?'student':'personnel';
  const list=kind==='pilot'?data.pilotos:kind==='student'?data.school.students:kind==='personnel'?data.school.personnel:data.school.registry.clients;
  const ids=new Set(source.map(x=>x.record.id));const at=list.findIndex(x=>ids.has(x.id));list.splice(at,1,target);for(let i=list.length-1;i>=0;i--)if(i!==at&&ids.has(list[i].id))list.splice(i,1);
 }
 // Share the canonical personal fields while retaining each operational section.
 const linked=rows(data).filter(x=>x.record.authUid===uid),profile=clone(accounts[uid].profile||{});
 for(const u of ranked)for(const [k,v]of Object.entries(accounts[u].profile||{}))if(!profile[k]&&v)profile[k]=clone(v);
 for(const {record:r}of linked)for(const k of personal)if(!['id','authUid','directoryKind','position','email','name','nombre','phone','celular'].includes(k)&&!profile[k]&&r[k])profile[k]=clone(r[k]);
 for(const {record:r,kind}of linked){for(const k of ['identity','birthDate','nationality','address','emergencyName','emergencyPhone','peso','estatura'])if(profile[k])r[k]=profile[k];if(profile.name)r[kind==='pilot'?'nombre':'name']=profile.name;}
 const map=(kind,id)=>mappings.find(m=>m.kind===kind&&m.from===id)?.to||id;
 function remap(o){if(!o||typeof o!=='object')return;if(o.personRef)o.personRef.id=map(o.personRef.kind,o.personRef.id);if(o.personKind&&o.personId)o.personId=map(o.personKind,o.personId);if(o.recordKind&&o.recordId)o.recordId=map(o.recordKind,o.recordId);if(o.studentId)o.studentId=map('student',o.studentId);if(o.pilotId)o.pilotId=map('pilot',o.pilotId);if(typeof o.personKey==='string'){const [k,...rest]=o.personKey.split(':');o.personKey=k+':'+map(k,rest.join(':'));}for(const value of Object.values(o))if(value&&typeof value==='object')remap(value);}
 remap(data);
 const pilotIds=new Set(originals.filter(x=>x.kind==='pilot').map(x=>x.record.id));
 for(const {kind,record:r}of originals){if(kind!=='pilot'||!profile.name||r.nombre===profile.name)continue;
  if((JSON.parse(root.dashboard.payload).pilotos||[]).some(p=>p.nombre===r.nombre&&!pilotIds.has(p.id)))throw Error('Hay pilotos diferentes con el mismo nombre. Revisa sus nombres antes de unificar.');
  for(const f of data.itinerarios||[])if(f.piloto===r.nombre)f.piloto=profile.name;
  for(const f of data.school?.registry?.entries||[])for(const k of ['pilot','copilot'])if(f[k]===r.nombre)f[k]=profile.name;
 }
 for(const u of ranked){accounts[u].syncedOperation=null;if(u!==uid){accounts[u].mergedInto=uid;accounts[u].mergedAt=now;accounts[u].mergedBy=actorUid;accounts[u].role='Estudiante';accounts[u].assignedAt=null;}}
 Object.assign(accounts[uid],{role,profile,syncedOperation:null,mergedAt:now});
 data.school ||= {};data.school.userProfiles ||= {};for(const u of ranked)if(u!==uid)delete data.school.userProfiles[u];delete data.school.userProfiles[uid]?.dossier;
 out.dashboard.payload=JSON.stringify(data);
 out.identityMergeArchive ||= {};out.identityMergeArchive[now.replace(/[^0-9]/g,'')+'-'+uid]={actorUid,uid,role,accounts:Object.fromEntries(ranked.map(u=>[u,clone(root.accountRequests[u])])),records:originals,at:now};
 return {root:out,uid,role,mergedUids:ranked.filter(u=>u!==uid),email:accounts[uid].email};
}
function assertUnique(before,after){
 const b=rows(before),a=rows(after),old=new Map(b.map(x=>[x.kind+':'+x.record.id,x.record]));
 for(const x of a){const r=x.record,prev=old.get(x.kind+':'+r.id);if(prev&&email(prev.email)===email(r.email)&&identity(prev.identity)===identity(r.identity))continue;
  if(a.some(y=>y!==x&&!(r.authUid&&r.authUid===y.record.authUid)&&((email(r.email)&&email(r.email)===email(y.record.email))||(identity(r.identity)&&identity(r.identity)===identity(y.record.identity)))))throw Error('El correo o la cédula ya pertenece a otro expediente. Unifica la coincidencia desde USUARIOS antes de guardar.');
 }
}
module.exports={ROLES,email,identity,highest,groups,merge,assertUnique};
