'use strict';
// The same templates as the director, running without credentials or network access.
(()=>{
 let bundle,chartBundle;
 const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c');
 async function asset(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(path+'?native=20261020-home-1',{signal:controller.signal});if(!r.ok)throw Error('No se pudo cargar '+path+'.');return await r.text();}
  catch(e){if(e.name==='AbortError')throw Error('La carga del diseño tardó demasiado. Intenta actualizar.');throw e;}
  finally{clearTimeout(timer);}
 }
 async function assets(page){
  if(!bundle)bundle=Promise.all(['index.html','dashboard.js','students.js','registro.js','students.css','functions/boxes.js','box-ui.js','functions/monthly-winners.js','monthly-winners-ui.js','pilots-ui.js','functions/school-certificates.js','school-info.js','functions/school-information.js','draft-recovery.js','home-search-model.js','home-ui.js'].map(asset)).catch(e=>{bundle=null;throw e;});
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
   const output=outputFor(e);if(output)return !!mayOutput(output);
   if(e.matches('a[download][href^="blob:"]'))return !!mayOutput(outputContext)&&outputContext[2]==='export';
   if(e.matches('[data-receipt]'))return HPBoxes.permissions(cfg.policy,'pagos','receipts').view;
   if(e.matches('[data-receipt-close]'))return true;
   if(e.closest('[data-draft-notice],[data-home-control]'))return true;
   if(e.closest('#sidebar,#readonly-profile,#readonly-refresh,#readonly-logout,#hamburgerBtn,#drawerCloseBtn,#drawerOverlay'))return true;
   if(e.closest('[data-aac-filters],[data-hp-filters]'))return true;
   if(e.matches('[data-pilot-select],[data-pilot-search],[data-pilot-action="print"],[data-pilot-action="blank-print"]'))return true;
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
  window.finishRoleView=()=>{
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
   if(cfg.home)HomeUI.showHome();else if(cfg.searchTarget)HomeUI.focusTarget(cfg.searchTarget);
   send('ready');
  };
 }
 async function mount(container,result,page,onAction){
  if(!result.native)throw Error('Para usar el diseño principal falta publicar la función actualizada en Firebase.');
  const [html,dashboard,students,registro,schoolCSS,boxesScript,boxUIScript,winnersMath,winnersUI,pilotsUI,schoolCertificates,schoolInformation,schoolContentModel,draftScript,homeModel,homeUI,chart]=await assets(page);
  const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,link[rel=manifest]').forEach(n=>n.remove());doc.querySelectorAll('link[rel=stylesheet]').forEach(n=>{if(!n.getAttribute('href').startsWith('https://fonts.googleapis.com/'))n.remove();});
  const schoolStyle=document.createElement('style');schoolStyle.textContent=schoolCSS;doc.head.appendChild(schoolStyle);
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
  add(schoolContentModel);add(schoolCertificates);add(dashboard);add(students);add(registro);add(winnersMath);add(winnersUI);add(pilotsUI);add(schoolInformation);add(boxUIScript);add('window.finishRoleView();');
  let settled=false,timer,resolveReady,rejectReady,searchCache=null,searchAt=0;
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
  const dispose=()=>{clearTimeout(timer);window.removeEventListener('message',listener);frame.remove();};
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
  window.addEventListener('message',listener);
  frame.style.visibility='hidden';frame.style.position='absolute';
  container.appendChild(frame);frame.srcdoc='<!DOCTYPE html>'+doc.documentElement.outerHTML;
  timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('La página no terminó de cargar. Puedes usar el visor de consulta.'));}},12000);
  try{await ready;clearTimeout(timer);frame.style.visibility='';frame.style.position='';container.replaceChildren(frame);return dispose;}
  catch(error){dispose();throw error;}
 }
 window.RoleMainView={mount};
})();



