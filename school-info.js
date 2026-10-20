/* Public institutional information only: never embed personal identifiers or contact details. */
(()=>{
 'use strict';
function initialize(company=false){
 const page=company?'charter':'escuela',panel=document.getElementById(company?'panel-empresa':'panel-escuela'),model=window.HPSchoolCertificates;
 if(!panel||!model)return;
 const esc=escapeRecord;
 const information=window.HPSchoolInformation;if(!information)return;
 const config=()=>company?HPCompany.value(previewData.school):information.value(previewData.school);
 const school=()=>company?previewData.school?.charter:previewData.school;
 const target=next=>{next.school ||= {};if(company){next.school.charter ||= {};return next.school.charter;}return next.school;};
 const canManage=()=>!window.ROLE_VIEW;
 const editButton=(kind,id,label='Editar')=>canManage()?'<button type="button" class="record-btn" data-school-content="'+kind+'" data-content-id="'+esc(id||'')+'">'+label+'</button>':'';
 const rights=(box,action='view')=>!window.ROLE_VIEW||(box!=='certificates'||ROLE_VIEW.schoolCertificates===true)&&HPBoxes.permissions(ROLE_VIEW.policy,page,box)[action];
 const node=p=>'<article class="school-org-person" data-school-person="'+esc(p.id)+'"><p>'+esc(p.role)+'</p><h3>'+esc(window.HPCompany?HPCompany.resolve(p,previewData):p.name)+'</h3>'+editButton('people',p.id)+'</article>';
 const longDate=value=>new Intl.DateTimeFormat('es-PA',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Panama'}).format(new Date(value+'T12:00:00-05:00'));
 let renderedDay='',saving=false;
 function render(){
  renderedDay=model.today();
  const certs=school()?.certificates||{},info=config(),manager=info.people.find(p=>p.id==='manager'),director=info.people.find(p=>p.id==='director');
  panel.innerHTML='<header class="school-institution-heading"><h1>'+ (company?'HP CHARTER':'HP FLIGHT SCHOOL') +'</h1><p>'+ (company?'Helicópteros Personales, S.A.':'AAC/DSA/EEAP/007') +'</p></header>'+
   (rights('information')?'<section class="card school-organization" data-school-information><h2>Organigrama</h2><ol class="school-org-tree"><li>'+node(manager)+'<ol><li>'+node(director)+'<ol class="school-org-team">'+info.people.filter(p=>p.parent==='director').map(p=>'<li>'+node(p)+'</li>').join('')+'</ol></li></ol></li></ol>'+editButton('people','','Agregar integrante')+'</section>':'')+
   (rights('certificates')?'<section class="card school-certificates" data-school-certificates><h2>Certificados y vencimientos</h2><p class="school-cert-legend"><span class="school-status warn">61 a 90 días</span><span class="school-status orange">0 a 60 días</span><span class="school-status danger">Vencido</span></p><div class="school-cert-grid">'+info.certificates.map(c=>{const date=certs[c.id]?.expiresOn||'',state=model.status(date,renderedDay);return '<article class="school-certificate" data-school-certificate="'+c.id+'" data-level="'+state.level+'"><h3>'+esc(c.name)+'</h3>'+editButton('certificates',c.id)+(canManage()?'<button type="button" class="record-btn" data-cert-delete="'+esc(c.id)+'">Eliminar</button>':'')+'<span class="school-cert-label">Fecha de vencimiento</span><div class="school-cert-date">'+(date?'<time datetime="'+esc(date)+'">'+esc(fechaVista(date))+'</time>':'<span>DD/MM/AAAA</span>')+'</div><p class="school-status '+state.level+'">'+esc(state.label)+'</p>'+(rights('certificates','edit')?'<button type="button" class="record-btn" data-school-cert-edit="'+c.id+'">'+(date?'Cambiar fecha':'Registrar fecha')+'</button>':'')+'</article>';}).join('')+'</div>'+editButton('certificates','','Agregar certificado')+'</section>':'')+
   (rights('information')? (company?'':'<section class="card school-specifications" data-school-information><h2>Especificaciones de Instrucción</h2><ol>'+info.courses.map(c=>'<li><div><h3>'+esc(c.name)+'</h3><p>Aprobado el <time datetime="'+esc(c.approvedOn)+'">'+esc(longDate(c.approvedOn))+'</time></p>'+editButton('courses',c.id)+'</div></li>').join('')+'</ol>'+editButton('courses','','Agregar curso')+'</section>')+'<details class="card school-institution-details" data-school-information><summary>Información institucional</summary><dl>'+info.institution.map(row=>'<div><dt>'+esc(row.label)+'</dt><dd>'+esc(row.value)+'</dd>'+editButton('institution',row.id)+'</div>').join('')+'</dl><p>'+esc(info.note)+'</p>'+editButton('note','note','Editar nota')+editButton('institution','','Agregar dato institucional')+'</details>':'');
  if(company){for(const [old,key]of [['data-school-information','data-charter-information'],['data-school-certificates','data-charter-certificates']])for(const el of panel.querySelectorAll('['+old+']')){el.removeAttribute(old);el.setAttribute(key,'');}window.CompanyPersonnel?.mount(panel);}
  window.HPBoxUI?.annotate();
 }
 function edit(id){
  const certificate=config().certificates.find(c=>c.id===id);
  if(!certificate||!rights('certificates','edit'))return;
  const before=school()?.certificates?.[id]?.expiresOn||'';
  School.modal(certificate.name,'<label class="school-full">Fecha de vencimiento<input name="expiresOn" placeholder="DD/MM/AAAA" data-preserve-empty value="'+esc(fechaVista(before))+'"></label><p class="school-full school-muted">Deja la fecha vacía si aún no está registrada.</p>',async form=>{
   if(saving)throw Error('Espera a que termine el guardado.');
   if(!rights('certificates','edit'))throw Error('No tienes permiso para modificar los certificados.');
   const raw=String(form.expiresOn||'').trim(),value=isoFecha(raw);
   if(raw&&!Number.isFinite(model.day(value)))throw Error('Ingresa una fecha válida DD/MM/AAAA.');
   if((school()?.certificates?.[id]?.expiresOn||'')!==before)throw Error('El certificado cambió. Cierra el formulario y vuelve a abrirlo.');
   if(value===before)return;
   const next=structuredClone(previewData);const dest=target(next);dest.certificates ||= {};dest.certificates[id]={expiresOn:value};
   if(company)HPCompany.validateChanges(previewData,next);else model.validateChanges(previewData,next);saving=true;
   try{if(!await commitPreview(next))throw Error('No se pudo guardar la fecha. Se conserva el valor anterior.');render();buildResumen();}
   finally{saving=false;}
  });
 }
 const field=(name,label,value='',max=200)=>'<label class="school-full">'+label+'<input name="'+name+'" value="'+esc(value)+'" maxlength="'+max+'" required></label>';
 function editContent(kind,id){
  if(!canManage()||!['people','courses','institution','certificates','note'].includes(kind))return;
  const initial=config(),before=JSON.stringify(school()?.information),row=kind==='note'?{value:initial.note}:initial[kind].find(r=>r.id===id);
  if(id&&!row)return;
  let body='';
  if(kind==='people')body=window.OrganizationPeople?OrganizationPeople.form(row):field('name','Nombre',row?.name,150)+field('role','Cargo',row?.role,150);
  if(kind==='courses')body=field('name','Curso',row?.name,200)+field('approvedOn','Fecha de aprobación (DD/MM/AAAA)',row?fechaVista(row.approvedOn):'',10);
  if(kind==='certificates')body=field('name','Nombre del certificado',row?.name,200);
  if(kind==='institution')body=field('label','Título del dato',row?.label,120)+'<label class="school-full">Contenido<textarea name="value" maxlength="2000" required>'+esc(row?.value||'')+'</textarea></label>';
  if(kind==='note')body='<label class="school-full">Nota institucional<textarea name="value" maxlength="2000">'+esc(row.value)+'</textarea></label>';
  School.modal((id?'Editar':'Agregar')+' · '+({people:'Organigrama',courses:'Curso',institution:'Información institucional',certificates:'Certificado',note:'Nota institucional'}[kind]),body,async form=>{
   if(!canManage())throw Error('Solo el Director puede modificar esta información.');
   if(saving)throw Error('Espera a que termine el guardado.');
   if(JSON.stringify(school()?.information)!==before)throw Error('La información cambió. Cierra el formulario y vuelve a abrirlo.');
   const info=config();let nextRow;
   if(kind==='note')info.note=String(form.value||'').trim();
   else{
    const key=id||'custom-'+crypto.randomUUID();
    if(kind==='people')nextRow={id:key,name:String(form.name||'').trim(),role:String(form.role||'').trim(),parent:row?.parent??'director'};
    if(kind==='courses')nextRow={id:key,name:String(form.name||'').trim(),approvedOn:isoFecha(String(form.approvedOn||'').trim())};
    if(kind==='certificates'){info.certificatesEmpty=false;}
    if(kind==='certificates')nextRow={id:key,name:String(form.name||'').trim()};
    if(kind==='institution')nextRow={id:key,label:String(form.label||'').trim(),value:String(form.value||'').trim()};
    if(id)info[kind][info[kind].findIndex(r=>r.id===id)]=nextRow;else info[kind].push(nextRow);
   }
   const next=structuredClone(previewData);if(kind==='people'&&window.OrganizationPeople)OrganizationPeople.link(next,nextRow,form);information.validate(info,company);target(next).information=info;
   saving=true;try{if(!await commitPreview(next))throw Error('No se pudo guardar. Se conserva la información anterior.');if(kind==='people'&&Array.isArray(next.pilotos))pilotosData.splice(0,pilotosData.length,...structuredClone(next.pilotos));render();buildResumen();}finally{saving=false;}
  });
 }
 panel.addEventListener('click',event=>{const button=event.target.closest('[data-school-content]');if(button&&!button.disabled)editContent(button.dataset.schoolContent,button.dataset.contentId);});
 panel.addEventListener('click',event=>{const button=event.target.closest('[data-school-cert-edit]');if(button&&!button.disabled)edit(button.dataset.schoolCertEdit);});
 panel.addEventListener('click',async event=>{const button=event.target.closest('[data-cert-delete]');if(!button||button.disabled||!canManage()||saving)return;const id=button.dataset.certDelete,c=config().certificates.find(c=>c.id===id);if(!c||!confirm('¿Eliminar '+c.name+' y su fecha de vencimiento? También se quitará su alerta de Pendientes.'))return;const next=structuredClone(previewData),dest=target(next),info=config();info.certificates=info.certificates.filter(c=>c.id!==id);info.certificatesEmpty=info.certificates.length===0;dest.information=info;if(dest.certificates)delete dest.certificates[id];saving=true;try{if(await commitPreview(next)){render();buildResumen();}}finally{saving=false;}});
 const refreshDay=()=>{if(renderedDay!==model.today()){render();buildResumen();}};
 (company?empresaTab:escuelaTab).addEventListener('click',render);
 window.addEventListener('focus',refreshDay);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});
 setInterval(refreshDay,60000);
 window[company?'CharterInformation':'SchoolInformation']={refresh:render};render();
 }
 initialize();if(window.HPCompany)initialize(true);
})();

