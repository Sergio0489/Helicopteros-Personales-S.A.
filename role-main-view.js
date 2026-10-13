'use strict';
// The same templates as the director, running without credentials or network access.
(()=>{
 let bundle;
 const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c');
 async function assets(){if(!bundle)bundle=Promise.all(['index.html','dashboard.js','students.js','registro.js','https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'].map(async p=>{const r=await fetch(p+'?native=20261013-1');if(!r.ok)throw Error('No se pudo cargar el diseño principal.');return r.text();})).catch(e=>{bundle=null;throw e;});return bundle;}
 function start(){
  const cfg=window.ROLE_VIEW,has=a=>cfg.areas[a]===true;
  const blocked=()=>{throw Error('Esta sesión es de consulta.');};
  window.cloudWrite=async()=>blocked();window.showCloudError=()=>{};
  window.fetch=blocked;window.XMLHttpRequest=undefined;window.WebSocket=undefined;
  window.open=()=>null;window.print=()=>{};
  window.CLOUD_INITIAL=cfg.data;
  document.getElementById('access-screen').remove();document.getElementById('dashboard-app').hidden=false;
  document.querySelector('.cloud-toolbar').innerHTML='<span id="readonly-name"></span><span>Solo consulta</span><button id="readonly-refresh">Actualizar</button><button id="readonly-logout">Cerrar sesión</button>';
  document.getElementById('readonly-name').textContent=cfg.name+' · '+cfg.role;
  const send=(action,page)=>parent.postMessage({channel:cfg.channel,action,page},'*');
  document.getElementById('readonly-refresh').onclick=()=>send('refresh');document.getElementById('readonly-logout').onclick=()=>send('logout');
  const safeAction=new Set(['select','statement','view']);
  function readonlyControl(e){
   if(e.closest('#sidebar,#readonly-refresh,#readonly-logout,#hamburgerBtn,#drawerCloseBtn,#drawerOverlay'))return true;
   if(e.closest('[data-aac-filters],[data-hp-filters]'))return true;
   if(e.matches('[data-payment-person],[data-person-id],[role=option],[data-balance-person]'))return true;
   if(e.matches('#school-stage'))return true;
   if(e.matches('[data-action="view"]'))return ['students','clients'].includes(e.dataset.view);
   if(e.dataset.action)return safeAction.has(e.dataset.action);
   if(e.matches('summary')||e.closest('summary'))return true;
   const code=e.getAttribute('onclick')||e.getAttribute('onchange')||'';
   if(/^(selectScheduleOffset|changeMonth|selectDay|plannerChangeDay|plannerSelectDate|renderAircraftPlanner|closeDrawer|openDrawer|close)/.test(code))return true;
   return /filter|search|query|stats-year|planner-aircraft/.test(e.id+' '+e.name+' '+e.className)||e.matches('[data-school-search],[data-school-stage]');
  }
  document.addEventListener('click',e=>{const control=e.target.closest('button,a,input,select,textarea,[onclick],[data-action]');if(control&&!readonlyControl(control)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('submit',e=>{if(!e.target.matches('[data-aac-filters],[data-hp-filters]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.finishRoleView=()=>{
   const tabs={horario:dailyScheduleTab,pendientes:resumenTab,pilotos:pilotosTab,itinerario:itinerariosTab,escuela:escuelaTab,charter:empresaTab,estadisticas:statsTab};
   const panels={horario:'panel-horario-dia',pendientes:'panel-resumen',pilotos:'panel-pilotos',itinerario:'panel-itinerarios',escuela:'panel-escuela',charter:'panel-empresa',estadisticas:'panel-estadisticas',estudiantes:'panel-estudiantes',bitacora:'panel-registro',pagos:'panel-registro-pago',saldos:'panel-alerta-saldos'};
   if(tabs[cfg.page])tabs[cfg.page].click();
   document.querySelectorAll('.aircraft-panel').forEach(p=>p.classList.toggle('active',p.id===(panels[cfg.page]||'panel-0')));
   const sidebar=document.getElementById('sidebar-tabs'),aircraftGroup=document.getElementById('sidebar-aircraft-group');
   sidebar.replaceChildren();
   for(const p of cfg.pages){
    if(p.id==='aeronaves'&&cfg.page==='aeronaves'){sidebar.appendChild(aircraftGroup);aircraftGroup.open=true;continue;}
    const b=document.createElement('div');b.className='aircraft-tab'+(p.id===cfg.page?' active':'');b.innerHTML='<div class="tab-reg"></div>';b.firstChild.textContent=({horario:'🕒 ',pendientes:'⚠️ ',aeronaves:'✈️ ',pilotos:'👨‍✈️ ',itinerario:'🗓️ ',estudiantes:'🎓 ',escuela:'🎓 ',charter:'🚁 ',estadisticas:'📊 ',saldos:'🚨 ',bitacora:'📋 ',pagos:'💳 '}[p.id]||'')+p.name.toLocaleUpperCase('es');b.tabIndex=0;b.setAttribute('role','button');b.onclick=()=>send('page',p.id);b.onkeydown=e=>{if(e.key==='Enter')b.click();};sidebar.appendChild(b);
   }
   document.querySelector('.summary-bar').hidden=cfg.page!=='aeronaves'||!has('Información y estatus');
   if(cfg.notice){const p=document.getElementById(panels[cfg.page]);p.replaceChildren();const c=document.createElement('div');c.className='card';c.textContent=cfg.notice;p.appendChild(c);}
   function restrict(){
    document.querySelectorAll('button,input,select,textarea').forEach(e=>{if(!readonlyControl(e)){e.disabled=true;e.title='Solo consulta';}});
    document.querySelectorAll('[data-action="view"]').forEach(e=>{if(!['students','clients'].includes(e.dataset.view))e.hidden=true;});
    if(cfg.page==='aeronaves'){
     const map=[[/Inspección|Horas de Vuelo|Vencimientos en Horas|Tacómetros|Inspecciones/,'Horas e inspecciones'],[/Estatus/,'Información y estatus'],[/Taller|Mantenimientos/,'Mantenimiento y taller'],[/Pedidos/,'Pedidos'],[/Documentos|Emergencia/,'Documentos y emergencia']];
     document.querySelectorAll('.card').forEach(c=>{const title=c.querySelector('.card-title')?.textContent||'';const rule=map.find(([re])=>re.test(title));if(rule&&!has(rule[1]))c.hidden=true;});
     document.querySelectorAll('.status-select-wrap').forEach(w=>{[...w.children].forEach((e,i)=>{e.hidden=i<2?!has('Información y estatus'):!has('Motores y hélices');});});
     document.querySelectorAll('.school-aircraft-rate,.school-tab-rate').forEach(e=>e.hidden=!has('Tarifas'));
    }
    if(cfg.page==='pagos'){document.querySelectorAll('.payment-history .card').forEach(e=>{const t=e.querySelector('h3')?.textContent;e.hidden=t==='Recibos de pago'?!has('Abonos y recibos'):t==='Movimientos de pago'?!has('Movimientos de pago'):false;});}
    if(cfg.page==='horario'){document.querySelectorAll('.daily-schedule-person').forEach(e=>e.hidden=!has('Tripulación y pasajeros'));document.querySelectorAll('.flight-time').forEach(e=>e.hidden=!has('Vuelos y rutas'));}
    if(cfg.page==='estadisticas'){
     document.querySelectorAll('#panel-estadisticas>.card').forEach(e=>{if(!e.id)e.hidden=!has('Estadísticas generales');});
     const a=document.getElementById('registro-transport-report'),h=document.getElementById('registro-personal-report');if(a)a.hidden=!has('Estadísticas para AAC');if(h)h.hidden=!has('Estadísticas Helicópteros Personales');
    }
    if(cfg.page==='estudiantes'){
     document.querySelectorAll('.school-profile-info').forEach(e=>e.hidden=!has('Datos personales'));
     document.querySelectorAll('.school-fee,.school-balances,.school-ledger').forEach(e=>e.hidden=!has('Estado de cuenta y abonos'));
     document.querySelectorAll('.school-profile>.card').forEach(e=>{if(e.querySelector('h3')?.textContent==='Otros gastos')e.hidden=!has('Estado de cuenta y abonos');});
     document.querySelectorAll('.school-totals').forEach(e=>{e.hidden=!has('Estado de cuenta y abonos')&&!has('Horas registradas');[...e.children].forEach(c=>c.hidden=c.classList.contains('school-equipment-hours')?!has('Horas registradas'):!has('Estado de cuenta y abonos'));});
     document.querySelectorAll('.school-course-grid,.school-deleted-courses').forEach(e=>e.hidden=!has('Cursos y licencias')&&!has('Estado de cuenta y abonos'));
     document.querySelectorAll('[data-action="statement"]').forEach(e=>e.hidden=!has('Estado de cuenta y abonos'));
    }
   }
   restrict();const observer=new MutationObserver(restrict);observer.observe(document.getElementById('content-area'),{childList:true,subtree:true});
   send('ready');
  };
 }
 async function mount(container,result,page,onAction){
  if(!result.native)throw Error('Para usar el diseño principal falta publicar la función actualizada en Firebase.');
  const [html,dashboard,students,registro,chart]=await assets();
  const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script').forEach(n=>n.remove());
  const base=document.createElement('base');base.href=new URL('.',location.href).href;doc.head.prepend(base);
  const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: "+location.origin+"; connect-src 'none'; form-action 'none';";doc.head.prepend(csp);
  const channel=crypto.randomUUID(),frame=document.createElement('iframe');frame.title='Panel principal · '+page;frame.setAttribute('sandbox','allow-scripts allow-modals');frame.style.cssText='display:block;width:100%;height:100dvh;border:0;background:var(--bg)';
  const style=document.createElement('style');style.textContent='[hidden]{display:none!important}button:disabled{cursor:default}input:disabled,select:disabled,textarea:disabled{opacity:1;color:inherit;-webkit-text-fill-color:currentColor}';doc.head.appendChild(style);
  const cfg={...result.native,page,pages:result.pages,name:result.name,role:result.role,channel};
  const add=code=>{const s=doc.createElement('script');s.textContent=code;doc.body.appendChild(s);};
  add('window.ROLE_VIEW='+safeJSON(cfg)+';('+start.toString()+')();');
  // Chart rendering is optional; operational templates do not depend on its network CDN.
  add(chart);
  add(dashboard);add(students);add(registro);add('window.finishRoleView();');
  const listener=e=>{if(e.source===frame.contentWindow&&e.data?.channel===channel)onAction(e.data);};window.addEventListener('message',listener);
  container.replaceChildren(frame);frame.srcdoc='<!DOCTYPE html>'+doc.documentElement.outerHTML;
  return ()=>window.removeEventListener('message',listener);
 }
 window.RoleMainView={mount};
})();
