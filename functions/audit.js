'use strict';
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const skip=new Set(['undoFleet','syncedOperation','syncVersion','updatedAt','updatedBy','authUid','paymentReceiverNames']);
const labels={personnel:'Personal de la empresa',charter:'HP CHARTER',information:'Información institucional',certificates:'Certificados',personRef:'Expediente vinculado',fleet:'Aeronaves',pilotos:'Pilotos',school:'Escuela',students:'Estudiantes',clients:'Clientes',registry:'Registro de bitácora',entries:'Registros',itinerarios:'Itinerario',courses:'Cursos',payments:'Abonos',flights:'Horas de vuelo',receipts:'Recibos',rates:'Tarifas',userProfiles:'Perfiles',rolePermissions:'Roles y permisos',name:'Nombre',nombre:'Nombre',phone:'Celular',celular:'Celular',email:'Correo',role:'Cargo',profile:'Perfil',verified:'Correo verificado',assignedAt:'Asignación de cargo',ciclos_totales:'Horas motor izquierdo / motor',ciclos_limite:'Horas motor derecho / hélice',limite_motor:'Límite motor izquierdo / motor',limite_helice:'Límite motor derecho / hélice',helice1_ciclos:'Horas hélice izquierda',helice2_ciclos:'Horas hélice derecha',horas_acum_50:'Acumulado inspección 50 h',horas_acum_100:'Acumulado inspección 100 h',status:'Estatus',amount:'Monto',date:'Fecha',notes:'Observaciones',reason:'Motivo',auditReason:'Motivo'};
function reason(v){return typeof v==='string'?v.trim().slice(0,1000):'';}
function safeValue(v,key){
 if(v===undefined)return null;
 const s=typeof v==='string'?v:JSON.stringify(v);
 if(/password|token|secret|credential/i.test(key))return '[Dato protegido]';
 if(/photo|attachment|image|foto|comprobante/i.test(key)||/^data:/.test(s))return {resumen:'Archivo o imagen',huella:hash(s),longitud:s.length};
 if(s.length>2000)return {resumen:s.slice(0,2000),recortado:true,huella:hash(s),longitud:s.length};
 return v;
}
function diff(before,after){
 const rows=[];
 function walk(a,b,path){
  if(JSON.stringify(a)===JSON.stringify(b))return;
  const key=path.at(-1)||'';
  if(skip.has(key)||/password|token|secret|credential/i.test(key))return;
  const obj=x=>x&&typeof x==='object';
  if(!/photo|attachment|image|foto|comprobante/i.test(key)&&(obj(a)||obj(b))){
   if(Array.isArray(a)||Array.isArray(b)){
    const aa=Array.isArray(a)?a:[],bb=Array.isArray(b)?b:[];
    const stable=aa.concat(bb).every(x=>x&&typeof x==='object'&&x.id!=null)&&new Set(aa.map(x=>String(x.id))).size===aa.length&&new Set(bb.map(x=>String(x.id))).size===bb.length;
    if(stable){const am=new Map(aa.map(x=>[String(x.id),x])),bm=new Map(bb.map(x=>[String(x.id),x]));for(const id of new Set([...am.keys(),...bm.keys()])){const row=bm.get(id)||am.get(id);walk(am.get(id),bm.get(id),[...path,(row.name||row.nombre||row.number||id)+' ['+id+']']);}return;}
    if(aa.concat(bb).some(x=>x&&typeof x==='object')){for(let i=0;i<Math.max(aa.length,bb.length);i++)walk(aa[i],bb[i],[...path,String(i+1)]);return;}
   }else {for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})]))walk(a?.[k],b?.[k],[...path,k]);return;}
  }
  rows.push({path:path.join(' / '),field:path.map(k=>labels[k]||k.replaceAll('_',' ')).join(' › '),action:a===undefined?'Creado':b===undefined?'Eliminado':'Modificado',before:safeValue(a,key),after:safeValue(b,key)});
 }
 walk(before,after,[]);return rows;
}
function accountData(v){if(!v)return {};const out={};for(const k of ['profile','email','verified','role','assignedAt','prospectAccess'])if(v[k]!=null)out[k]=v[k];return out;}
function dashboardData(v){if(!v?.payload)return {};return JSON.parse(v.payload);}
function attach(before,after,actor,source,motive='',target=''){
 const changes=diff(source==='dashboard'?dashboardData(before):accountData(before),source==='dashboard'?dashboardData(after):accountData(after));
 if(!changes.length)return after;
 const time=new Date().toISOString(),id=String(Date.parse(time)).padStart(13,'0')+'_'+hash(require('node:crypto').randomUUID()).slice(0,24);
 const summary={id,time,source:source==='dashboard'?'Datos de la aplicación':'Usuarios y cargos',uid:actor?.uid||null,name:actor?.name||'Sistema · sincronización',role:actor?.role||'',actorSource:actor?.uid?'Sesión verificada':'Sistema',target,records:[...new Set(changes.map(x=>x.field.split(' › ').slice(0,3).join(' › ')))].join('; ').slice(0,3000),reason:reason(motive),count:changes.length,areas:[...new Set(changes.map(x=>x.field.split(' › ')[0]))].join(', '),actions:[...new Set(changes.map(x=>x.action))].join(', '),operation:after?.operation||null};
 const chunks={};for(let i=0;i<changes.length;i+=20)chunks[String(i/20).padStart(6,'0')]=changes.slice(i,i+20);
 return {...after,auditPending:{...before?.auditPending,[id]:{meta:summary,chunks}}};
}
async function deliver(db,event,prefix){
 const summary=event.data.val(),{id}=event.params;
 if(!summary?.id||summary.id!==id)throw Error('Evento de historial no válido.');
 const chunks=(await db.ref(prefix+'/'+id+'/chunks').get()).val();
 if(!chunks){if((await db.ref('auditIndex/'+id).get()).exists())return;throw Error('El detalle está pendiente de entrega.');}
 // Only the small metadata node triggers this job. Large dossiers never become event payloads.
 const patch={['auditIndex/'+id]:summary,[prefix+'/'+id]:null};
 for(const [key,rows]of Object.entries(chunks))patch['auditDetails/'+id+'/'+key]=rows;
 await db.ref().update(patch);
}
function boundary(date,end){if(!date)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Fecha no válida.');const n=Date.parse(date+(end?'T23:59:59.999-05:00':'T00:00:00-05:00'));if(!Number.isFinite(n)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Fecha no válida.');return String(n).padStart(13,'0')+(end?'_\uf8ff':'_');}
async function list(db,input){
 let q=db.ref('auditIndex').orderByKey();const from=boundary(input.from,false),to=boundary(input.to,true);if(from&&to&&from>to)throw Error('Revisa el rango de fechas.');if(from)q=q.startAt(from);
 if(input.cursor){if(!/^\d{13}_[a-f0-9]{24}$/.test(input.cursor))throw Error('Página no válida.');q=q.endBefore(input.cursor);}else if(to)q=q.endAt(to);
 const data=(await q.limitToLast(51).get()).val()||{},rows=Object.values(data).sort((a,b)=>b.id.localeCompare(a.id)),hasMore=rows.length>50;return {entries:rows.slice(0,50),nextCursor:hasMore?rows[49].id:null};
}
async function detail(db,input){if(!/^\d{13}_[a-f0-9]{24}$/.test(input.id||''))throw Error('Registro no válido.');const chunk=Number(input.chunk||0);if(!Number.isInteger(chunk)||chunk<0)throw Error('Detalle no válido.');const data=(await db.ref('auditDetails/'+input.id+'/'+String(chunk).padStart(6,'0')).get()).val();return {changes:data||[],chunk};}
module.exports={diff,reason,attach,deliver,list,detail};

