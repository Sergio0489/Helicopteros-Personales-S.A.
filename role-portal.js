'use strict';
(()=>{
 let shell,busy=false,selected='';
 const labels={name:'Nombre',nombre:'Nombre',identity:'Identificación',email:'Correo',phone:'Celular',aircraft:'Aeronave',date:'Fecha',fecha:'Fecha',book:'Bitácora',pilot:'Piloto',copilot:'Copiloto',personName:'Estudiante / Cliente',origin:'Origen',destinations:'Destinos',hours100:'Horas de vuelo',aircraftHours100:'Horas de aeronave',tacPrevious100:'TAC anterior',tacCurrent100:'TAC actual',rateCents:'Tarifa por hora',costCents:'Cargo',totalCents:'Total',cents:'Monto',amountCents:'Monto',operationType:'Tipo de servicio',observation:'Observación',paxOut:'Pasajeros de ida',paxBack:'Pasajeros de vuelta',voidedAt:'Anulado',createdAt:'Ingreso al sistema',birthDate:'Nacimiento',nationality:'Nacionalidad',address:'Dirección',previousSchool:'Colegio',residentialPhone:'Teléfono residencial',fatherName:'Padre',motherName:'Madre',emergencyName:'Contacto de emergencia',emergencyPhone:'Celular de emergencia',referredBy:'Recomendado por',enrolledDate:'Matrícula',stage:'Etapa',type:'Curso / tipo',state:'Estado',startDate:'Inicio',endDate:'Fin',licenseDate:'Fecha de licencia',licenseNumber:'Licencia',kind:'Tipo',note:'Observación',number:'Número',expiry:'Vencimiento',status:'Estatus',year:'Año',serial:'Número de serie',source:'Fondos',method:'Método',bank:'Banco',reference:'Referencia',receivedBy:'Recibido por',fee:'Servicio',service:'Servicio',course:'Curso'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function value(k,v){if(v===null||v===undefined||v==='')return '';if(/Cents$/.test(k)||k==='cents')return new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format(Number(v)/100);if(/100$/.test(k))return (Number(v)/100).toFixed(k.includes('tac')?2:1);if(typeof v==='boolean')return v?'Sí':'No';if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v).split('-').reverse().join('/');if(/^\d{4}-\d{2}-\d{2}T/.test(String(v)))return new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',dateStyle:'short',timeStyle:'short'}).format(new Date(v));return v;}
 function render(page){const body=shell.querySelector('[data-content]');body.replaceChildren();const title=document.createElement('h2');title.textContent=page?.title||'Bienvenido';body.appendChild(title);if(!page){body.appendChild(document.createTextNode('Tu Director debe asignarte un cargo y guardar sus permisos de consulta.'));return;}if(page.notice){body.appendChild(document.createTextNode(page.notice));return;}for(const section of page.sections){const box=document.createElement('section');box.className='rp-card';const h=document.createElement('h3');h.textContent=section.title;box.appendChild(h);if(!section.rows.length){box.appendChild(document.createTextNode('Sin registros disponibles.'));body.appendChild(box);continue;}const keys=[...new Set(section.rows.flatMap(Object.keys))],wrap=document.createElement('div');wrap.className='rp-table';wrap.innerHTML='<table><thead><tr>'+keys.map(k=>'<th>'+esc(labels[k]||k.replace(/_/g,' '))+'</th>').join('')+'</tr></thead><tbody>'+section.rows.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(value(k,r[k]))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';box.appendChild(wrap);body.appendChild(box);}}
 async function load(page=''){if(busy)return;busy=true;shell.querySelector('[data-refresh]').disabled=true;const msg=shell.querySelector('[data-status]');msg.textContent='Consultando permisos…';shell.querySelector('[data-content]').replaceChildren();try{let result=await AccountRegistration.api('access',page?{page}:{});if(!page){const saved=window.PageMemory?.read();if(saved?.mode==='role'&&result.pages.some(p=>p.id===saved.page)){page=saved.page;result=await AccountRegistration.api('access',{page});}}selected=page;if(page)window.PageMemory?.rememberRole(page);const nav=shell.querySelector('nav');nav.replaceChildren();for(const p of result.pages){const b=document.createElement('button');b.textContent=p.name;b.className=p.id===page?'selected':'';b.onclick=()=>load(p.id);nav.appendChild(b);}shell.querySelector('[data-person]').textContent=(result.name||'Usuario')+' · '+result.role;render(result.page);msg.textContent='Modo consulta · Las operaciones de modificación siguen bloqueadas.';}catch(e){selected='';shell.querySelector('nav').replaceChildren();msg.textContent=e.message==='Operación no válida.'?'Falta publicar la actualización de acceso en Firebase.':e.message;}finally{busy=false;shell.querySelector('[data-refresh]').disabled=false;}}
 async function open(){if(firebase.auth().currentUser?.uid===ADMIN_UID)return;document.getElementById('dashboard-app').hidden=true;document.getElementById('access-screen').hidden=true;const waiting=document.getElementById('account-waiting');if(waiting)waiting.hidden=true;if(!shell){shell=document.createElement('section');shell.id='role-legacy-portal';shell.innerHTML='<header><img src="receipt-logo.svg" alt="Helicópteros Personales"><span data-person></span><button data-refresh>Actualizar</button><button data-logout>Cerrar sesión</button></header><div class="rp-layout"><nav aria-label="Páginas autorizadas"></nav><main><p data-status role="status"></p><div data-content></div></main></div>';document.body.appendChild(shell);shell.querySelector('[data-refresh]').onclick=()=>load(selected);shell.querySelector('[data-logout]').onclick=async()=>{await firebase.auth().signOut();location.reload();};const style=document.createElement('style');style.textContent='#role-legacy-portal{font:13px "IBM Plex Sans",sans-serif;color:var(--text);min-height:100vh;padding:16px}#role-legacy-portal header{display:flex;align-items:center;flex-wrap:wrap;gap:14px;border-bottom:1px solid var(--border);padding-bottom:14px}#role-legacy-portal header img{width:180px}#role-legacy-portal button{font:inherit;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);cursor:pointer}.rp-layout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:24px;margin-top:20px}.rp-layout nav{display:flex;flex-direction:column;gap:8px}.rp-layout nav button{text-align:left}#role-legacy-portal .selected{background:#163a64;color:white}.rp-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;margin:16px 0}.rp-table{overflow:auto}.rp-table table{border-collapse:collapse;width:100%}.rp-table th,.rp-table td{text-align:left;padding:10px;border-bottom:1px solid var(--border);min-width:90px;overflow-wrap:anywhere}.rp-table th{color:#163a64}.rp-layout main{min-width:0}@media(max-width:700px){.rp-layout{grid-template-columns:1fr}.rp-layout nav{flex-direction:row;overflow:auto}.rp-layout nav button{flex-shrink:0}}';document.head.appendChild(style);}shell.hidden=false;await load(selected);}
 window.RoleLegacyPortal={open};
})();

'use strict';
(()=>{
 let shell,busy=false,selected='',dispose;
 async function request(extra){
  let timer;try{return await Promise.race([AccountRegistration.api('access',extra),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La consulta tardó demasiado. Intenta nuevamente.')),20000);})]);}finally{clearTimeout(timer);}
 }
 async function legacy(){dispose?.();dispose=null;if(shell)shell.hidden=true;await RoleLegacyPortal.open();}
 function actions(target){
  const retry=document.createElement('button');retry.textContent='Reintentar';retry.onclick=()=>load(selected);
  const fallback=document.createElement('button');fallback.textContent='Usar visor de consulta';fallback.onclick=legacy;
  const logout=document.createElement('button');logout.textContent='Cerrar sesión';logout.onclick=async()=>{await firebase.auth().signOut();location.reload();};
  const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;flex-wrap:wrap;padding:16px';row.append(retry,fallback,logout);target.appendChild(row);
 }
 async function load(page=''){
  if(busy)return;busy=true;selected=page;
  if(!shell){shell=document.createElement('section');shell.id='role-portal';document.body.appendChild(shell);}
  shell.hidden=false;dispose?.();dispose=null;shell.replaceChildren();
  const msg=document.createElement('p');msg.style.padding='24px';msg.setAttribute('role','status');msg.textContent='Cargando página y permisos…';shell.appendChild(msg);
  try{
   let result=await request(page?{page,layout:'main'}:{});
   if(!page&&result.pages.length){const saved=window.PageMemory?.read();page=(saved?.mode==='role'&&result.pages.some(p=>p.id===saved.page)?saved.page:result.pages[0].id);selected=page;result=await request({page,layout:'main'});}
   if(!page){msg.textContent='Tu Director debe asignarte un cargo y guardar sus permisos de consulta.';actions(shell);return;}
   if(!result.native){await legacy();return;}
   dispose=await RoleMainView.mount(shell,result,page,async event=>{
    if(event.action==='aircraft')window.PageMemory?.rememberRole(selected,event.page);
    if(event.action==='page')await load(event.page);
    if(event.action==='refresh')await load(selected);
    if(event.action==='logout'){await firebase.auth().signOut();location.reload();}
    if(event.action==='load-error'&&!shell.querySelector('[data-view-error]')){const note=document.createElement('div');note.dataset.viewError='true';note.setAttribute('role','alert');note.textContent=event.message;actions(note);shell.prepend(note);}
   });
   window.PageMemory?.rememberRole(page);
  }catch(e){msg.textContent='No se pudo abrir el diseño principal: '+e.message;shell.replaceChildren(msg);actions(shell);}
  finally{busy=false;}
 }
 async function open(){const previous=document.getElementById('role-legacy-portal');if(previous)previous.hidden=true;if(firebase.auth().currentUser?.uid===ADMIN_UID)return;document.getElementById('dashboard-app').hidden=true;document.getElementById('access-screen').hidden=true;const waiting=document.getElementById('account-waiting');if(waiting)waiting.hidden=true;await load(selected);}
 window.RolePortal={open};
})();

