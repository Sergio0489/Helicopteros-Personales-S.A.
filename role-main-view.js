'use strict';
// The same templates as the director, running without credentials or network access.
(()=>{
 let bundle,chartBundle;
 const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c');
 async function asset(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(path+'?native=20261030-calendar-12h-1',{signal:controller.signal});if(!r.ok)throw Error('No se pudo cargar '+path+'.');return await r.text();}
  catch(e){if(e.name==='AbortError')throw Error('La carga del diseño tardó demasiado. Intenta actualizar.');throw e;}
  finally{clearTimeout(timer);}
 }
 async function assets(page){
  if(!bundle)bundle=Promise.all(['index.html','dashboard.js','students.js','registro.js','students.css','functions/boxes.js','box-ui.js','functions/monthly-winners.js','monthly-winners-ui.js','pilots-ui.js','functions/school-certificates.js','school-info.js','functions/school-information.js','draft-recovery.js','home-search-model.js','home-ui.js','functions/company.js','company-ui.js','functions/itinerary-engine.js','itinerary-ui.js','itinerary.css'].map(asset)).catch(e=>{bundle=null;throw e;});
  if(page==='estadisticas'&&!chartBundle)chartBundle=asset('vendor/chart-4.4.0.umd.js').catch(e=>{chartBundle=null;throw e;});
  return [...await bundle,page==='estadisticas'?await chartBundle:''];
 }
 function start(){
  const cfg=window.ROLE_VIEW,has=a=>cfg.areas[a]===true;
  cfg.policy ||= HPBoxes.normalize({[cfg.page]:{actions:{view:true},areas:cfg.areas}});
  const send=(action,page)=>parent.postMessage({channel:cfg.channel,action,page},'*');
  window.addEventListener('error',event=>send('load-error',event.message||'Error al cargar la página.'));
  window.addEventListener('unhandledrejection',event=>send('load-error',event.reason?.message||'Error al cargar la página.'));
  const blocked=()=>{throw Error('Esta sesión es de consulta.');};
  let baseline,writeBusy=false,writeUncertain=false;const pending=new Map();
  const clean=value=>{const v=structuredClone(value);delete v.undoFleet;for(const ac of fleet)v.fleet[aircraftKey(ac.reg)]={...defaultAc(ac),...decodeAircraft(v.fleet[aircraftKey(ac.reg)])};for(const d of Object.values(v.fleet||{})){
    delete d.active_tac_id;d.estatus_label='';d.fecha_motor ||= '';d.fecha_helices ||= '';
    d.horas_totales=d.horas_acum_50||'';d.horas_limite=d.horas_acum_100||'';
    for(const [key,,min]of EMERGENCY_TYPES){const dates=equipmentDates(d,key,min);d['emerg_'+key+'_fechas']=dates;d['emerg_'+key]=dates[0]||'';}
   }v.itinerarios ||= [];v.pilotos ||= [];for(const p of v.pilotos)p.verificaciones ||= [];if(v.school){v.school.paymentReceipts ||= [];v.school.students ||= [];v.school.intakes ||= [];v.school.registry={entries:[],clients:[],destinations:[],...v.school.registry};delete v.school.version;v.school.brochureUrl ||= '';v.school.rates={Simulador:{cents:9000},...v.school.rates};}return v;};
  window.cloudWrite=async value=>{
   if(!cfg.policy||!cfg.editable)throw Error('No tienes permiso de edición en esta página.');
   if(writeBusy||writeUncertain)throw Error('Actualiza la página antes de continuar.');writeBusy=true;
   const after=clean(value),requestId=crypto.randomUUID();
   try{const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);writeUncertain=true;reject(Error('No se pudo confirmar el guardado. Actualiza antes de continuar.'));},25000);pending.set(requestId,{resolve,reject,timer});parent.postMessage({channel:cfg.channel,action:'box-save',requestId,page:cfg.page,operation:cfg.operation,before:baseline,after},'*');});cfg.operation=result.operation;baseline=structuredClone(after);return true;}finally{writeBusy=false;}
  };
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='box-save-result')return;const request=pending.get(e.data.requestId);if(!request)return;clearTimeout(request.timer);pending.delete(e.data.requestId);if(e.data.error)request.reject(Error(e.data.error));else request.resolve(e.data.result);});
  const itineraryPending=new Map();
  window.itineraryRequest=(action,payload={})=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{itineraryPending.delete(id);reject(Error('No se pudo confirmar. Actualiza el itinerario antes de repetir el guardado.'));},35000);itineraryPending.set(id,{resolve,reject,timer});parent.postMessage({channel:cfg.channel,action:'itinerary-api',id,method:action,payload},'*');});
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='itinerary-result')return;const p=itineraryPending.get(e.data.id);if(!p)return;clearTimeout(p.timer);itineraryPending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);});
  const aircraftReports=new Map();
  // Correlate each attempt separately; mount keeps the report's backend idempotency key stable.
  window.reportAircraft=(aircraft,description,{signal,reportId,isNew=false,onPrepared}={})=>new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),cleanup=()=>{clearTimeout(timer);aircraftReports.delete(id);signal?.removeEventListener('abort',cancel);};
   const cancel=()=>{cleanup();reject(new DOMException('El formulario del reporte se cerró.','AbortError'));};
   const timer=setTimeout(()=>{cleanup();reject(Error('No se pudo confirmar el reporte. Puedes reintentar el mismo formulario; se conservará el identificador del envío.'));},25000);
   aircraftReports.set(id,{resolve,reject,cleanup,onPrepared});signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return;}
   parent.postMessage({channel:cfg.channel,action:'aircraft-report',id,aircraft,description,reportId,isNew},'*');
  });
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='aircraft-report-prepared')return;aircraftReports.get(e.data.id)?.onPrepared?.(e.data.report);});
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='aircraft-report-result')return;const item=aircraftReports.get(e.data.id);if(!item)return;item.cleanup();if(!e.data.error)parent.postMessage({channel:cfg.channel,action:'aircraft-report-ack',id:e.data.id},'*');e.data.error?item.reject(Error(e.data.error)):item.resolve(e.data.result);});
  const reportLists=new Map();
  window.listAircraftReports=(aircraft,{signal}={})=>new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),cleanup=()=>{clearTimeout(timer);reportLists.delete(id);signal?.removeEventListener('abort',cancel);};
   const cancel=()=>{cleanup();reject(new DOMException('El formulario del reporte se cerró.','AbortError'));};
   const timer=setTimeout(()=>{cleanup();reject(Error('No se pudieron consultar los reportes pendientes. Reabre el formulario.'));},4000);
   reportLists.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return;}
   parent.postMessage({channel:cfg.channel,action:'aircraft-report-list',id,aircraft},'*');
  });
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel)return;if(e.data.action==='aircraft-report-session-ended'){document.querySelectorAll('[data-aircraft-report-dialog]').forEach(dialog=>dialog.close());return;}if(e.data.action!=='aircraft-report-list-result')return;const item=reportLists.get(e.data.id);if(!item)return;item.cleanup();e.data.error?item.reject(Error(e.data.error)):item.resolve(e.data);});
  window.showCloudError=e=>alert(e.message||'No se pudo guardar.');
  window.getPaymentReceivers=()=>[{uid:cfg.uid,label:cfg.name||'Usuario'}];

  window.fetch=blocked;window.XMLHttpRequest=undefined;window.WebSocket=undefined;
  let outputContext=null,statementScope=null;
  const nativePrint=window.print.bind(window);
  const mayOutput=pair=>pair&&HPBoxes.outputAllowed(cfg.policy,...pair);
  window.print=()=>{if(mayOutput(outputContext)&&outputContext[2]==='print'){outputContext=null;nativePrint();}};
  window.printPilotSheet=window.print;window.open=()=>null;
  function outputFor(e){
   if(e.matches('[data-pilot-action="print"],[data-pilot-action="blank-print"]'))return ['pilotos','dossier','print'];
   if(e.matches('[data-action="print-student"],[data-action="blank-registration"]'))return ['estudiantes','personal','print'];
   if(e.matches('[data-print],[data-own-statement-print]'))return cfg.page==='saldos'?(statementScope||['saldos','students','print']):['estudiantes','account','print'];
   if(e.matches('[data-receipt-print]'))return ['pagos','receipts','print'];
   if(e.matches('[data-aac-download]'))return ['estadisticas','aac','export'];
   if(e.matches('[data-hp-download]'))return ['estadisticas','company','export'];
   return null;
  }
  window.CLOUD_INITIAL=cfg.data;
  document.getElementById('access-screen').remove();document.getElementById('dashboard-app').hidden=false;
  document.querySelector('.cloud-toolbar').innerHTML='<span id="readonly-name"></span><span>'+ (cfg.home?'Inicio personalizado':cfg.editable?'Edición según permisos':'Solo consulta')+'</span><button id="readonly-profile">Mi perfil</button><button id="readonly-reason">Motivo del cambio</button><button id="readonly-refresh">Actualizar</button><button id="readonly-logout">Cerrar sesión</button>';
  document.getElementById('readonly-name').textContent=cfg.name+' · '+cfg.role;
  document.getElementById('profile-menu')?.remove();document.getElementById('readonly-profile').onclick=()=>send('profile');document.getElementById('readonly-reason').onclick=()=>send('audit-reason');
  window.addEventListener('message',e=>{if(e.source===parent&&e.data?.channel===cfg.channel&&e.data.action==='profile-updated'){cfg.name=e.data.name;document.getElementById('readonly-name').textContent=cfg.name+' · '+cfg.role;document.getElementById('readonly-refresh').textContent='Actualizar datos';}});
  document.getElementById('readonly-refresh').onclick=()=>send('refresh');document.getElementById('readonly-logout').onclick=()=>{if(!window.hasDraftChanges?.()||confirm('Hay cambios pendientes. Cerrar sesión eliminará los borradores de este usuario en este dispositivo. ¿Continuar?'))send('logout');};
  const safeAction=new Set(['select','statement','view']);
  function readonlyControl(e){
   if(e.matches('[data-pilot-aircraft-report]')||e.closest('[data-itinerary-control]'))return true;
   const output=outputFor(e);if(output)return !!mayOutput(output);
   if(e.matches('a[download][href^="blob:"]'))return !!mayOutput(outputContext)&&outputContext[2]==='export';
   if(e.matches('[data-receipt]'))return HPBoxes.permissions(cfg.policy,'pagos','receipts').view;
   if(e.matches('[data-receipt-close]'))return true;
   if(e.closest('[data-draft-notice],[data-home-control]'))return true;
   if(e.closest('#sidebar,#readonly-profile,#readonly-refresh,#readonly-logout,#hamburgerBtn,#drawerCloseBtn,#drawerOverlay'))return true;
   if(e.closest('[data-aac-filters],[data-hp-filters]'))return true;
   if(e.matches('[data-personnel-select],[data-personnel-search],[data-pilot-select],[data-pilot-search],[data-pilot-action="print"],[data-pilot-action="blank-print"]'))return true;
   if(e.matches('[data-payment-person],[data-person-id],[role=option],[data-balance-person]'))return true;
   if(e.matches('#school-stage'))return true;
   if(e.matches('[data-action="view"]'))return true;
   if(e.dataset.action)return safeAction.has(e.dataset.action);
   if(e.closest('.app-calendar')&&dialogPermission==='filter')return true;
   if(e.matches('[data-cancel],[data-close]'))return true;
   if(e.matches('summary')||e.closest('summary'))return true;
   const code=e.getAttribute('onclick')||e.getAttribute('onchange')||'';
   if(/^(selectScheduleOffset|changeMonth|selectDay|plannerChangeDay|plannerSelectDate|plannerShowFlight|renderAircraftPlanner|closeDrawer|openDrawer|close)/.test(code))return true;
   return /filter|search|query|stats-year|planner-aircraft/.test(e.id+' '+e.name+' '+e.className)||e.matches('[data-school-search],[data-school-stage]');
  }
  let dialogPermission=null;
  function canEditControl(e){
   if(e.matches('[data-pilot-aircraft-report]')||e.closest('[data-itinerary-control]'))return true;
   if(outputFor(e))return false;
   if(!cfg.policy||!cfg.editable)return false;
   const pair=window.HPBoxUI?.owner(e)||((e.closest('dialog,.app-calendar'))?dialogPermission:null);
   if(pair==='filter')return false;
   if(pair)return HPBoxes.permissions(cfg.policy,...pair).edit;
   const code=e.getAttribute('onclick')||'';
   if(/^savePanel\(/.test(code))return Object.values(cfg.boxes||{}).some(b=>b.edit);
   if(e.closest('.aircraft-status-control'))return HPBoxes.permissions(cfg.policy,'aeronaves','status').edit;
   return false;
  }
  document.addEventListener('click',e=>{const control=e.target.closest('button,a,input,select,textarea,[onclick],[data-action]');if(control?.matches('[data-balance-person]'))statementScope=['saldos',control.dataset.balancePerson.startsWith('client:')?'clients':'students','print'];if(control&&outputFor(control)){outputContext=outputFor(control);if(!mayOutput(outputContext)){outputContext=null;e.preventDefault();e.stopImmediatePropagation();}return;}if(control&&canEditControl(control)){dialogPermission=window.HPBoxUI?.owner(control)||dialogPermission;return;}if(control&&readonlyControl(control)&&control.matches('input'))dialogPermission='filter';if(control&&!readonlyControl(control)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('submit',e=>{if(!canEditControl(e.target)&&!e.target.matches('[data-aac-filters],[data-hp-filters]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  async function openAircraftReport(aircraft){
   const dialog=document.createElement('dialog'),controller=new AbortController();
   dialog.className='user-profile-dialog';dialog.dataset.itineraryControl='true';dialog.dataset.aircraftReportDialog='true';
   dialog.style.cssText='width:min(520px,92vw);border:1px solid #aac3da;border-radius:12px;padding:20px;font:inherit';
   dialog.innerHTML='<form method="dialog"><h2></h2><p>Los envíos sin confirmación están disponibles para recuperación en este dispositivo durante 24 horas, hasta 20 por piloto. No equivalen a un guardado confirmado.</p><div data-report-choices></div><label hidden data-report-fields>Describe el problema<textarea name="description" required minlength="5" maxlength="1000" rows="5" style="width:100%;box-sizing:border-box"></textarea></label><p data-report-notice></p><p data-status role="status">Consultando reportes pendientes…</p><button type="submit" data-send hidden>Enviar a taller</button><button type="button" data-report-modify hidden>Modificar y crear reporte nuevo</button><button type="button" data-report-choose hidden>Ver reportes pendientes</button><button type="button" data-cancel>Cancelar</button></form>';
   dialog.querySelector('h2').textContent='Reporte de aeronave · '+aircraft;
   const form=dialog.querySelector('form'),choices=dialog.querySelector('[data-report-choices]'),fields=dialog.querySelector('[data-report-fields]'),text=dialog.querySelector('textarea'),notice=dialog.querySelector('[data-report-notice]'),status=dialog.querySelector('[data-status]'),send=dialog.querySelector('[data-send]'),modify=dialog.querySelector('[data-report-modify]'),choose=dialog.querySelector('[data-report-choose]');
   let entries=[],draft=null,isNew=true,sourceDescription=null,busy=false,legacyPending=false,closeTimer,cleanupProblem=false;
   const setBusy=value=>{busy=value;text.disabled=value;send.disabled=value;modify.disabled=value;choose.disabled=value;choices.querySelectorAll('button').forEach(button=>button.disabled=value);};
   const edit=(entry=null)=>{draft={id:crypto.randomUUID(),aircraft,description:entry?.description||''};isNew=true;sourceDescription=entry?.description??null;choices.hidden=true;fields.hidden=false;text.readOnly=false;text.value=draft.description;send.hidden=false;send.textContent=entries.length||legacyPending?'Enviar reporte nuevo':'Enviar a taller';modify.hidden=true;choose.hidden=!entries.length&&!legacyPending;notice.textContent=entries.length||legacyPending?'Este es un reporte distinto y puede crear otra tarea y alerta; los envíos anteriores seguirán pendientes de confirmación.':'Revisa el texto antes de enviar. Si falta la confirmación, recupera este mismo envío para reintentarlo.';status.textContent='';};
   const recover=entry=>{draft=entry;isNew=false;sourceDescription=null;choices.hidden=true;fields.hidden=false;text.readOnly=true;text.value=entry.description;send.hidden=false;send.textContent='Reintentar reporte pendiente';modify.hidden=false;choose.hidden=false;notice.textContent='Se reenviará exactamente el reporte original para confirmar su resultado. Puede haberse guardado antes. Para cambiar información, crea otro reporte explícitamente.';status.textContent='';};
   const addChoice=entry=>{const button=document.createElement('button');button.type='button';button.dataset.reportRecover=entry.id;button.style.cssText='display:block;width:100%;text-align:left;margin:8px 0;white-space:normal';button.textContent='Recuperar reporte pendiente · '+new Date(entry.createdAt).toLocaleString('es-PA',{timeZone:'America/Panama',dateStyle:'short',timeStyle:'short'})+' · '+entry.description.slice(0,120);button.onclick=()=>{if(!busy)recover(entry);};choices.prepend(button);};
   const showChoices=()=>{choices.hidden=false;fields.hidden=true;send.hidden=true;modify.hidden=true;choose.hidden=true;status.textContent='';notice.textContent=legacyPending?'Hay envíos de una versión anterior sin texto recuperable. Revisa lo recibido antes de crear otro reporte.':'Recupera un envío pendiente para confirmar su resultado o elige crear un reporte distinto.';};
   modify.onclick=()=>{if(!busy)edit(draft);};choose.onclick=()=>{if(!busy)showChoices();};
   const cleanupNotice=e=>{if(e.source===parent&&e.data?.channel===cfg.channel&&e.data.action==='aircraft-report-cleanup-error'&&e.data.reportId===draft?.id){cleanupProblem=true;clearTimeout(closeTimer);status.textContent='Reporte recibido, pero no se pudo completar la limpieza local. La copia pendiente no equivale a otro reporte nuevo.';}};
   window.addEventListener('message',cleanupNotice);
   dialog.querySelector('[data-cancel]').onclick=()=>{controller.abort();dialog.close();};dialog.addEventListener('cancel',()=>controller.abort());dialog.addEventListener('close',()=>{controller.abort();clearTimeout(closeTimer);window.removeEventListener('message',cleanupNotice);dialog.remove();});
   form.onsubmit=async event=>{
    event.preventDefault();if(busy||!draft)return;
    const description=isNew?text.value.trim():draft.description;
    if(isNew&&sourceDescription!==null&&description===sourceDescription){status.textContent='Modifica la descripción para crear otro reporte, o recupera el original para reintentarlo.';return;}
    setBusy(true);status.textContent='Enviando reporte…';
    try{
     const report=await window.reportAircraft(aircraft,description,{signal:controller.signal,reportId:draft.id,isNew,onPrepared:entry=>{if(!dialog.open)return;draft=entry;isNew=false;text.value=entry.description;text.readOnly=true;send.textContent='Reintentar reporte pendiente';modify.hidden=false;choose.hidden=false;if(!entries.some(old=>old.id===entry.id)){entries.push(entry);addChoice(entry);}}});
     if(!dialog.open)return;if(!cleanupProblem){status.textContent=report?.deduplicated===true?'Este reporte ya se había recibido.':report?.deduplicated===false?'Reporte guardado como tarea pendiente de taller.':'Reporte recibido.';closeTimer=setTimeout(()=>dialog.close(),800);}
    }catch(error){if(!dialog.open)return;status.textContent=error.message;setBusy(false);}
   };
   document.body.appendChild(dialog);dialog.showModal();
   try{
    const result=await window.listAircraftReports(aircraft,{signal:controller.signal});if(!dialog.open)return;entries=result.reports;legacyPending=result.legacyPending;
    for(const entry of entries)addChoice(entry);
    const fresh=document.createElement('button');fresh.type='button';fresh.dataset.reportNew='true';fresh.textContent='Crear reporte nuevo';fresh.onclick=()=>{if(!busy)edit();};choices.appendChild(fresh);
    if(entries.length||legacyPending)showChoices();else edit();
   }catch(error){if(dialog.open)status.textContent=error.message;}
  }
  window.finishRoleView=()=>{
   cfg.pages=window.HomeSearchModel.sidebarOrdered(cfg.pages);
   document.getElementById('drawerCloseBtn').onclick=()=>closeDrawer();
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
    HPBoxUI.annotate();
    if(cfg.page==='aeronaves'&&cfg.role==='Piloto'&&HPBoxes.permissions(cfg.policy,'aeronaves','status').view){
     document.querySelectorAll('.aircraft-panel[id^="panel-"]').forEach(panel=>{if(panel.querySelector('[data-pilot-aircraft-report]'))return;const idx=Number(panel.id.slice(7)),aircraft=fleet[idx]?.reg;if(!aircraft)return;const button=document.createElement('button');button.type='button';button.dataset.pilotAircraftReport='true';button.className='save-btn';button.style.cssText='margin:12px 0;padding:9px 14px;background:#fff7e8;color:#704700;border:1px solid #e3b558;box-shadow:none';button.textContent='＋ Reportar problema a taller';button.onclick=()=>openAircraftReport(aircraft);const header=panel.querySelector('.aircraft-header');header?.after(button);});
    }
    document.querySelectorAll('[data-permission-box]').forEach(e=>{
     const rights=HPBoxes.permissions(cfg.policy||{},e.dataset.permissionPage,e.dataset.permissionBox);
     e.hidden=!rights.view;
     if(!rights.view&&e.matches('[data-permission-box="personal"]'))e.hidden=true;
     e.querySelectorAll('button,input,select,textarea').forEach(c=>{if(!readonlyControl(c)&&!canEditControl(c)){c.disabled=true;c.title='Solo consulta';}});
    });
    document.querySelectorAll('[data-section=documents]').forEach(e=>{e.hidden=!['documents','emergency'].some(b=>HPBoxes.permissions(cfg.policy,'aeronaves',b).view);});
    document.querySelectorAll('.school-course-grid').forEach(e=>{e.hidden=!['courses','account','hours'].some(b=>HPBoxes.permissions(cfg.policy,'estudiantes',b).view);});
    document.querySelectorAll('[data-action]').forEach(e=>{const owner=HPBoxUI.owner(e);if(owner)e.hidden=!HPBoxes.permissions(cfg.policy,...owner).view;});
    document.querySelectorAll('button,input,select,textarea').forEach(e=>{if(!readonlyControl(e)&&!canEditControl(e)){e.disabled=true;e.title='Solo consulta';}});
    document.querySelectorAll('button').forEach(e=>{const output=outputFor(e);if(output&&!mayOutput(output)){e.disabled=true;e.title='El Director debe autorizar '+(output[2]==='print'?'Imprimir / PDF':'Exportar Excel')+' para este cuadro.';}});
    document.querySelectorAll('[data-action="view"]').forEach(e=>{const box={students:'directory',clients:'clients',rates:'rates','course-rates':'course-rates',intakes:'intakes'}[e.dataset.view];e.hidden=box?!HPBoxes.permissions(cfg.policy||{},'estudiantes',box).view:false;});
   }
   baseline=clean(previewData);previewData={...structuredClone(baseline),undoFleet:{}};
   for(const [i,ac]of fleet.entries())baseline.fleet[aircraftKey(ac.reg)]={...defaultAc(ac),...decodeAircraft(baseline.fleet[aircraftKey(ac.reg)])};
   if(baseline.school){baseline.school.rates={Simulador:{cents:9000},...baseline.school.rates};}
   restrict();const observer=new MutationObserver(restrict);observer.observe(document.body,{childList:true,subtree:true});
   if(cfg.page==='aeronaves'){
    const wanted=[...document.querySelectorAll('#sidebar-tabs [data-idx]')].find(t=>fleet[Number(t.dataset.idx)]?.reg===cfg.savedAircraft);
    if(wanted)wanted.click();
    const rememberAircraft=()=>{const p=document.querySelector('.aircraft-panel.active');if(p&&/^panel-\d+$/.test(p.id))send('aircraft',fleet[Number(p.id.slice(6))]?.reg);};
    new MutationObserver(rememberAircraft).observe(document.getElementById('content-area'),{attributes:true,attributeFilter:['class'],subtree:true});
   }
   const draftWrites=new Map();
   window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='draft-stored')return;const item=draftWrites.get(e.data.id);if(!item)return;clearTimeout(item.timer);draftWrites.delete(e.data.id);e.data.error?item.reject(Error(e.data.error)):item.resolve();});
   DraftRecovery.init({revision:()=>cfg.operation,read:key=>cfg.draftEntries[key],write:(key,value)=>new Promise((resolve,reject)=>{cfg.draftEntries[key]=value;const id=crypto.randomUUID(),timer=setTimeout(()=>{draftWrites.delete(id);reject(Error('Borrador sin confirmar.'));},3000);draftWrites.set(id,{resolve,reject,timer});parent.postMessage({channel:cfg.channel,action:'draft-store',id,key,value},'*');})});
   window.installAircraftDrafts?.();window.Registro?.installDraft?.();
   const writer=window.cloudWrite;window.cloudWrite=async value=>{await DraftRecovery.beforeSave();try{const result=await writer(value);DraftRecovery.saved();return result;}catch(e){DraftRecovery.error(e.message);throw e;}};
   const searches=new Map();
   window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==cfg.channel||e.data.action!=='home-search-result')return;const item=searches.get(e.data.id);if(!item)return;clearTimeout(item.timer);searches.delete(e.data.id);e.data.error?item.reject(Error(e.data.error)):item.resolve(e.data.rows);});
   HomeUI.install({pages:cfg.pages,policy:cfg.policy,role:cfg.role,name:cfg.name,go:row=>{if(row.page===cfg.page&&!cfg.home){HomeUI.focusTarget(row);return;}parent.postMessage({channel:cfg.channel,action:'home-go',row},'*');},getIndex:()=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{searches.delete(id);reject(Error('La consulta tardó demasiado. Reintenta.'));},22000);searches.set(id,{resolve,reject,timer});parent.postMessage({channel:cfg.channel,action:'home-search',id},'*');})});
   if(cfg.home)HomeUI.showHome();
   send('ready');
  };
 }
 async function mount(container,result,page,onAction){
  if(!result.native)throw Error('Para usar el diseño principal falta publicar la función actualizada en Firebase.');
  const [html,dashboard,students,registro,schoolCSS,boxesScript,boxUIScript,winnersMath,winnersUI,pilotsUI,schoolCertificates,schoolInformation,schoolContentModel,draftScript,homeModel,homeUI,companyModel,companyUI,itineraryEngine,itineraryUI,itineraryCSS,chart]=await assets(page);
  const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,link[rel=manifest]').forEach(n=>n.remove());doc.querySelectorAll('link[rel=stylesheet]').forEach(n=>{if(!n.getAttribute('href').startsWith('https://fonts.googleapis.com/'))n.remove();});
  const schoolStyle=document.createElement('style');schoolStyle.textContent=schoolCSS+'\n'+itineraryCSS;doc.head.appendChild(schoolStyle);
  const base=document.createElement('base');base.href=new URL('.',location.href).href;doc.head.prepend(base);
  const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: "+location.origin+"; connect-src 'none'; form-action 'none';";doc.head.prepend(csp);
  const channel=crypto.randomUUID(),frame=document.createElement('iframe');frame.title='Panel principal · '+(result.home?'inicio':page);frame.setAttribute('sandbox','allow-scripts allow-modals allow-forms allow-downloads');frame.style.cssText='display:block;width:100%;height:100dvh;border:0;background:var(--bg)';
  const style=document.createElement('style');style.textContent='[hidden]{display:none!important}button:disabled{cursor:default}input:disabled,select:disabled,textarea:disabled{opacity:1;color:inherit;-webkit-text-fill-color:currentColor}';doc.head.appendChild(style);
  const draftScope='role:'+result.role+':'+page+':';
  const draftEntries=Object.fromEntries(Object.entries(window.DraftRecovery?.list()||{}).filter(([k,v])=>k.startsWith(draftScope)&&result.native.editable&&v.revision===String(result.native.operation??'')&&v.policy===JSON.stringify(result.native.policy)).map(([k,v])=>[k.slice(draftScope.length),v]));
  const cfg={...result.native,home:!!result.home,searchTarget:result.searchTarget,draftEntries,savedAircraft:window.PageMemory?.read()?.aircraft,page,pages:result.pages,name:result.name,role:result.role,channel};
  const add=code=>{const s=doc.createElement('script');s.textContent=code;doc.body.appendChild(s);};
  add(boxesScript);add(draftScript);add(homeModel);add(homeUI);
  add('window.ROLE_VIEW='+safeJSON(cfg)+';('+start.toString()+')();');
  // Only statistics needs Chart; serve the pinned version from this repository.
  add(chart);
  add(companyModel);add(schoolContentModel);add(schoolCertificates);add(dashboard);add(students);add(registro);add(winnersMath);add(winnersUI);add(pilotsUI);add(companyUI);add(schoolInformation);add(boxUIScript);add(itineraryEngine);add(itineraryUI);add('window.finishRoleView();window.HPItineraryUI.install({api:window.itineraryRequest});if(window.ROLE_VIEW.searchTarget)window.HomeUI.focusTarget(window.ROLE_VIEW.searchTarget);');
  let settled=false,timer,resolveReady,rejectReady,searchCache=null,searchAt=0,reportStore,stopReportAuth=()=>{},reportQueue=Promise.resolve();const aircraftReportResponseKeys=new Map();
  const assertReportUser=()=>{if(!cfg.uid||window.firebase?.auth?.()?.currentUser?.uid!==cfg.uid)throw Error('La sesión cambió. Abre la aplicación con tu usuario antes de recuperar o enviar reportes.');};
  const reports=()=>{assertReportUser();if(!window.AircraftReportRecovery)throw Error('Actualiza la aplicación para recuperar reportes pendientes.');return reportStore||=window.AircraftReportRecovery.createStore({uid:cfg.uid});};
  // Reopening a dialog must observe the preceding local preparation.
  const reportLocal=run=>{const next=reportQueue.then(run);reportQueue=next.catch(()=>{});return next;};
  const validReportId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  // Older versions kept only a UUID; recover it only after an exact text match.
  const legacyReportKeys=()=>{
   assertReportUser();const prefix='hp-aircraft-report:'+cfg.uid+':',marker='hp:aircraft-report:legacy:'+encodeURIComponent(cfg.uid),keys=Object.keys(localStorage).filter(key=>key.startsWith(prefix)&&/^[0-9a-f]{64}$/.test(key.slice(prefix.length))&&validReportId(localStorage.getItem(key)));
   if(!keys.length){localStorage.removeItem(marker);return keys;}
   const raw=localStorage.getItem(marker),now=Date.now(),first=Number(raw);
   if(raw!==null&&(!Number.isFinite(first)||first>now||now-first>=window.AircraftReportRecovery.TTL)){for(const key of keys)localStorage.removeItem(key);localStorage.removeItem(marker);return [];}
   if(raw===null)localStorage.setItem(marker,String(now));return keys;
  };
  const legacyReportKey=async(aircraft,description)=>{const bytes=new TextEncoder().encode(cfg.uid+'\u0000'+aircraft+'\u0000'+description.trim()),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');return 'hp-aircraft-report:'+cfg.uid+':'+hash;};
  const prepareReport=async data=>{
   const store=reports();let id=data.reportId;
   if(data.isNew===true){const keys=legacyReportKeys();if(keys.length){const key=await legacyReportKey(String(data.aircraft).trim().toUpperCase(),String(data.description).trim());assertReportUser();if(keys.includes(key))id=localStorage.getItem(key);}}
   assertReportUser();return store.prepare({id,aircraft:data.aircraft,description:data.description,isNew:data.isNew===true});
  };
  async function searchIndex(){
   if(searchCache&&Date.now()-searchAt<60000)return searchCache;searchAt=Date.now();
   searchCache=(async()=>{
    const candidate=result.pages.find(p=>p.id!=='horario')||result.pages[0];if(!candidate)return [];
    const fresh=await AccountRegistration.api('access',{page:candidate.id,layout:'main'});
    if(!fresh.native)throw Error('Actualiza la aplicación para consultar la búsqueda.');
    const pages=fresh.pages.filter(p=>result.pages.some(old=>old.id===p.id));
    let rows=HomeSearchModel.build(fresh.native.data,{pages,policy:fresh.native.policy});
    const itinerary=['planner','calendar','flights'].some(id=>HPBoxes.permissions(fresh.native.policy,'itinerario',id).view);
    if(candidate.id!=='horario'&&pages.some(p=>p.id==='horario')&&!itinerary){
     const schedule=await AccountRegistration.api('access',{page:'horario',layout:'main'});
     const allowed=new Set(schedule.pages.map(p=>p.id));rows=rows.filter(r=>allowed.has(r.page));
     const extra=HomeSearchModel.build(schedule.native.data,{pages:schedule.pages.filter(p=>p.id==='horario'&&pages.some(old=>old.id===p.id)),policy:schedule.native.policy});
     rows=[...new Map([...rows,...extra].map(r=>[r.key,r])).values()];
    }
    return rows;
   })().catch(e=>{searchCache=null;throw e;});return searchCache;
  }
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const dispose=()=>{clearTimeout(timer);stopReportAuth();window.removeEventListener('message',listener);frame.remove();};
  const listener=e=>{
   if(e.source!==frame.contentWindow||e.data?.channel!==channel)return;
   if(e.data.action==='home-go'){if(settled&&(e.data.row?.page==='inicio'||result.pages.some(p=>p.id===e.data.row?.page)))onAction({action:'home-go',row:e.data.row});return;}
   if(e.data.action==='home-search'){if(settled)searchIndex().then(rows=>frame.contentWindow?.postMessage({channel,action:'home-search-result',id:e.data.id,rows},'*')).catch(error=>frame.contentWindow?.postMessage({channel,action:'home-search-result',id:e.data.id,error:error.message},'*'));return;}
   if(e.data.action==='draft-store'){
    if(!settled)return;let error=null;try{if(typeof e.data.key!=='string'||e.data.key.length>500)throw Error('Borrador inválido.');DraftRecovery.store(draftScope+e.data.key,e.data.value===null?null:{...e.data.value,policy:JSON.stringify(result.native.policy)});}catch{error='No se pudo conservar el borrador.';}
    frame.contentWindow?.postMessage({channel,action:'draft-stored',id:e.data.id,error},'*');return;
   }
   if(e.data.action==='audit-reason'){if(settled)window.ChangeHistory?.setReason();return;}
   if(e.data.action==='profile'){if(settled)window.AccountProfile?.open({onSaved:result=>frame.contentWindow?.postMessage({channel,action:'profile-updated',name:result.profile.name},'*')});return;}
   if(e.data.action==='itinerary-api'){
    if(!settled||!['itinerary-read','itinerary-calendar','itinerary-command','itinerary-notices'].includes(e.data.method))return;
    Promise.resolve().then(()=>{if(!window.AccountRegistration?.api)throw Error('La conexión del itinerario aún no está disponible.');return window.AccountRegistration.api(e.data.method,e.data.payload);}).then(result=>frame.contentWindow?.postMessage({channel,action:'itinerary-result',id:e.data.id,result},'*')).catch(error=>frame.contentWindow?.postMessage({channel,action:'itinerary-result',id:e.data.id,error:error.message},'*'));return;
   }
   if(e.data.action==='aircraft-report-list'){
    if(!settled||result.role!=='Piloto')return;
    reportLocal(()=>{const entries=reports().list(e.data.aircraft),legacyPending=legacyReportKeys().length>0;assertReportUser();frame.contentWindow?.postMessage({channel,action:'aircraft-report-list-result',id:e.data.id,reports:entries,legacyPending},'*');}).catch(error=>frame.contentWindow?.postMessage({channel,action:'aircraft-report-list-result',id:e.data.id,error:error.message},'*'));return;
   }
   if(e.data.action==='aircraft-report-ack'){
    const identity=aircraftReportResponseKeys.get(e.data.id);if(identity){aircraftReportResponseKeys.delete(e.data.id);reportLocal(async()=>{reports().complete(identity);const key=await legacyReportKey(identity.aircraft,identity.description);assertReportUser();if(localStorage.getItem(key)===identity.id)localStorage.removeItem(key);legacyReportKeys();}).catch(()=>frame.contentWindow?.postMessage({channel,action:'aircraft-report-cleanup-error',reportId:identity.id},'*'));}return;
   }
    if(e.data.action==='aircraft-report'){
    if(!settled||result.role!=='Piloto')return;
    reportLocal(()=>prepareReport(e.data)).then(identity=>{assertReportUser();aircraftReportResponseKeys.set(e.data.id,identity);frame.contentWindow?.postMessage({channel,action:'aircraft-report-prepared',id:e.data.id,report:identity},'*');if(!window.AccountRegistration?.api)throw Error('La conexión de reportes aún no está disponible.');return window.AccountRegistration.api('aircraft-report',{aircraft:identity.aircraft,description:identity.description,idempotencyKey:identity.id});}).then(result=>{assertReportUser();frame.contentWindow?.postMessage({channel,action:'aircraft-report-result',id:e.data.id,result},'*');}).catch(error=>{aircraftReportResponseKeys.delete(e.data.id);frame.contentWindow?.postMessage({channel,action:'aircraft-report-result',id:e.data.id,error:error.message},'*');});return;
   }
   if(e.data.action==='box-save'){
    if(!settled)return;searchCache=null;
    AccountRegistration.api('box-save',{page,operation:e.data.operation,before:e.data.before,after:e.data.after}).then(result=>frame.contentWindow?.postMessage({channel,action:'box-save-result',requestId:e.data.requestId,result},'*')).catch(error=>frame.contentWindow?.postMessage({channel,action:'box-save-result',requestId:e.data.requestId,error:error.message},'*'));return;
   }
   if(e.data.action==='load-error'){
    if(!settled){settled=true;rejectReady(Error(e.data.page||'No se pudo abrir la página.'));}
    else onAction({action:'load-error',message:'La página no pudo completar una operación. Actualiza o usa el visor de consulta.'});
    return;
   }
   if(e.data.action==='ready'){if(!settled){settled=true;resolveReady();}return;}
   if(settled)onAction(e.data);
  };
  const reportAuth=window.firebase?.auth?.();if(reportAuth?.onAuthStateChanged)stopReportAuth=reportAuth.onAuthStateChanged(user=>{if(user?.uid!==cfg.uid)frame.contentWindow?.postMessage({channel,action:'aircraft-report-session-ended'},'*');});
  window.addEventListener('message',listener);
  frame.style.visibility='hidden';frame.style.position='absolute';
  container.appendChild(frame);frame.srcdoc='<!DOCTYPE html>'+doc.documentElement.outerHTML;
  timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('La página no terminó de cargar. Puedes usar el visor de consulta.'));}},12000);
  try{await ready;clearTimeout(timer);frame.style.visibility='';frame.style.position='';/* Keep the initialized iframe attached: reinserting it reloads srcdoc. */for(const child of [...container.childNodes])if(child!==frame)child.remove();return dispose;}
  catch(error){dispose();throw error;}
 }
 window.RoleMainView={mount};
})();
