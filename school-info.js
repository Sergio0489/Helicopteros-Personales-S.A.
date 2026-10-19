/* Public institutional information only: never embed personal identifiers or contact details. */
(()=>{
 'use strict';
 const panel=document.getElementById('panel-escuela'),model=window.HPSchoolCertificates;
 if(!panel||!model)return;
 const esc=escapeRecord;
 const people={
  manager:{role:'Gerente General',name:'Cap. Mario Barcenas Chiari'},
  director:{role:'Director / Jefe de Instrucción',name:'Cap. Sergio Herrera Castro'},
  deputy:{role:'Asistente del Director / Jefe de Instrucción',name:'Cap. Sadot Ríos'},
  instructor:{role:'Instructor de Tierra y Vuelo',name:'Cap. Alcibíades Bustamante'},
  administration:{role:'Asistente Administrativo',name:'Cap. Fernando Alvarado'}
 };
 const specifications=[
  ['Curso Piloto Privado – Avión','2017-05-03'],
  ['Curso Piloto Comercial – Avión','2017-05-03'],
  ['Curso Piloto de Transporte de Línea Aérea – Avión','2017-05-03'],
  ['Habilitación Multimotor Terrestre – Avión','2017-05-03'],
  ['Habilitación por Instrumentos – Avión','2017-05-03'],
  ['Curso Instructor de Vuelo – Avión','2017-05-03'],
  ['Curso Piloto de Aeronave Pilotada a Distancia','2021-07-15']
 ];
 const rights=(box,action='view')=>!window.ROLE_VIEW||(box!=='certificates'||ROLE_VIEW.schoolCertificates===true)&&HPBoxes.permissions(ROLE_VIEW.policy,'escuela',box)[action];
 const node=id=>{const p=people[id];return '<article class="school-org-person" data-school-person="'+id+'"><p>'+esc(p.role)+'</p><h3>'+esc(p.name)+'</h3></article>';};
 const longDate=value=>new Intl.DateTimeFormat('es-PA',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Panama'}).format(new Date(value+'T12:00:00-05:00'));
 let renderedDay='',saving=false;
 function render(){
  renderedDay=model.today();
  const certs=previewData.school?.certificates||{};
  panel.innerHTML='<header class="school-institution-heading"><h1>HP FLIGHT SCHOOL</h1><p>AAC/DSA/EEAP/007</p></header>'+
   (rights('information')?'<section class="card school-organization" data-school-information><h2>Organigrama</h2><ol class="school-org-tree"><li>'+node('manager')+'<ol><li>'+node('director')+'<ol><li>'+node('deputy')+'<ol><li>'+node('instructor')+'</li></ol></li></ol></li><li>'+node('administration')+'</li></ol></li></ol></section>':'')+
   (rights('certificates')?'<section class="card school-certificates" data-school-certificates><h2>Certificados y vencimientos</h2><p class="school-cert-legend"><span class="school-status warn">61 a 90 días</span><span class="school-status orange">0 a 60 días</span><span class="school-status danger">Vencido</span></p><div class="school-cert-grid">'+model.certificates.map(c=>{const date=certs[c.id]?.expiresOn||'',state=model.status(date,renderedDay);return '<article class="school-certificate" data-school-certificate="'+c.id+'" data-level="'+state.level+'"><h3>'+esc(c.name)+'</h3><span class="school-cert-label">Fecha de vencimiento</span><div class="school-cert-date">'+(date?'<time datetime="'+esc(date)+'">'+esc(fechaVista(date))+'</time>':'<span>DD/MM/AAAA</span>')+'</div><p class="school-status '+state.level+'">'+esc(state.label)+'</p>'+(rights('certificates','edit')?'<button type="button" class="record-btn" data-school-cert-edit="'+c.id+'">'+(date?'Cambiar fecha':'Registrar fecha')+'</button>':'')+'</article>';}).join('')+'</div></section>':'')+
   (rights('information')?'<section class="card school-specifications" data-school-information><h2>Especificaciones de Instrucción</h2><ol>'+specifications.map(([name,date])=>'<li><div><h3>'+esc(name)+'</h3><p>Aprobado el <time datetime="'+date+'">'+esc(longDate(date))+'</time></p></div></li>').join('')+'</ol></section><details class="card school-institution-details" data-school-information><summary>Información institucional</summary><dl><div><dt>Razón social y comercial</dt><dd>Helicópteros Personales, S.A.</dd></div><div><dt>Registro público</dt><dd>Ficha 563687 · Documento 1117805 · Sección de micropelículas mercantil</dd></div><div><dt>Base de operaciones</dt><dd>Aeropuerto Internacional Marcos A. Gelabert, Hangar 19ª, Vía Diógenes de la Rosa, Albrook, corregimiento de Ancón, Panamá, República de Panamá.</dd></div><div><dt>Oficinas administrativas</dt><dd>Urbanización Obarrio N.º 4, calle 54.</dd></div><div><dt>Mantenimiento</dt><dd>Contratado a Talleres Aeronáuticos de Mantenimiento (TAM) habilitados por la AAC.</dd></div><div><dt>Teléfono y fax</dt><dd>(507) 315-0612</dd></div></dl><p>El Gerente General debe notificar a la AAC cualquier cambio de ubicación de la base de operaciones.</p></details>':'');
  window.HPBoxUI?.annotate();
 }
 function edit(id){
  const certificate=model.certificates.find(c=>c.id===id);
  if(!certificate||!rights('certificates','edit'))return;
  const before=previewData.school?.certificates?.[id]?.expiresOn||'';
  School.modal(certificate.name,'<label class="school-full">Fecha de vencimiento<input name="expiresOn" placeholder="DD/MM/AAAA" data-preserve-empty value="'+esc(fechaVista(before))+'"></label><p class="school-full school-muted">Deja la fecha vacía si aún no está registrada.</p>',async form=>{
   if(saving)throw Error('Espera a que termine el guardado.');
   if(!rights('certificates','edit'))throw Error('No tienes permiso para modificar los certificados.');
   const raw=String(form.expiresOn||'').trim(),value=isoFecha(raw);
   if(raw&&!Number.isFinite(model.day(value)))throw Error('Ingresa una fecha válida DD/MM/AAAA.');
   if((previewData.school?.certificates?.[id]?.expiresOn||'')!==before)throw Error('El certificado cambió. Cierra el formulario y vuelve a abrirlo.');
   if(value===before)return;
   const next=structuredClone(previewData);next.school ||= {};next.school.certificates ||= {};next.school.certificates[id]={expiresOn:value};
   model.validateChanges(previewData,next);saving=true;
   try{if(!await commitPreview(next))throw Error('No se pudo guardar la fecha. Se conserva el valor anterior.');render();buildResumen();}
   finally{saving=false;}
  });
 }
 panel.addEventListener('click',event=>{const button=event.target.closest('[data-school-cert-edit]');if(button&&!button.disabled)edit(button.dataset.schoolCertEdit);});
 const refreshDay=()=>{if(renderedDay!==model.today()){render();buildResumen();}};
 escuelaTab.addEventListener('click',render);
 window.addEventListener('focus',refreshDay);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});
 setInterval(refreshDay,60000);
 window.SchoolInformation={refresh:render};render();
})();
