'use strict';
(function(root){
 const boxes=typeof module!=='undefined'?require('./functions/boxes'):root.HPBoxes;
 const catalog={inicio:['Inicio','⌂','Tu espacio de trabajo'],horario:['Horario del día','◷','Consulta los vuelos y sus aeronaves'],pendientes:['Pendientes','⚑','Revisa los vencimientos y tareas'],aeronaves:['Aeronaves','✈','Consulta la flota y sus bitácoras'],pilotos:['Pilotos','♟','Expedientes, licencias y vigencias'],bitacora:['Registro de bitácora','▤','Registra y consulta los vuelos'],pagos:['Registro de pago','$','Abonos y recibos'],itinerario:['Itinerario','▦','Calendario y programación de vuelos'],estudiantes:['Estudiantes / Clientes','◎','Expedientes, cursos y estados de cuenta'],escuela:['Escuela','⌂','Información y certificados'],charter:['HP CHARTER','✈','Información de la empresa'],estadisticas:['Estadísticas','▥','Reportes y actividad'],saldos:['Alerta de saldos','!','Seguimiento de saldos'],usuarios:['Usuarios','♟','Usuarios, cargos y permisos'],historial:['Historial de cambios','↺','Consulta quién modificó la información']};
 const orders={Director:['pendientes','horario','estadisticas','usuarios','historial','aeronaves'],Gerente:['pendientes','horario','estadisticas','saldos','itinerario','aeronaves'],Administrativo:['bitacora','pagos','estudiantes','itinerario','horario','pendientes'],Piloto:['horario','itinerario','bitacora','pilotos','aeronaves','pendientes'],Estudiante:['estudiantes','horario','itinerario','pagos','escuela'],Mecánico:['pendientes','aeronaves','horario'],Contabilidad:['pagos','saldos','estudiantes','estadisticas','bitacora']};
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const list=v=>Array.isArray(v)?v:[];
 const date=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'')?v.slice(0,10).split('-').reverse().join('/'):String(v||'');
 function ordered(pages,role){const preferred=orders[role]||[];return [...pages].sort((a,b)=>{const rank=x=>preferred.includes(x.id)?preferred.indexOf(x.id):preferred.length+Object.keys(catalog).indexOf(x.id);return rank(a)-rank(b);});}
 function build(data,{pages=[],policy={},director=false}={}){
  const output=[],seen=new Set(),available=new Set(pages.map(p=>p.id)),has=(page,box)=>available.has(page)&&(director||boxes.permissions(policy,page,box).view);
  function add(kind,page,id,title,detail='',extra='',target={}){if(!available.has(page)||!title)return;const key=kind+':'+id;if(seen.has(key))return;seen.add(key);output.push({key,kind,page,title:String(title),detail:String(detail),terms:norm([title,detail,extra].join(' ')),target:{kind,id,...target}});}
  for(const p of pages)add('page',p.id,p.id,p.name||catalog[p.id]?.[0],catalog[p.id]?.[2]||'');
  if(available.has('aeronaves'))for(const [key,ac]of Object.entries(data.fleet||{})){
   const reg=key.replace(/_/g,'-');add('aircraft','aeronaves',key,reg,has('aeronaves','identity')?[ac.model,ac.serial].filter(Boolean).join(' · '):'', '',{reg});
   if(has('aeronaves','documents'))for(const [i,d]of list(ac.documentos).entries())add('document','aeronaves',key+':doc:'+i,d.nombre,reg+' · '+date(d.vence),'',{reg,section:'documents'});
   if(has('aeronaves','pending')||has('aeronaves','maintenance'))for(const [i,m]of list(ac.mantenimiento).entries())add('maintenance','aeronaves',key+':task:'+i,m.nombre,reg+(m.resuelto?' · Resuelto':' · Pendiente'),'',{reg,section:m.resuelto?'maintenance':'pending'});
  }
  if(['dossier','pilots','licenses','documents'].some(b=>has('pilotos',b)))for(const [i,p]of list(data.pilotos).entries())add('pilot','pilotos',p.id||'index:'+i,p.nombre,'Piloto',has('pilotos','dossier')?[p.email,p.identity].join(' '):'',{index:i});
  if(['directory','personal','account','courses','hours'].some(b=>has('estudiantes',b)))for(const p of list(data.school?.students).filter(p=>!p.directoryKind||p.directoryKind==='student'))add('student','estudiantes',p.id,p.name,'Estudiante',has('estudiantes','personal')?[p.email,p.identity].join(' '):'');
  if(has('estudiantes','clients')||(director&&available.has('estudiantes')))for(const p of list(data.school?.registry?.clients))add('client','estudiantes',p.id,p.name,'Cliente',has('estudiantes','clients')?[p.email,p.identity].join(' '):'');
  if(has('charter','personnel'))for(const p of list(data.school?.personnel).filter(p=>!p.directoryKind||p.directoryKind==='personnel'))add('personnel','charter',p.id,p.name,p.position||'Personal de la empresa');
  if(has('bitacora','history'))for(const e of list(data.school?.registry?.entries))add('log','bitacora',e.id,'Bitácora '+(e.book||'sin número'),[e.aircraft,date(e.date),e.personName,e.pilot,e.voidedAt?'Anulado':''].filter(Boolean).join(' · '),[e.origin,...list(e.destinations)].join(' '));
  if(has('pagos','receipts'))for(const r of list(data.school?.paymentReceipts)){
   let number=r.number||'';if(/^HP-/.test(number)){const year=(r.date||r.createdAt||'').slice(2,4);number=String(r.sequence||Number(number.slice(3))).padStart(6,'0')+'-'+year;}
   add('receipt','pagos',r.id,'Recibo '+number,[r.personName,date(r.date),r.voidedAt?'Anulado':''].filter(Boolean).join(' · '),r.number,{personKey:r.personKey});
  }
  const flightPage=['planner','calendar','flights'].some(b=>has('itinerario',b))?'itinerario':has('horario','schedule')?'horario':null;
  if(flightPage)for(const [i,f]of list(data.itinerarios).entries()){
   if(flightPage==='horario'&&!director&&!boxes.aircraftAllowed(policy,f.aeronave))continue;
   const crew=flightPage==='itinerario'||has('horario','crew');add('flight',flightPage,f.id||'index:'+i,f.aeronave||'Vuelo',[date(f.fecha),f.horaInicio||f.hora,f.horaFin,f.origen,f.destino].filter(Boolean).join(' · '),crew?[f.piloto,f.estudiante,f.cliente].join(' '):'',{date:f.fecha,index:i});
  }
  return output;
 }
 function search(rows,query,kind='all'){const words=String(query).trim().split(/\s+/).map(norm).filter(Boolean);if(norm(query).length<2)return [];return rows.filter(r=>(kind==='all'||r.kind===kind||(kind==='person'&&['student','client'].includes(r.kind)))&&words.every(w=>r.terms.includes(w))).sort((a,b)=>Number(norm(b.title).startsWith(norm(query)))-Number(norm(a.title).startsWith(norm(query)))||a.title.localeCompare(b.title,'es',{numeric:true}));}
 const api={catalog,ordered,norm,build,search};if(typeof module!=='undefined')module.exports=api;else root.HomeSearchModel=api;
})(typeof window==='undefined'?globalThis:window);
