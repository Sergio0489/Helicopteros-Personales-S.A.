/* Student administration. All mutations commit through the existing authenticated cloud writer. */
(function(){
'use strict';
const COURSES={
 privado:{name:'Piloto Privado',fees:['matricula','teoria','vuelo'],states:['Por iniciar','Curso Teórico','Vuelo solo','Licencia Piloto privado']},
 comercial:{name:'Piloto Comercial',fees:['matricula','teoria','vuelo'],states:['Por iniciar','Curso Teórico','XC','Licencia Piloto Comercial']},
 ifr:{name:'IFR',fees:['matricula','teoria','simulador','vuelo'],states:['Por iniciar','Curso Teórico','Simulador','Habilitación IFR']},
 multimotor:{name:'Multi-Motor',fees:['matricula','teoria','vuelo'],states:['Por iniciar','Curso Teórico','Habilitación Multi-Motor']},
 rpa:{name:'RPA (Drone)',fees:['teoria','vuelo'],states:['Por iniciar','Curso Teórico','Horas de vuelo','Licencia de RPA']},
 instructor:{name:'Instructor de vuelo',fees:['matricula','teoria','vuelo'],states:['Por iniciar','Curso Teórico','Horas de vuelo','Licencia de Instructor de vuelo']}
};
const FEES={matricula:'Matrícula',teoria:'Curso teórico',vuelo:'Horas de vuelo',simulador:'Horas de simulador'};
const SOURCES=['Propio','IFARHU','Beca'];
const STAGES=['Interesado','Matriculado','En formación','Carrera culminada','Retirado'];
const FUNDING=['Propio','IFARHU en trámite','IFARHU aprobado','Beca','Mixto'];
const esc=escapeRecord,uid=()=>crypto.randomUUID(),today=()=>panamaISO();
const money=c=>new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format((Number(c)||0)/100);
const list=x=>Array.isArray(x)?x:[];
let selected=null,view='students',query='',stageFilter='',busy=false,activeDialog=null;
function data(){return {version:1,students:[],rates:{},intakes:[],brochureUrl:'',...previewData.school};}
function cents(value){
 const s=String(value??'').trim();if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))return null;
 const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));
}
function numeric(c){return (Number(c||0)/100).toFixed(2);}
function validDate(value,required=false){if(!value)return !required;return Number.isFinite(dayNumber(value));}
function active(entries){return list(entries).filter(e=>!e.voidedAt);}
function paymentTotal(course,fee){return active(course.payments).filter(p=>!fee||p.fee===fee).reduce((sum,p)=>sum+p.cents,0);}
function flightTotal(course,fee){return active(course.flights).filter(f=>!fee||f.fee===fee).reduce((sum,f)=>sum+f.costCents,0);}
function hoursTotal(course,fee){return active(course.flights).filter(f=>!fee||f.fee===fee).reduce((sum,f)=>sum+f.hours100,0);}
function courseSummary(course){
 const budget=COURSES[course.type].fees.reduce((sum,f)=>sum+Number(course.budgets?.[f]||0),0),paid=paymentTotal(course);
 return {budget,paid,due:budget-paid,flightBalance:paymentTotal(course,'vuelo')-flightTotal(course,'vuelo'),simBalance:paymentTotal(course,'simulador')-flightTotal(course,'simulador')};
}
function twoMonthsBefore(iso){
 const [year,month,day]=iso.split('-').map(Number);const first=new Date(Date.UTC(year,month-3,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(day,last));return first.toISOString().slice(0,10);
}
function noticeRows(school,date=today()){
 const result=[];
 for(const student of list(school.students)){
  if(student.stage!=='Interesado'||student.enrolledDate||list(student.courses).some(c=>paymentTotal(c)>0))continue;
  for(const type of list(student.interests)){
   const next=list(school.intakes).filter(i=>i.type===type&&i.startDate>=date).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];
   if(!next)continue;
   const scheduled=twoMonthsBefore(next.startDate);
   result.push({student,intake:next,scheduled,due:scheduled<=date});
  }
 }
 return result.sort((a,b)=>a.scheduled.localeCompare(b.scheduled));
}
function studentById(school,id){const s=list(school.students).find(s=>s.id===id);if(!s)throw Error('No se encontró el estudiante.');return s;}
function courseById(student,id){const c=list(student.courses).find(c=>c.id===id);if(!c)throw Error('No se encontró el curso.');return c;}
async function change(mutator){
 if(busy)throw Error('Espera a que termine el guardado.');busy=true;
 try{const next=structuredClone(previewData),school=structuredClone(data());mutator(school);next.school=school;
  if(!await commitPreview(next))throw Error('No se pudo guardar. Se conserva la información anterior.');
  render();decorateRates();
 }finally{busy=false;}
}
function options(values,value){return values.map(v=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(v)+'</option>').join('');}
function courseOptions(value){return Object.entries(COURSES).map(([key,c])=>'<option value="'+key+'"'+(key===value?' selected':'')+'>'+c.name+'</option>').join('');}
function dateField(name,label,value='',required=false){return '<label>'+label+'<input name="'+name+'" placeholder="DD/MM/AAAA" value="'+esc(fechaVista(value))+'"'+(required?' required':'')+'></label>';}
function input(name,label,value='',type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';}
function amountField(name,label,value=0){return input(name,label,numeric(value),'number','min="0" max="999999999.99" step="0.01" required');}
function errorDate(form,names){for(const [key,required]of names)if(!validDate(form[key],required))throw Error('Revisa la fecha: usa DD/MM/AAAA.');}
function modal(title,body,onSave,afterOpen){
 if(activeDialog)return;
 const dialog=document.createElement('dialog');dialog.className='record-dialog school-dialog';
 dialog.innerHTML='<form><h3>'+esc(title)+'</h3><div class="school-form">'+body+'</div><p class="record-error" role="alert"></p><div class="record-actions"><button type="button" class="record-btn" data-close>Cancelar</button><button type="submit" class="save-btn">Guardar</button></div></form>';
 document.body.appendChild(dialog);activeDialog=dialog;let dirty=false,saving=false;
 dialog.addEventListener('input',()=>{dirty=true;dialog.dataset.dirty='1';});dialog.addEventListener('change',()=>{dirty=true;dialog.dataset.dirty='1';});
 function canClose(){return !saving&&(!dirty||window.confirm('¿Descartar los cambios de este formulario?'));}
 dialog.querySelector('[data-close]').onclick=()=>{if(canClose())dialog.close();};
 dialog.addEventListener('cancel',e=>{if(!canClose())e.preventDefault();});
 dialog.addEventListener('close',()=>{dialog.remove();activeDialog=null;});
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(saving)return;saving=true;dialog.querySelector('[type="submit"]').disabled=true;
  try{const fields=Object.fromEntries(new FormData(event.target));await onSave(fields,event.target);dirty=false;dialog.close();}
  catch(e){dialog.querySelector('.record-error').textContent=e.message||'No se pudo completar la operación.';}
  finally{saving=false;if(dialog.isConnected)dialog.querySelector('[type="submit"]').disabled=false;}
 };
 dialog.showModal();if(afterOpen)afterOpen(dialog);
}
function studentPersonalValues(fields){
 const result={};
 for(const key of ['address','identity','nationality','previousSchool','residentialPhone','fatherName','motherName','emergencyName','emergencyPhone','referredBy'])result[key]=String(fields[key]||'').trim();
 result.birthDate=isoFecha(fields.birthDate||'');return result;
}
function studentInfoItem(label,value){
 return '<div class="school-info-item"><strong class="school-info-label">'+esc(label)+':</strong> <span class="school-info-value">'+esc(value||'Pendiente')+'</span></div>';
}
function studentPersonalHtml(s){
 const values=[['Nombre completo',s.name],['Cédula o pasaporte',s.identity],['Fecha de nacimiento',fechaVista(s.birthDate||'')],['Nacionalidad',s.nationality],['Dirección',s.address],['Celular',s.phone],['Teléfono residencial',s.residentialPhone],['Correo electrónico',s.email],['Contacto de emergencia',s.emergencyName],['Celular de emergencia',s.emergencyPhone],['Nombre del padre',s.fatherName],['Nombre de la madre',s.motherName],['Colegio de procedencia',s.previousSchool],['Quién lo recomienda',s.referredBy],['Ingreso al sistema',fechaVista(s.createdDate||'')],['Fecha de matrícula',fechaVista(s.enrolledDate||'')],['Etapa',s.stage],['Financiamiento',s.funding],['Cursos de interés',list(s.interests).map(k=>COURSES[k]?.name||k).join(', ')],['Culminación de carrera',fechaVista(s.completedDate||'')],['Observaciones',s.notes]];
 return values.map(([label,value])=>studentInfoItem(label,value)).join('');
}
function editStudent(id){
 const s=id?studentById(data(),id):{name:'',createdDate:today(),stage:'Interesado',funding:'Propio',interests:[],courses:[]};
 const interests=Object.entries(COURSES).map(([key,c])=>'<label class="school-check"><input type="checkbox" name="interest" value="'+key+'"'+(list(s.interests).includes(key)?' checked':'')+'>'+c.name+'</label>').join('');
 modal(id?'Editar estudiante':'Nuevo estudiante','<h4 class="school-form-section">Datos personales</h4>'+input('name','Nombre completo',s.name,'text','required maxlength="160"')+input('identity','Cédula o pasaporte',s.identity||'','text','maxlength="60"')+input('nationality','Nacionalidad',s.nationality||'','text','maxlength="100"')+dateField('birthDate','Fecha de nacimiento',s.birthDate)+input('address','Dirección',s.address||'','text','maxlength="500"')+input('previousSchool','Colegio de procedencia',s.previousSchool||'','text','maxlength="200"')+'<h4 class="school-form-section">Contacto</h4>'+input('residentialPhone','Teléfono residencial',s.residentialPhone||'','tel','maxlength="40"')+input('phone','Celular',s.phone||'','tel','maxlength="40"')+input('email','Correo electrónico',s.email||'','email','maxlength="180"')+'<h4 class="school-form-section">Familia y contacto de emergencia</h4>'+input('fatherName','Nombre del padre',s.fatherName||'','text','maxlength="160"')+input('motherName','Nombre de la madre',s.motherName||'','text','maxlength="160"')+input('emergencyName','Contacto de emergencia · nombre',s.emergencyName||'','text','maxlength="160"')+input('emergencyPhone','Contacto de emergencia · celular',s.emergencyPhone||'','tel','maxlength="40"')+'<h4 class="school-form-section">Registro académico</h4>'+dateField('createdDate','Ingreso al sistema',s.createdDate,true)+'<label>Etapa<select name="stage">'+options(STAGES,s.stage)+'</select></label><label>Financiamiento<select name="funding">'+options(FUNDING,s.funding)+'</select></label>'+dateField('enrolledDate','Fecha de matrícula',s.enrolledDate)+input('referredBy','Quién lo recomienda',s.referredBy||'','text','maxlength="200"')+dateField('completedDate','Fecha de culminación de carrera',s.completedDate)+'<fieldset class="school-full"><legend>Cursos de interés</legend><div class="school-checks">'+interests+'</div></fieldset><label class="school-full">Observaciones<textarea name="notes" maxlength="4000">'+esc(s.notes||'')+'</textarea></label>',async(f,form)=>{
  errorDate(f,[['createdDate',true],['birthDate',false],['enrolledDate',['Matriculado','En formación','Carrera culminada'].includes(f.stage)],['completedDate',f.stage==='Carrera culminada']]);
  if(!f.name.trim())throw Error('Ingresa el nombre del estudiante.');
  if(f.birthDate&&dayNumber(f.birthDate)>dayNumber(today()))throw Error('La fecha de nacimiento no puede estar en el futuro.');
  const email=f.email.trim();const all=data().students;
  if(email&&all.some(x=>x.id!==id&&String(x.email||'').toLowerCase()===email.toLowerCase()))throw Error('Ya existe un estudiante con ese correo.');
  const record={...studentPersonalValues(f),name:f.name.trim(),createdDate:isoFecha(f.createdDate),phone:f.phone.trim(),email,stage:f.stage,funding:f.funding,enrolledDate:isoFecha(f.enrolledDate),completedDate:isoFecha(f.completedDate),interests:new FormData(form).getAll('interest'),notes:f.notes.trim()};
  const newId=id||uid();await change(school=>{if(id){const target=studentById(school,id);target.history ||= [];target.history.push({at:new Date().toISOString(),action:'Expediente actualizado',before:{stage:target.stage,funding:target.funding},after:{stage:record.stage,funding:record.funding}});Object.assign(target,record);}else school.students.push({...record,id:newId,courses:[],history:[{at:new Date().toISOString(),action:'Ingreso al sistema'}]});});selected=newId;render();
 });
}
function addCourse(studentId){
 modal('Agregar curso','<label class="school-full">Curso<select name="type">'+courseOptions('privado')+'</select></label>'+dateField('startDate','Fecha de inicio') ,async f=>{
  errorDate(f,[['startDate',false]]);if(!COURSES[f.type])throw Error('Selecciona un curso.');
  const c={id:uid(),type:f.type,startDate:isoFecha(f.startDate),endDate:'',status:COURSES[f.type].states[0],licenseDate:'',licenseNumber:'',budgets:{},payments:[],flights:[],history:[]};
  await change(school=>studentById(school,studentId).courses.push(c));
 });
}
async function deleteCourse(sid,cid){
 const student=studentById(data(),sid),course=courseById(student,cid);
 const message='¿Quieres eliminar el curso '+COURSES[course.type].name+' de '+student.name+'?\n\nSe retirará de los cursos y de los saldos activos. Sus pagos, horas y datos se conservarán en el historial del expediente.';
 if(!window.confirm(message))return;
 await change(school=>{const target=studentById(school,sid),index=target.courses.findIndex(c=>c.id===cid);if(index<0)throw Error('El curso ya no está disponible.');
  const [removed]=target.courses.splice(index,1);target.deletedCourses ||= [];target.deletedCourses.push({...removed,deletedAt:new Date().toISOString()});
  target.history ||= [];target.history.push({at:new Date().toISOString(),action:'Curso eliminado',courseId:cid,courseType:removed.type});
 });
}
function editCourse(sid,cid){
 const c=courseById(studentById(data(),sid),cid),spec=COURSES[c.type];
 modal('Curso · '+spec.name,'<label class="school-full">Curso<select name="type">'+courseOptions(c.type)+'</select></label><label class="school-full">Estado<select name="status">'+options(spec.states,c.status)+'</select></label>'+dateField('startDate','Fecha de inicio',c.startDate)+dateField('endDate','Fecha de culminación del curso',c.endDate)+dateField('licenseDate','Fecha de licencia / habilitación',c.licenseDate)+input('licenseNumber','Número de licencia / habilitación',c.licenseNumber||'')+'<div class="school-full school-course-budget-fields school-form">'+spec.fees.map(f=>amountField('budget_'+f,'Monto · '+FEES[f],c.budgets?.[f])).join('')+'</div>',async f=>{
  const chosen=COURSES[f.type];if(!chosen||!chosen.states.includes(f.status))throw Error('Revisa el curso y el estado.');
  const incompatible=[...list(c.payments),...list(c.flights)].some(x=>!chosen.fees.includes(x.fee));
  if(incompatible)throw Error('Los movimientos existentes no son compatibles con ese curso. Conserva este curso y agrega el nuevo para mantener sus pagos y horas.');
  const completed=f.status===chosen.states.at(-1);errorDate(f,[['startDate',false],['endDate',false],['licenseDate',completed]]);
  const budgets={};for(const fee of chosen.fees){budgets[fee]=cents(f['budget_'+fee]);if(budgets[fee]===null)throw Error('Revisa los montos.');}
  if(f.startDate&&f.endDate&&dayNumber(f.endDate)<dayNumber(f.startDate))throw Error('La fecha de culminación no puede ser anterior al inicio.');
  await change(school=>{const target=courseById(studentById(school,sid),cid);target.history ||= [];target.history.push({at:new Date().toISOString(),before:{type:target.type,status:target.status,budgets:target.budgets,licenseDate:target.licenseDate},after:{type:f.type,status:f.status,budgets,licenseDate:isoFecha(f.licenseDate)}});Object.assign(target,{type:f.type,status:f.status,startDate:isoFecha(f.startDate),endDate:isoFecha(f.endDate),licenseDate:isoFecha(f.licenseDate),licenseNumber:f.licenseNumber.trim(),budgets});});
 },dialog=>{
  const amounts={...c.budgets};
  dialog.querySelector('[name="type"]').onchange=event=>{
   dialog.querySelectorAll('[name^="budget_"]').forEach(el=>{const value=cents(el.value);if(value!==null)amounts[el.name.slice(7)]=value;});
   const next=COURSES[event.target.value],status=dialog.querySelector('[name="status"]');
   status.innerHTML=options(next.states,next.states.includes(status.value)?status.value:next.states[0]);
   dialog.querySelector('.school-course-budget-fields').innerHTML=next.fees.map(f=>amountField('budget_'+f,'Monto · '+FEES[f],amounts[f])).join('');
  };
 });
}
function addPayment(sid,cid,fee){
 const c=courseById(studentById(data(),sid),cid);
 modal('Registrar abono · '+FEES[fee],dateField('date','Fecha del abono',today(),true)+amountField('amount','Monto del abono (USD)')+'<label>Origen<select name="source">'+options(SOURCES,'Propio')+'</select></label>'+input('reference','Recibo / referencia')+'<label class="school-full">Observación<textarea name="note" maxlength="2000"></textarea></label>',async f=>{
  errorDate(f,[['date',true]]);const amount=cents(f.amount);if(!amount)throw Error('El abono debe ser mayor que cero.');
  if(!SOURCES.includes(f.source)||!COURSES[c.type].fees.includes(fee))throw Error('Revisa el origen y concepto.');
  await change(school=>{const target=studentById(school,sid);courseById(target,cid).payments.push({id:uid(),fee,date:isoFecha(f.date),cents:amount,source:f.source,reference:f.reference.trim(),note:f.note.trim(),createdAt:new Date().toISOString()});if(target.stage==='Interesado'){target.stage='Matriculado';target.enrolledDate=isoFecha(f.date);target.history ||= [];target.history.push({at:new Date().toISOString(),action:'Matrícula por primer abono de curso'});}});
 });
}
function logFlight(sid,cid,kind='vuelo'){
 const school=data(),student=studentById(school,sid),course=courseById(student,cid),sim=kind==='simulador';
 const aircraft='<label>Aeronave<select name="aircraft" required><option value="">Seleccionar…</option>'+fleet.map(a=>'<option value="'+esc(a.reg)+'">'+esc(a.reg)+' — '+esc(a.model)+'</option>').join('')+'<option value="Otra / RPA">Otra / RPA</option></select></label>';
 modal(sim?'Registrar horas de simulador':'Registrar horas de vuelo',dateField('date','Fecha de la sesión',today(),true)+(sim?input('equipment','Simulador / equipo','','text','required'):aircraft)+input('hours','Horas realizadas','', 'number','min="0.01" max="99999.99" step="0.01" required')+amountField('rate','Tarifa por hora (USD)')+'<p class="school-full school-muted" id="school-flight-estimate">Selecciona aeronave e ingresa las horas para calcular el cargo.</p>'+input('instructor','Instructor / referencia')+'<label class="school-full">Observación<textarea name="note" maxlength="2000"></textarea></label>',async f=>{
  errorDate(f,[['date',true]]);const hours100=cents(f.hours),rate=cents(f.rate);if(!hours100||rate===null)throw Error('Revisa las horas y la tarifa.');
  if(!sim&&!f.aircraft)throw Error('Selecciona una aeronave.');if(rate===0&&!f.note.trim())throw Error('Explica en la observación por qué la sesión no tiene cargo.');
  const costCents=Math.round(hours100*rate/100);if(!Number.isSafeInteger(costCents))throw Error('El importe excede el rango permitido.');
  const latest=courseById(studentById(data(),sid),cid),balance=paymentTotal(latest,kind)-flightTotal(latest,kind);
  if(costCents>balance&&!window.confirm('El cargo es '+money(costCents)+' y el saldo disponible es '+money(balance)+'. ¿Registrar la sesión y dejar el saldo negativo?'))return;
  await change(s=>courseById(studentById(s,sid),cid).flights.push({id:uid(),fee:kind,date:isoFecha(f.date),aircraft:sim?'Simulador':f.aircraft,equipment:sim?f.equipment.trim():'',hours100,rateCents:rate,costCents,instructor:f.instructor.trim(),note:f.note.trim(),createdAt:new Date().toISOString()}));
 },dialog=>{
  const calc=()=>{const h=cents(dialog.querySelector('[name="hours"]').value)||0,r=cents(dialog.querySelector('[name="rate"]').value)||0;dialog.querySelector('#school-flight-estimate').textContent='Cargo: '+money(Math.round(h*r/100))+' · Saldo actual: '+money(paymentTotal(course,kind)-flightTotal(course,kind));};
  dialog.querySelector('[name="hours"]').addEventListener('input',calc);dialog.querySelector('[name="rate"]').addEventListener('input',calc);
  const ac=dialog.querySelector('[name="aircraft"]');if(ac)ac.onchange=()=>{const rate=school.rates[ac.value]?.cents;dialog.querySelector('[name="rate"]').value=rate==null?'':numeric(rate);calc();};calc();
 });
}
function voidEntry(sid,cid,kind,id){
 modal('Anular registro','<p class="school-full school-muted">El original se conserva. La anulación recalcula el saldo y las horas.</p><label class="school-full">Motivo obligatorio<textarea name="reason" required maxlength="2000"></textarea></label>',async f=>{
  if(!f.reason.trim())throw Error('Ingresa el motivo de la anulación.');
  if(!window.confirm('¿Confirmas anular este registro?'))return;
  await change(school=>{const c=courseById(studentById(school,sid),cid),entry=list(c[kind]).find(e=>e.id===id);if(!entry||entry.voidedAt)throw Error('Este registro ya no está activo.');entry.voidedAt=new Date().toISOString();entry.voidReason=f.reason.trim();});
 });
}
function editRate(reg){
 const current=data().rates[reg];
 modal('Tarifa por hora · '+reg,amountField('rate','Precio de la hora de vuelo (USD)',current?.cents)+'<p class="school-full school-muted">Se usará en nuevos registros. Las sesiones anteriores conservan la tarifa cobrada.</p>',async f=>{
  const rate=cents(f.rate);if(rate===null)throw Error('Revisa la tarifa.');
  await change(school=>{const old=school.rates[reg];school.rates[reg]={cents:rate,updatedAt:new Date().toISOString(),history:[...list(old?.history),...(old?[{cents:old.cents,updatedAt:old.updatedAt}]:[])]};});
 });
}
function editIntake(id){
 const school=data(),i=id?school.intakes.find(i=>i.id===id):{type:'privado',startDate:''};if(!i)return;
 modal(id?'Editar próxima fecha de curso':'Agregar próxima fecha de curso','<label>Curso<select name="type">'+courseOptions(i.type)+'</select></label>'+dateField('startDate','Inicio del curso',i.startDate,true),async f=>{
  errorDate(f,[['startDate',true]]);if(!COURSES[f.type])throw Error('Selecciona un curso.');
  await change(s=>{const entry={id:id||uid(),type:f.type,startDate:isoFecha(f.startDate)};if(id)Object.assign(s.intakes.find(i=>i.id===id),entry);else s.intakes.push(entry);});
 });
}
function editBrochure(){modal('Brochure de la carrera',input('url','Enlace público al brochure (PDF)',data().brochureUrl||'','url','placeholder="https://…"')+'<p class="school-full school-muted">Este enlace se incluirá en el correo. El envío automático todavía requiere conectar un servicio de correo.</p>',async f=>{
 let value=f.url.trim();if(value){let u;try{u=new URL(value);}catch{throw Error('Usa un enlace HTTPS válido.');}if(u.protocol!=='https:')throw Error('Usa un enlace HTTPS.');}
 await change(s=>{s.brochureUrl=value;});});}
function showEmail(sid,intakeId){
 const school=data(),student=studentById(school,sid),intake=school.intakes.find(i=>i.id===intakeId);if(!intake||student.stage!=='Interesado')return;
 const subject='Próximo curso de '+COURSES[intake.type].name+' · HP Flight School';
 const body='Hola '+student.name+',\n\nNuestro próximo curso de '+COURSES[intake.type].name+' inicia el '+fechaVista(intake.startDate)+'.\n\n'+(school.brochureUrl?'Conoce la carrera de aviación: '+school.brochureUrl:'[Pendiente: adjuntar el brochure de la carrera]')+'\n\nContáctanos para conocer los pasos de matrícula.\n\nHP Flight School';
 const dialog=document.createElement('dialog');dialog.className='record-dialog school-dialog';
 dialog.innerHTML='<h3>Correo preparado · sin enviar</h3><p class="school-muted">Destinatario: '+esc(student.email||'Falta correo')+'</p><label>Asunto<input class="school-preview-input" readonly value="'+esc(subject)+'"></label><textarea class="school-email-preview" readonly>'+esc(body)+'</textarea><p class="school-muted">El sistema no ha enviado este correo. Al abrirlo, podrás revisarlo y enviarlo desde tu aplicación de correo.</p><div class="record-actions">'+(student.email?'<a class="record-btn" href="mailto:'+encodeURIComponent(student.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)+'">Abrir en mi correo</a>':'')+'<button class="record-btn" data-close>Cerrar</button></div>';
 document.body.appendChild(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
function button(label,action,attrs=''){return '<button type="button" class="record-btn" data-action="'+action+'" '+attrs+'>'+label+'</button>';}
function courseHtml(student,c){
 const spec=COURSES[c.type],sum=courseSummary(c),sid='data-student="'+esc(student.id)+'" data-course="'+esc(c.id)+'"';
 return '<section class="card school-course"><div class="school-row"><div><h3>'+spec.name+'</h3><span class="school-tag">'+esc(c.status)+'</span></div>'+'<div class="school-actions">'+button('Modificar curso','edit-course',sid)+button('Eliminar','delete-course',sid)+'</div>'+'</div><div class="school-course-dates">Inicio: '+esc(fechaVista(c.startDate)||'Pendiente')+' · Fin: '+esc(fechaVista(c.endDate)||'Pendiente')+(c.licenseDate?'<br>Licencia / habilitación: '+esc(fechaVista(c.licenseDate))+' · '+esc(c.licenseNumber||'Sin número'):'')+'</div>'+
  spec.fees.map(fee=>{const total=Number(c.budgets?.[fee]||0),paid=paymentTotal(c,fee),pct=total>0?Math.min(100,Math.round(paid/total*100)):0,complete=total>0&&paid>=total;
   return '<div class="school-fee"><div class="school-row"><strong>'+FEES[fee]+'</strong>'+button('+ Abono','payment',sid+' data-fee="'+fee+'"')+'</div><div class="school-fee-figures"><span>Monto: '+money(total)+'</span><span>Abonado: '+money(paid)+'</span><span>'+(!total?'Monto por definir':paid>total?'Crédito: '+money(paid-total):'Pendiente: '+money(total-paid))+'</span></div><div class="school-progress-row"><div class="school-progress" role="progressbar" aria-label="Pagos de '+FEES[fee]+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div><b class="school-paid">'+(complete?'✓':pct+'%')+'</b></div></div>';
  }).join('')+'<div class="school-balances"><div><small>Saldo disponible · vuelos</small><b class="'+(sum.flightBalance<0?'school-negative':'')+'">'+money(sum.flightBalance)+'</b><small>'+numeric(hoursTotal(c,'vuelo'))+' h realizadas · cargos '+money(flightTotal(c,'vuelo'))+'</small></div>'+(spec.fees.includes('simulador')?'<div><small>Saldo disponible · simulador</small><b class="'+(sum.simBalance<0?'school-negative':'')+'">'+money(sum.simBalance)+'</b><small>'+numeric(hoursTotal(c,'simulador'))+' h realizadas</small></div>':'')+'</div><div class="school-actions">'+button('+ Horas de vuelo','flight',sid)+(spec.fees.includes('simulador')?button('+ Simulador','simulator',sid):'')+'</div>'+historyHtml(student,c)+'</section>';
}
function historyHtml(student,c){
 const attrs='data-student="'+esc(student.id)+'" data-course="'+esc(c.id)+'"';
 const payments=list(c.payments).map(p=>({date:p.date,html:'<div class="school-ledger-entry'+(p.voidedAt?' school-void':'')+'"><div class="school-row"><b>'+esc(fechaVista(p.date))+' · Abono '+money(p.cents)+'</b>'+(!p.voidedAt?button('Anular','void',attrs+' data-kind="payments" data-entry="'+esc(p.id)+'"'):'<span>Anulado</span>')+'</div><span>'+FEES[p.fee]+' · '+esc(p.source)+' · '+esc(p.reference||'Sin referencia')+'</span><p>'+esc(p.note||'')+'</p>'+(p.voidedAt?'<p>Motivo de anulación: '+esc(p.voidReason)+'</p>':'')+'</div>'}));
 const flights=list(c.flights).map(f=>({date:f.date,html:'<div class="school-ledger-entry'+(f.voidedAt?' school-void':'')+'"><div class="school-row"><b>'+esc(fechaVista(f.date))+' · '+esc(f.aircraft)+' · '+numeric(f.hours100)+' h</b>'+(!f.voidedAt?button('Anular','void',attrs+' data-kind="flights" data-entry="'+esc(f.id)+'"'):'<span>Anulado</span>')+'</div><span>'+money(f.rateCents)+'/h · Cargo '+money(f.costCents)+' · '+esc(f.equipment||f.instructor||'')+'</span><p>'+esc(f.note||'')+'</p>'+(f.voidedAt?'<p>Motivo de anulación: '+esc(f.voidReason)+'</p>':'')+'</div>'}));
 const entries=[...payments,...flights].sort((a,b)=>b.date.localeCompare(a.date));
 return '<details class="school-ledger"><summary>Movimientos y estado de cuenta ('+entries.length+')</summary><p class="school-muted">Saldo de vuelo = abonos de vuelo − cargos por sesiones. El monto del curso es el presupuesto; no se descuenta otra vez del saldo.</p>'+entries.map(e=>e.html).join('')+(entries.length?'':'<p>Sin movimientos.</p>')+'</details>';
}
function deletedCoursesHtml(s){
 if(!list(s.deletedCourses).length)return '';
 return '<details class="card school-deleted-courses"><summary>Cursos eliminados ('+s.deletedCourses.length+')</summary>'+s.deletedCourses.map(c=>'<section class="school-ledger-entry"><h4>'+esc(COURSES[c.type]?.name||c.type)+'</h4><p class="school-muted">Conservado solo como historial; no forma parte de los saldos activos.</p>'+studentInfoItem('Estado al eliminar',c.status)+studentInfoItem('Abonos registrados',money(paymentTotal(c)))+studentInfoItem('Horas registradas',numeric(hoursTotal(c))+' h')+list(c.payments).map(p=>studentInfoItem('Abono '+fechaVista(p.date),FEES[p.fee]+' · '+money(p.cents)+' · '+p.source+(p.voidedAt?' · Anulado':'')+' · '+(p.note||''))).join('')+list(c.flights).map(f=>studentInfoItem('Sesión '+fechaVista(f.date),f.aircraft+' · '+numeric(f.hours100)+' h · '+money(f.costCents)+(f.voidedAt?' · Anulada':''))).join('')+'</section>').join('')+'</details>';
}
function profileHtml(s){
 const courses=list(s.courses),totals=courses.map(courseSummary),sum=key=>totals.reduce((n,t)=>n+t[key],0),licenses=courses.filter(c=>c.licenseDate&&c.status===COURSES[c.type].states.at(-1));
 return '<div class="school-profile"><div class="card"><div class="school-row"><div><h2>'+esc(s.name)+'</h2><span class="school-tag">'+esc(s.stage)+'</span></div>'+button('Editar expediente','edit-student','data-student="'+esc(s.id)+'"')+'</div><div class="school-profile-info">'+studentPersonalHtml(s)+'</div><div class="school-totals"><div><small>Presupuesto de cursos</small><b>'+money(sum('budget'))+'</b></div><div><small>Abonos recibidos</small><b>'+money(sum('paid'))+'</b></div><div><small>Saldo de presupuestos por pagar</small><b>'+money(sum('due'))+'</b></div><div><small>Saldo disponible · simulador</small><b>'+money(sum('simBalance'))+'</b></div><div><small>Saldo disponible · vuelos</small><b>'+money(sum('flightBalance'))+'</b></div><div><small>Horas voladas</small><b>'+numeric(courses.reduce((n,c)=>n+hoursTotal(c,'vuelo'),0))+' h</b></div></div><p class="school-muted">Licencias / habilitaciones obtenidas: '+(licenses.length?licenses.map(c=>esc(COURSES[c.type].name)+' ('+esc(fechaVista(c.licenseDate))+')').join(' · '):'Ninguna registrada')+'</p></div><div class="school-row"><h3>Cursos y pagos</h3>'+button('+ Agregar curso','add-course','data-student="'+esc(s.id)+'"')+'</div><div class="school-course-grid">'+courses.map(c=>courseHtml(s,c)).join('')+'</div>'+deletedCoursesHtml(s)+'</div>';
}
const panel=document.createElement('div');panel.id='panel-estudiantes';panel.className='aircraft-panel';contentEl.appendChild(panel);
const tab=document.createElement('div');tab.className='aircraft-tab';tab.innerHTML='<div class="tab-reg" style="font-size:10px">🎓 ESTUDIANTES</div>';itinerariosTab.insertAdjacentElement('afterend',tab);
tab.addEventListener('click',()=>{document.querySelectorAll('.aircraft-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.aircraft-panel').forEach(p=>p.classList.remove('active'));tab.classList.add('active');panel.classList.add('active');render();});
function render(){
 const school=data();
 panel.innerHTML='<div class="school-header"><div><div class="aircraft-reg" style="font-size:20px">ESTUDIANTES</div><p class="school-muted">HP Flight School · Seguimiento académico y financiero</p></div>'+button('+ Nuevo estudiante','new-student')+'</div><div class="school-nav">'+[['students','Expedientes'],['rates','Tarifas de aeronaves'],['intakes','Próximos cursos y correos']].map(([key,label])=>'<button class="record-btn" data-action="view" data-view="'+key+'" aria-pressed="'+(view===key)+'">'+label+'</button>').join('')+'</div><div id="school-content"></div>';
 const body=panel.querySelector('#school-content');
 if(view==='rates'){body.innerHTML='<div class="card"><h3>Tarifas por aeronave</h3><p class="school-muted">Precios por hora en USD. También disponibles en el encabezado de cada aeronave.</p><div class="school-rate-grid">'+fleet.map(a=>'<div class="school-rate"><b>'+esc(a.reg)+'</b><span>'+esc(a.model)+'</span><strong>'+ (school.rates[a.reg]?money(school.rates[a.reg].cents)+'/h':'Sin tarifa')+'</strong>'+button('Editar tarifa','rate','data-reg="'+esc(a.reg)+'"')+'</div>').join('')+'</div></div>';return;}
 if(view==='intakes'){renderIntakes(body,school);return;}
 body.innerHTML='<div class="school-workspace"><aside class="card school-directory"><label>Buscar estudiante<input id="school-search" type="search" value="'+esc(query)+'" placeholder="Nombre, cédula, correo o celular"></label><label>Etapa<select id="school-stage"><option value="">Todas</option>'+options(STAGES,stageFilter)+'</select></label><div id="school-student-list"></div></aside><div id="school-student-profile"></div></div>';
 body.querySelector('#school-search').oninput=e=>{query=e.target.value;renderDirectory();};body.querySelector('#school-stage').onchange=e=>{stageFilter=e.target.value;renderDirectory();};renderDirectory();
 const s=school.students.find(s=>s.id===selected);body.querySelector('#school-student-profile').innerHTML=s?profileHtml(s):'<div class="card school-empty"><h3>Expediente del estudiante</h3><p>Selecciona un estudiante o registra al primer interesado.</p><p>Cursos, pagos, horas y licencias se guardan en su expediente.</p></div>';
}
function renderDirectory(){
 const element=panel.querySelector('#school-student-list');if(!element)return;
 const students=data().students.filter(s=>(!stageFilter||s.stage===stageFilter)&&[s.name,s.identity,s.email,s.phone].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'es'));
 element.innerHTML='<p class="school-muted">'+students.length+' estudiantes</p>'+students.map(s=>'<button class="school-student-button" data-action="select" data-student="'+esc(s.id)+'" aria-pressed="'+(selected===s.id)+'"><b>'+esc(s.name)+'</b><span>'+esc(s.stage)+' · '+esc(s.funding)+'</span></button>').join('');
}
function renderIntakes(body,school){
 const rows=noticeRows(school);
 body.innerHTML='<div class="card"><div class="school-row"><h3>Próximas fechas de cursos</h3>'+button('+ Fecha de curso','intake')+'</div><p class="school-muted">Los avisos se preparan dos meses calendario antes del inicio para interesados sin matrícula. Si el interesado ingresa después, el aviso aparece pendiente inmediatamente.</p><div class="school-intakes">'+school.intakes.slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(i=>'<div class="school-row school-ledger-entry"><span>'+esc(COURSES[i.type]?.name||i.type)+' · '+esc(fechaVista(i.startDate))+'<small class="school-muted"> Aviso: '+esc(fechaVista(twoMonthsBefore(i.startDate)))+'</small></span>'+button('Editar','intake','data-intake="'+esc(i.id)+'"')+'</div>').join('')+'</div></div><div class="card school-mail"><div class="school-row"><h3>Correos a interesados</h3>'+button('Configurar brochure','brochure')+'</div><p class="school-mail-status">Envío automático pendiente de conectar. No se envían correos desde este panel.</p><p class="school-muted">'+(school.brochureUrl?'Brochure configurado.':'Falta agregar el enlace al brochure.')+' Puedes preparar un correo y revisarlo en tu aplicación de correo.</p>'+rows.map(({student,intake,scheduled,due})=>'<div class="school-row school-ledger-entry"><div><b>'+esc(student.name)+'</b><p>'+esc(COURSES[intake.type].name)+' · Inicio '+esc(fechaVista(intake.startDate))+'</p><small>'+esc(fechaVista(scheduled))+' · '+(due?'Pendiente de envío':'Aviso previsto')+(student.email?'':' · Falta correo')+'</small></div>'+button('Ver correo','email','data-student="'+esc(student.id)+'" data-intake="'+esc(intake.id)+'"')+'</div>').join('')+(rows.length?'':'<p class="school-muted">No hay avisos: registra interesados, sus cursos de interés y las próximas fechas.</p>')+'</div>';
}
panel.addEventListener('click',event=>{
 const b=event.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,s=b.dataset.student,c=b.dataset.course;
 const handlers={
  'new-student':()=>editStudent(), 'edit-student':()=>editStudent(s),select:()=>{selected=s;render();},view:()=>{view=b.dataset.view;render();},
  'add-course':()=>addCourse(s),'edit-course':()=>editCourse(s,c),'delete-course':()=>deleteCourse(s,c),payment:()=>addPayment(s,c,b.dataset.fee),flight:()=>logFlight(s,c),simulator:()=>logFlight(s,c,'simulador'),
  void:()=>voidEntry(s,c,b.dataset.kind,b.dataset.entry),rate:()=>editRate(b.dataset.reg),intake:()=>editIntake(b.dataset.intake),brochure:editBrochure,email:()=>showEmail(s,b.dataset.intake)
 };if(handlers[a])try{Promise.resolve(handlers[a]()).catch(e=>alert(e.message));}catch(e){alert(e.message);}
});
function decorateAircraftPanel(acPanel,reg){
 const header=acPanel.querySelector('.aircraft-toolbar')||acPanel.querySelector('.aircraft-detail-header');if(!header)return;
 let button=header.querySelector('.school-aircraft-rate');if(!button){button=document.createElement('button');button.className='record-btn school-aircraft-rate';button.type='button';button.onclick=()=>editRate(reg);header.appendChild(button);}
 const rate=data().rates[reg];button.textContent='Tarifa: '+(rate?money(rate.cents)+'/h':'sin definir');
}
function decorateRates(){fleet.forEach((ac,idx)=>{const p=document.getElementById('panel-'+idx);if(p)decorateAircraftPanel(p,ac.reg);const t=document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="'+idx+'"]');if(t){let label=t.querySelector('.school-tab-rate');if(!label){label=document.createElement('div');label.className='school-tab-rate';t.appendChild(label);}const rate=data().rates[ac.reg];label.textContent=rate?money(rate.cents)+'/h':'Tarifa sin definir';}});}
window.School={decorateAircraftPanel,hasDraft:()=>!!activeDialog?.dataset.dirty};
const oldDraft=window.hasDraftChanges;window.hasDraftChanges=()=>!!oldDraft?.()||window.School.hasDraft();
window.addEventListener('beforeunload',event=>{if(busy||window.School.hasDraft()){event.preventDefault();event.returnValue='';}});
render();decorateRates();window.STUDENTS_READY=true;
// Pure functions exposed for deterministic local verification; no student data is exported.
window.School.math={cents,courseSummary,paymentTotal,flightTotal,hoursTotal,twoMonthsBefore,noticeRows};
})();


