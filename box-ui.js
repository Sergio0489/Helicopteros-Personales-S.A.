'use strict';
(()=>{
 const panels={horario:'#panel-horario-dia',pendientes:'#panel-resumen',aeronaves:'.aircraft-panel[id^="panel-"]',pilotos:'#panel-pilotos',bitacora:'#panel-registro',pagos:'#panel-registro-pago',itinerario:'#panel-itinerarios',estudiantes:'#panel-estudiantes',escuela:'#panel-escuela',charter:'#panel-empresa',estadisticas:'#panel-estadisticas',saldos:'#panel-alerta-saldos',usuarios:'#panel-usuarios'};
 function tag(el,page,b){if(!el)return;el.dataset.permissionPage=page;el.dataset.permissionBox=b.id;el.dataset.boxName=b.name;el.setAttribute('aria-label',b.name);el.title=b.name;}
 const style=document.createElement('style');style.textContent='[data-box-caption]::before{content:attr(data-box-caption);display:block;font-size:10px;font-weight:700;line-height:1.35;text-align:left;grid-column:1/-1;flex-basis:100%;color:#173556;margin:0 0 6px;white-space:normal;pointer-events:none} @media print{[data-box-caption]::before{display:none}}';document.head.appendChild(style);
 function annotate(){
  for(const [page,boxes]of Object.entries(HPBoxes.catalog))for(const panel of document.querySelectorAll(panels[page])){
   if(page==='aeronaves'&&!/^panel-\d+$/.test(panel.id))continue;
   for(const box of boxes){
    if(page==='pilotos')continue;
    if(page==='aeronaves'&&box.id==='documents'){for(const c of panel.querySelectorAll('[data-section="documents"]>:not(.emerg-section)'))tag(c,page,box);continue;}
    if(page==='estudiantes'&&box.id==='courses'){for(const c of panel.querySelectorAll('.school-course-grid>section>.school-row,.school-course-grid>section>p,.school-course-grid>section>.school-course-dates'))tag(c,page,box);continue;}
    if(page==='estudiantes'&&['clients','rates','course-rates'].includes(box.id)){const view=panel.querySelector('[data-view][aria-pressed="true"]')?.dataset.view;if(view!==box.id)continue;}
    for(const el of panel.querySelectorAll(box.selector)){
     const wrapper=['intakes'].includes(box.id)?el.closest('.card'):page==='bitacora'?el.closest('.card'):page==='saldos'?el.closest('tr'):el;tag(wrapper||el,page,box);
    }
   }
   if(page==='estadisticas')panel.querySelectorAll('canvas').forEach(canvas=>{const b=boxes.find(b=>b.selector==='#'+canvas.id);if(b)tag(canvas.closest('.card'),page,b);});
  }
  document.querySelectorAll('#pilotos-list input,#pilotos-list button,#pilotos-list [onclick]').forEach(el=>{const code=(el.getAttribute('onchange')||'')+(el.getAttribute('onclick')||'');const id=/licencia|habilitaciones/.test(code)?'licenses':/medico|escuela|verificaciones|Verificacion/.test(code)?'documents':'pilots';tag(el,'pilotos',HPBoxes.catalog.pilotos.find(b=>b.id===id));});
  document.querySelectorAll('.aircraft-status-control').forEach(el=>tag(el,'aeronaves',HPBoxes.catalog.aeronaves.find(b=>b.id==='status')));
  const student=document.getElementById('panel-estudiantes');if(student){
   const box=id=>HPBoxes.catalog.estudiantes.find(b=>b.id===id);
   student.querySelectorAll('.card').forEach(c=>{if(c.querySelector('h3')?.textContent==='Otros gastos')tag(c,'estudiantes',box('expenses'));});
   student.querySelectorAll('.card').forEach(c=>{if(c.querySelector('h3')?.textContent==='Horas sin curso asignado')tag(c,'estudiantes',box('hours'));});
   student.querySelectorAll('.school-fee,.school-balances,.school-ledger').forEach(c=>tag(c,'estudiantes',box('account')));
  }
  document.querySelectorAll('[data-permission-box]').forEach(el=>{if(el.matches('input,button,select,textarea,option,canvas,table,thead,tbody,tr,td,th,h1,h2,h3,p,a,span,small,label')||el.closest('.school-account-button'))return;const parent=el.parentElement.closest('[data-permission-box]');if(parent?.dataset.permissionBox===el.dataset.permissionBox)return;el.dataset.boxCaption=el.dataset.boxName;});
  document.querySelectorAll('#pilotos-list').forEach(el=>{el.dataset.boxCaption='Datos de pilotos · Licencias y habilitaciones · Vencimientos y documentos';});
  document.querySelectorAll('.users-table').forEach(el=>{if(el.parentElement)el.parentElement.dataset.boxCaption='Usuarios y cargos';});
  document.querySelectorAll('.daily-schedule-aircraft').forEach(el=>{el.dataset.boxCaption='Vuelos por aeronave · '+(el.querySelector('h2')?.textContent||'');});
 }
 const actionBox={ 'new-student':'personal','edit-student':'personal','delete-student':'personal','print-student':'personal','blank-registration':'personal','new-client':'clients','client-statement':'account','client-payment':'account','add-course':'courses','edit-course':'courses','delete-course':'courses','add-tutoring':'account','delete-archived-course':'archived',payment:'account','extra-payment':'account','void-extra':'account',expense:'expenses',statement:'account',flight:'hours',simulator:'hours',rate:'rates','course-rate':'course-rates','add-service':'rates','edit-service':'rates',intake:'intakes',brochure:'mail',email:'mail'};
 function owner(el){
  if(el.dataset.action==='void')return ['estudiantes',el.dataset.kind==='flights'?'hours':'account'];
  if(el.matches('[onclick^="addPiloto"],[onclick^="agregarPiloto"]'))return ['pilotos','pilots'];
  if(el.dataset.action&&actionBox[el.dataset.action])return ['estudiantes',actionBox[el.dataset.action]];
  if(/^plannerChooseSlot/.test(el.getAttribute('onclick')||''))return ['itinerario','create'];
  if(/^openFlightTimeEditor/.test(el.getAttribute('onclick')||''))return ['itinerario','flights'];
  if(el.matches('[name=proof]'))return ['pagos','attachments'];
  if(el.matches('[data-payment-add]'))return ['pagos','create'];
  if(el.matches('[data-delete-receipt],[data-receipt]'))return ['pagos','receipts'];
  if(el.matches('[data-delete-payment]'))return ['pagos','movements'];
  if(el.matches('[id^="status-"]'))return ['aeronaves','status'];
  if(el.matches('[data-hide-balance]'))return ['saldos',el.dataset.hideBalance.startsWith('client:')?'clients':'students'];
  const box=el.closest('[data-permission-box]');return box?[box.dataset.permissionPage,box.dataset.permissionBox]:null;
 }
 window.HPBoxUI={annotate,owner};
 let queued=false;const observe=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;annotate();});};
 new MutationObserver(observe).observe(document.body,{childList:true,subtree:true});annotate();
})();
