/* Student administration. All mutations commit through the existing authenticated cloud writer. */
(function(){
'use strict';
const COURSES={
 privado:{name:'Piloto privado',fees:['matricula','tutoria','material','teoria','vuelo'],states:['Por iniciar','Curso Teórico','Vuelo solo','Licencia Piloto privado']},
 comercial:{name:'Piloto comercial',fees:['matricula','teoria','tutoria','vuelo'],states:['Por iniciar','Curso Teórico','XC','Licencia Piloto Comercial']},
 ifr:{name:'IFR',fees:['matricula','teoria','tutoria','simulador','vuelo'],states:['Por iniciar','Curso Teórico','Simulador','Habilitación IFR']},
 multimotor:{name:'Multimotor',fees:['matricula','teoria','tutoria','vuelo'],states:['Por iniciar','Curso Teórico','Habilitación Multi-Motor']},
 rpa:{name:'RPA (Drone)',fees:['teoria','vuelo'],states:['Por iniciar','Curso Teórico','Horas de vuelo','Licencia de RPA']},
 instructor:{name:'Instructor de vuelo',fees:['matricula','teoria','tutoria','vuelo'],states:['Por iniciar','Curso Teórico','Horas de vuelo','Licencia de Instructor de vuelo']}
};
function schoolDisplayText(value){
 const labels={'Multi-Motor':'Multimotor','Licencia Piloto privado':'Licencia de piloto privado','Licencia Piloto Comercial':'Licencia de piloto comercial','Habilitación IFR':'Habilitación IFR','Habilitación Multi-Motor':'Habilitación multimotor','Licencia de Instructor de vuelo':'Licencia de instructor de vuelo','Curso Teórico':'Curso teórico'};
 return labels[value]||value;
}
const FEES={tutoria:'Tutoría',material:'Material de estudio',matricula:'Matrícula',teoria:'Curso teórico',vuelo:'Horas de vuelo',simulador:'Horas de simulador'};
const SOURCES=['Propio','IFARHU','Beca'];
const STAGES=['Interesado','Matriculado','En formación','Culminado','Retirado'];
const FUNDING=['Propio','IFARHU en trámite','IFARHU aprobado','Beca','Mixto'];
const esc=escapeRecord,uid=()=>crypto.randomUUID(),today=()=>panamaISO();
const money=c=>new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format((Number(c)||0)/100);
const list=x=>Array.isArray(x)?x:[];
let selected=null,view='students',query='',stageFilter='',busy=false,activeDialog=null;
function manualStage(stage){return ['Culminado','Carrera culminada','Retirado'].includes(stage);}
function automaticStage(student,stage,enrolledDate,explicit=false){
 if(window.ROLE_VIEW){if(!explicit||manualStage(stage)||stage==='En formación')return stage||'';return enrolledDate&&validDate(enrolledDate)?'Matriculado':stage||'Interesado';}
 if(manualStage(stage))return stage==='Carrera culminada'?'Culminado':stage;
 if(list(student.courses).some(c=>paymentTotal(c)>0)||active(student.extraPayments).some(p=>p.cents>0))return 'En formación';
 if(enrolledDate&&validDate(enrolledDate))return 'Matriculado';
 return 'Interesado';
}
function data(){const school={version:1,students:[],rates:{},intakes:[],brochureUrl:'',...previewData.school};return {...school,rates:{Simulador:{cents:9000},...school.rates},students:list(school.students).map(s=>({...s,stage:automaticStage(s,s.stage,s.enrolledDate)}))};}
function completionOptions(student){
 const courses=list(student.courses).map(c=>({courseId:c.id,type:c.type,name:COURSES[c.type]?.name||c.type}));
 for(const c of list(student.completedCourses))if(!courses.some(x=>x.courseId===c.courseId))courses.push(c);
 return courses;
}
function bindStudentStage(dialog,student){
 const stage=dialog.querySelector('[name="stage"]'),enrolled=dialog.querySelector('[name="enrolledDate"]');
 const retirement=dialog.querySelector('[data-retirement]'),completion=dialog.querySelector('[data-completion]');
 const sync=()=>{
  stage.value=automaticStage(student,stage.value,enrolled.value,true);
  retirement.hidden=stage.value!=='Retirado';completion.hidden=stage.value!=='Culminado';
  dialog.querySelector('[name="withdrawalReason"]').required=!retirement.hidden;
  const completedDate=dialog.querySelector('[name="completedDate"]');completedDate.required=!completion.hidden;completedDate.disabled=completion.hidden;if(!completion.hidden&&!completedDate.value)completedDate.value=fechaVista(today());
 };
 enrolled.addEventListener('input',sync);stage.addEventListener('change',sync);sync();
}
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
function courseFees(c){return COURSES[c.type].fees.filter(f=>f!=='tutoria'||c.tutoriaEnabled||Number(c.budgets?.tutoria)>0||list(c.payments).some(p=>p.fee==='tutoria'));}
function courseAmount(c,fee){return ['vuelo','simulador'].includes(fee)?paymentTotal(c,fee):Number(c.budgets?.[fee]||0);}
function studentBudgetFields(c){return courseFees(c).map(f=>['vuelo','simulador'].includes(f)?input('budget_'+f,FEES[f]+' · total de abonos (USD)',numeric(courseAmount(c,f)),'number','readonly'):amountField('budget_'+f,FEES[f]+' (USD)',courseAmount(c,f))).join('');}
function readStudentBudgets(f,c){const result={};for(const fee of courseFees(c)){const value=['vuelo','simulador'].includes(fee)?courseAmount(c,fee):cents(f['budget_'+fee]);if(value===null)throw Error('Revisa los montos.');result[fee]=value;}return result;}
function addTutoring(sid,cid){
 const c=courseById(studentById(data(),sid),cid);
 modal('Agregar tutoría',amountField('amount','Monto de tutoría (USD)',courseRates(c.type).tutoria||0),async f=>{const amount=cents(f.amount);if(amount===null)throw Error('Revisa el monto.');await change(school=>{const target=courseById(studentById(school,sid),cid);target.tutoriaEnabled=true;target.budgets={...target.budgets,tutoria:amount};});});
}
function courseSummary(course){
 const budget=courseFees(course).reduce((sum,f)=>sum+courseAmount(course,f),0),paid=paymentTotal(course);
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
 // data() derives stages for display. Never persist those derived values on unrelated students.
 try{const next=structuredClone(previewData),school=structuredClone({...data(),students:list(previewData.school?.students)});mutator(school);next.school=school;
  if(!await commitPreview(next))throw Error('No se pudo guardar. Se conserva la información anterior.');
  render();decorateRates();renderPayments();window.Registro?.refresh();
 }finally{busy=false;}
}
function options(values,value){return values.map(v=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(schoolDisplayText(v))+'</option>').join('');}
function courseOptions(value){return Object.entries(COURSES).map(([key,c])=>'<option value="'+key+'"'+(key===value?' selected':'')+'>'+c.name+'</option>').join('');}
const COUNTRY_CODES='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countryNames=new Intl.DisplayNames(['es'],{type:'region'});
const COUNTRIES=COUNTRY_CODES.map(code=>({code,name:countryNames.of(code)})).sort((a,b)=>a.code==='PA'?-1:b.code==='PA'?1:a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
function countrySearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();}
function matchingCountries(value){return COUNTRIES.filter(c=>countrySearch(c.name).includes(countrySearch(value)));}
function nationalityField(value){return '<label class="school-country-field">Nacionalidad<div class="school-country-control"><input name="nationality" value="'+esc(value||'')+'" maxlength="100" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="school-country-options" autocomplete="off" placeholder="Escribe o selecciona un país"><button type="button" class="school-country-toggle" aria-label="Mostrar todos los países">▾</button></div><div id="school-country-options" class="school-country-options" role="listbox" aria-label="Países" hidden></div></label>';}
function bindNationality(dialog){
 const input=dialog.querySelector('[name="nationality"]'),box=dialog.querySelector('#school-country-options'),toggle=dialog.querySelector('.school-country-toggle');let choices=[],active=-1;
 const close=()=>{box.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
 const show=(all=false)=>{choices=all?COUNTRIES:matchingCountries(input.value);active=-1;input.removeAttribute('aria-activedescendant');box.innerHTML=choices.length?choices.map((c,i)=>'<div id="country-option-'+i+'" role="option" aria-selected="false" data-country-index="'+i+'">'+esc(c.name)+'</div>').join(''):'<div>No se encontraron países.</div>';box.hidden=false;input.setAttribute('aria-expanded','true');};
 const choose=i=>{if(!choices[i])return;input.value=choices[i].name;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();};
 input.addEventListener('input',()=>show());input.addEventListener('click',()=>show(true));toggle.onpointerdown=e=>e.preventDefault();toggle.onclick=e=>{e.preventDefault();if(box.hidden){input.focus();show(true);}else close();};
 box.addEventListener('pointerdown',e=>e.preventDefault());box.addEventListener('click',e=>{const option=e.target.closest('[data-country-index]');if(option){e.preventDefault();choose(Number(option.dataset.countryIndex));}});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!box.hidden){e.preventDefault();e.stopPropagation();close();return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(box.hidden)show(true);if(!choices.length)return;active=Math.max(0,Math.min(choices.length-1,active+(e.key==='ArrowDown'?1:-1)));box.querySelectorAll('[role="option"]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));const option=box.querySelector('#country-option-'+active);input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
  if(e.key==='Enter'&&!box.hidden){e.preventDefault();if(active>=0)choose(active);else if(choices.length===1)choose(0);}
  if(e.key==='Tab')close();
 });
 input.addEventListener('blur',()=>{const matches=matchingCountries(input.value);if(matches.length===1&&countrySearch(matches[0].name)===countrySearch(input.value))input.value=matches[0].name;close();});
}

function dateField(name,label,value='',required=false){return '<label>'+label+'<input name="'+name+'" placeholder="DD/MM/AAAA" value="'+esc(fechaVista(value))+'"'+(required?' required':' data-preserve-empty')+'></label>';}
function input(name,label,value='',type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';}
function amountField(name,label,value=0){return input(name,label,numeric(value),'number','min="0" max="999999999.99" step="0.01" required');}
function errorDate(form,names){for(const [key,required]of names)if(!validDate(form[key],required))throw Error('Revisa la fecha: usa DD/MM/AAAA.');}
function modal(title,body,onSave,afterOpen){
 if(activeDialog)return;
 const dialog=document.createElement('dialog');dialog.className='record-dialog school-dialog';
 dialog.innerHTML='<form><h3>'+esc(title)+'</h3><div class="school-form">'+body+'</div><p class="record-error" role="alert"></p><div class="record-actions"><button type="button" class="record-btn" data-close>Cancelar</button><button type="submit" class="save-btn">Guardar</button></div></form>';
 document.body.appendChild(dialog);activeDialog=dialog;let dirty=false,saving=false,draft=null;
 dialog.addEventListener('input',()=>{dirty=true;dialog.dataset.dirty='1';});dialog.addEventListener('change',()=>{dirty=true;dialog.dataset.dirty='1';});
 function canClose(){return !saving&&(!dirty||window.confirm('¿Descartar los cambios de este formulario?'));}
 dialog.querySelector('[data-close]').onclick=()=>{if(canClose())dialog.close();};
 dialog.addEventListener('cancel',e=>{if(!canClose())e.preventDefault();});
 dialog.addEventListener('close',()=>{draft?.clear();dialog.remove();activeDialog=null;});
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(saving)return;saving=true;dialog.querySelector('[type="submit"]').disabled=true;
  try{const fields=Object.fromEntries(new FormData(event.target));await onSave(fields,event.target);dirty=false;dialog.close();}
  catch(e){dialog.querySelector('.record-error').textContent=e.message||'No se pudo completar la operación.';}
  finally{saving=false;if(dialog.isConnected)dialog.querySelector('[type="submit"]').disabled=false;}
 };
 dialog.showModal();setupDates();if(afterOpen)afterOpen(dialog);draft=dialog.paymentDraft||null;
 const personal=['Registrar personal','Editar expediente de personal','Editar estudiante','Nuevo estudiante','Agregar cliente','Crear piloto','Editar expediente de piloto','Licencias y habilitaciones','Certificado médico'];
 if(personal.includes(title)){
  const page=document.querySelector('.aircraft-panel.active')?.id||'';
  const context=page==='panel-empresa'?window.personnelDraftContext?.():page.includes('piloto')?window.pilotDraftContext?.():selected||'new';
  draft=window.DraftRecovery?.form('form:'+page+':'+context+':'+title,dialog.querySelector('form'),title);
 }

}
const STUDENT_CREDENTIALS=['Privado','Comercial','IFR','Multi-Motor','Instructor','RPA (Drone)'];
function studentCredentialsForm(s){return '<h4 class="school-form-section">Certificado médico</h4><label>Clase<select name="medicalClass"><option value="">Sin registrar</option>'+options(['Primera','Segunda','Tercera'],s.medicalClass||'')+'</select></label><label>Fecha de expiración · MM/AAAA<div style="display:flex;gap:6px"><input name="medicalExpiryMonth" placeholder="MM/AAAA" inputmode="numeric" pattern="(0[1-9]|1[0-2])/[0-9]{4}" value="'+esc(s.medicalExpiry?String(s.medicalExpiry).slice(5,7)+'/'+String(s.medicalExpiry).slice(0,4):'')+'"><button type="button" class="record-btn" data-student-month-toggle aria-label="Abrir calendario" aria-expanded="false">▦</button></div><div data-student-month-panel hidden style="padding:12px;border:1px solid #a9c6e2;border-radius:6px"><div class="school-row"><button type="button" data-student-month-prev aria-label="Año anterior">‹</button><b data-student-month-year></b><button type="button" data-student-month-next aria-label="Año siguiente">›</button></div><div data-student-month-options style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div></div></label><fieldset class="school-full"><legend>Licencias y habilitaciones obtenidas</legend><div class="school-checks">'+STUDENT_CREDENTIALS.map(v=>'<label class="school-check"><input type="checkbox" name="obtainedCredential" value="'+esc(v)+'" '+(list(s.obtainedCredentials).includes(v)?'checked':'')+'>'+esc(schoolDisplayText(v))+'</label>').join('')+'</div></fieldset>';}
function bindStudentMedical(dialog){const input=dialog.querySelector('[name=medicalExpiryMonth]'),panel=dialog.querySelector('[data-student-month-panel]'),toggle=dialog.querySelector('[data-student-month-toggle]');let year=Number(input.value.slice(3))||Number(today().slice(0,4));const draw=()=>{dialog.querySelector('[data-student-month-year]').textContent=year;dialog.querySelector('[data-student-month-options]').innerHTML=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((v,i)=>'<button type="button" class="record-btn" data-student-month="'+(i+1)+'">'+v+'</button>').join('');};const open=()=>{panel.hidden=false;toggle.setAttribute('aria-expanded','true');draw();};input.onclick=open;toggle.onclick=()=>{panel.hidden?open():(panel.hidden=true,toggle.setAttribute('aria-expanded','false'));};dialog.querySelector('[data-student-month-prev]').onclick=()=>{year--;draw();};dialog.querySelector('[data-student-month-next]').onclick=()=>{year++;draw();};panel.onclick=e=>{const b=e.target.closest('[data-student-month]');if(b){input.value=String(b.dataset.studentMonth).padStart(2,'0')+'/'+year;panel.hidden=true;toggle.setAttribute('aria-expanded','false');input.dispatchEvent(new Event('change',{bubbles:true}));}};}
function studentPersonalValues(fields){
 const result={};
 for(const key of ['address','identity','nationality','previousSchool','residentialPhone','fatherName','motherName','emergencyName','emergencyPhone','referredBy'])result[key]=String(fields[key]||'').trim();
 result.birthDate=isoFecha(fields.birthDate||'');return result;
}
function studentInfoItem(label,value){
 return '<div class="school-info-item"><strong class="school-info-label">'+esc(label)+':</strong> <span class="school-info-value">'+esc(value??'')+'</span></div>';
}
const STUDENT_PRINT_EXCLUDED=new Set(['Etapa','Financiamiento','Cursos de interés','Culminación','Cursos culminados','Motivo del retiro','Certificado médico · clase','Certificado médico · expiración','Licencias y habilitaciones obtenidas','Observaciones','Quién lo recomienda']);
function studentPersonalHtml(s,printing=false){
 const values=[['Nombre completo',s.name],['Cédula o pasaporte',s.identity],['Fecha de nacimiento',fechaVista(s.birthDate||'')],['Edad (años)',personAge(s.birthDate)],['Peso (lb)',s.peso],['Estatura (m)',s.estatura?Number(s.estatura).toFixed(2):''],['Nacionalidad',s.nationality],['Dirección',s.address],['Celular',s.phone],['Teléfono residencial',s.residentialPhone],['Correo electrónico',s.email],['Contacto de emergencia',s.emergencyName],['Celular de emergencia',s.emergencyPhone],['Nombre del padre',s.fatherName],['Nombre de la madre',s.motherName],['Colegio de procedencia',s.previousSchool],['Ingreso al sistema',fechaVista(s.createdDate||'')],['Fecha de matrícula',fechaVista(s.enrolledDate||'')],['Etapa',s.stage],['Financiamiento',s.funding],['Cursos de interés',list(s.interests).map(k=>COURSES[k]?.name||k).join(', ')],['Culminación',fechaVista(s.completedDate||'')],['Cursos culminados',list(s.completedCourses).map(c=>COURSES[c.type]?.name||c.name).join(', ')],['Motivo del retiro',s.withdrawalReason],['Certificado médico · clase',s.medicalClass],['Certificado médico · expiración',s.medicalExpiry?String(s.medicalExpiry).slice(5,7)+'/'+String(s.medicalExpiry).slice(0,4):''],['Licencias y habilitaciones obtenidas',list(s.obtainedCredentials).map(schoolDisplayText).join(', ')],['Observaciones',s.notes],['Quién lo recomienda',s.referredBy]];
 const ordered=printing?values.filter(([label])=>label!=='Nombre completo'&&label!=='Ingreso al sistema'&&!STUDENT_PRINT_EXCLUDED.has(label)):values;
 return ordered.map(([label,value])=>studentInfoItem(label,value)).join('');
}
function editStudent(id){
 const s=id?studentById(data(),id):{name:'',createdDate:today(),stage:'Interesado',funding:'Propio',interests:[],courses:[]};
 const completedOptions=completionOptions(s);
 const completionChecks=completedOptions.map(c=>'<label class="school-check"><input type="checkbox" name="completedCourse" value="'+esc(c.courseId)+'"'+(list(s.completedCourses).some(x=>x.courseId===c.courseId)?' checked':'')+'>'+esc(c.name)+'</label>').join('');
 const interests=Object.entries(COURSES).map(([key,c])=>'<label class="school-check"><input type="checkbox" name="interest" value="'+key+'"'+(list(s.interests).includes(key)?' checked':'')+'>'+c.name+'</label>').join('');
 modal(id?'Editar estudiante':'Nuevo estudiante','<h4 class="school-form-section">Datos personales</h4>'+input('name','Nombre completo',s.name,'text','required maxlength="160"')+input('identity','Cédula o pasaporte',s.identity||'','text','maxlength="60"')+nationalityField(s.nationality)+dateField('birthDate','Fecha de nacimiento',s.birthDate)+input('age','Edad (años)',personAge(s.birthDate),'text','readonly')+input('peso','Peso (lb)',s.peso||'','number','min="0" step="0.1"')+input('estatura','Estatura (m)',s.estatura||'','number','min="0.01" step="0.01"')+input('address','Dirección',s.address||'','text','maxlength="500"')+input('previousSchool','Colegio de procedencia',s.previousSchool||'','text','maxlength="200"')+'<h4 class="school-form-section">Contacto</h4>'+input('residentialPhone','Teléfono residencial',s.residentialPhone||'','tel','maxlength="40"')+input('phone','Celular',s.phone||'','tel','maxlength="40"')+input('email','Correo electrónico',s.email||'','email','maxlength="180"')+'<h4 class="school-form-section">Familia y contacto de emergencia</h4>'+input('fatherName','Nombre del padre',s.fatherName||'','text','maxlength="160"')+input('motherName','Nombre de la madre',s.motherName||'','text','maxlength="160"')+input('emergencyName','Contacto de emergencia · nombre',s.emergencyName||'','text','maxlength="160"')+input('emergencyPhone','Contacto de emergencia · celular',s.emergencyPhone||'','tel','maxlength="40"')+'<h4 class="school-form-section">Registro académico</h4>'+dateField('createdDate','Ingreso al sistema',s.createdDate,true)+'<label>Etapa<select name="stage">'+options(STAGES,s.stage)+'</select></label><label>Financiamiento<select name="funding">'+options(FUNDING,s.funding)+'</select></label>'+dateField('enrolledDate','Fecha de matrícula',s.enrolledDate)+'<div class="school-full school-stage-panel" data-retirement hidden><label>Observación · motivo del retiro<textarea name="withdrawalReason" maxlength="4000">'+esc(s.withdrawalReason||'')+'</textarea></label></div><div class="school-full school-stage-panel" data-completion hidden>'+dateField('completedDate','Culminación',s.completedDate)+'<fieldset><legend>Cursos culminados</legend><div class="school-checks">'+(completionChecks||'<p>Agrega primero los cursos al expediente para seleccionar cuáles culminó.</p>')+'</div></fieldset></div>'+'<fieldset class="school-full"><legend>Cursos de interés</legend><div class="school-checks">'+interests+'</div></fieldset>'+studentCredentialsForm(s)+'<label class="school-full">Observaciones<textarea name="notes" maxlength="4000">'+esc(s.notes||'')+'</textarea></label>'+input('referredBy','Quién lo recomienda',s.referredBy||'','text','maxlength="200"'),async(f,form)=>{
  if(!STAGES.includes(f.stage))throw Error('Selecciona una etapa válida.');
  f.stage=automaticStage(s,f.stage,f.enrolledDate,true);
  errorDate(f,[['createdDate',true],['birthDate',false],['enrolledDate',false],['completedDate',f.stage==='Culminado']]);
  const withdrawalReason=String(f.withdrawalReason||'').trim();
  if(f.stage==='Retirado'&&!withdrawalReason)throw Error('Ingresa la razón del retiro.');
  const checked=new FormData(form).getAll('completedCourse');
  const completedCourses=completedOptions.filter(c=>checked.includes(c.courseId));
  if(f.stage==='Culminado'&&!completedCourses.length)throw Error('Selecciona los cursos que culminó el estudiante.');
  if(!f.name.trim())throw Error('Ingresa el nombre del estudiante.');
  if(f.birthDate&&dayNumber(f.birthDate)>dayNumber(today()))throw Error('La fecha de nacimiento no puede estar en el futuro.');
  const email=f.email.trim();const all=data().students;
  if(email&&all.some(x=>x.id!==id&&String(x.email||'').toLowerCase()===email.toLowerCase()))throw Error('Ya existe un estudiante con ese correo.');
  const medicalExpiry=PilotValidity.monthEnd(f.medicalExpiryMonth);if(f.medicalExpiryMonth&&!medicalExpiry)throw Error('Revisa la expiración del certificado médico: MM/AAAA.');if(f.medicalClass&&!['Primera','Segunda','Tercera'].includes(f.medicalClass))throw Error('Selecciona una clase válida.');
  const record={...studentPersonalValues(f),peso:String(f.peso||'').trim(),estatura:f.estatura?Number(f.estatura).toFixed(2):'',medicalClass:f.medicalClass||'',medicalExpiry,obtainedCredentials:new FormData(form).getAll('obtainedCredential').filter(v=>STUDENT_CREDENTIALS.includes(v)),name:f.name.trim(),createdDate:isoFecha(f.createdDate),phone:f.phone.trim(),email,stage:f.stage,funding:f.funding,withdrawalReason,completedCourses:f.stage==='Culminado'?completedCourses:list(s.completedCourses),enrolledDate:isoFecha(f.enrolledDate),completedDate:f.stage==='Culminado'?isoFecha(f.completedDate):s.completedDate||'',interests:new FormData(form).getAll('interest'),notes:f.notes.trim()};
  const newId=id||uid();await change(school=>{if(id){const target=studentById(school,id);target.history ||= [];target.history.push({at:new Date().toISOString(),action:'Expediente actualizado',before:{stage:target.stage,funding:target.funding,withdrawalReason:target.withdrawalReason||'',completedCourses:list(target.completedCourses)},after:{stage:record.stage,funding:record.funding,withdrawalReason:record.withdrawalReason,completedCourses:record.completedCourses}});Object.assign(target,record);}else school.students.push({...record,id:newId,courses:[],history:[{at:new Date().toISOString(),action:'Ingreso al sistema'}]});});selected=newId;render();
 },dialog=>{bindStudentStage(dialog,s);bindNationality(dialog);bindStudentMedical(dialog);const birth=dialog.querySelector('[name=birthDate]');const updateAge=()=>{dialog.querySelector('[name=age]').value=personAge(birth.value);};birth.addEventListener('input',updateAge);birth.addEventListener('change',updateAge);});
}
const DELETION_KEY_HASH='cdce6c2e722a4b1011d74c7db32f017e5638d0046672ff304f68793bb6b857a2';
const DEFAULT_COURSE_RATES={
 privado:{matricula:15000,tutoria:0,material:35000,teoria:175000,vuelo:913000},
 comercial:{matricula:47500,teoria:175000,tutoria:0,vuelo:1947000},
 ifr:{matricula:15000,teoria:175000,tutoria:0,simulador:190000,vuelo:473000},
 multimotor:{matricula:15000,teoria:25000,tutoria:0,vuelo:667000},
 rpa:{teoria:30000,vuelo:20000},
 instructor:{matricula:15000,teoria:175000,tutoria:80000,vuelo:253000}
};
function courseRates(type){return {...DEFAULT_COURSE_RATES[type],...data().courseRates?.[type]?.budgets};}
function readBudgets(fields,type){const result={};for(const fee of COURSES[type].fees){const value=cents(fields['budget_'+fee]);if(value===null)throw Error('Revisa los montos: usa números positivos o cero, con hasta dos decimales.');result[fee]=value;}return result;}
function budgetFields(type,values){return COURSES[type].fees.map(f=>amountField('budget_'+f,FEES[f]+' (USD)',values[f]||0)).join('');}
function editCourseRate(type){
 modal('Tarifa · '+COURSES[type].name,budgetFields(type,courseRates(type))+'<p class="school-full school-muted">Los cursos nuevos usan estas tarifas, excepto tutoría (opcional) y horas de vuelo/simulador (monto según abonos).</p>',async f=>{
  const budgets=readBudgets(f,type);await change(school=>{school.courseRates ||= {};const old=school.courseRates[type];school.courseRates[type]={budgets,updatedAt:new Date().toISOString(),history:[...list(old?.history),...(old?[{budgets:old.budgets,updatedAt:old.updatedAt}]:[])]};});
 });
}
function additionalServiceRatesHtml(){const school=data();return '<section class="card"><div class="school-row"><h3>Servicios adicionales</h3>'+button('+ Agregar servicio','add-service')+'</div><div class="school-rate-grid">'+list(school.services).map(item=>'<section class="school-rate"><b>'+esc(item.name)+'</b><strong>'+(school.rates[item.id]?money(school.rates[item.id].cents):'Tarifa por definir')+'</strong>'+button('Editar tarifa','rate','data-reg="'+esc(item.id)+'"')+button('Modificar servicio','edit-service','data-service="'+esc(item.id)+'"')+'</section>').join('')+'</div></section>';}
function courseRatesHtml(){return '<div class="card"><h3>Tarifas de servicios</h3><p class="school-muted">Montos en USD, editables. Se aplican por defecto al agregar un curso y también se pueden ajustar para cada estudiante.</p><div class="school-rate-grid">'+Object.entries(COURSES).map(([type,c])=>{const rates=courseRates(type);return '<section class="school-rate"><b>'+esc(c.name)+'</b>'+c.fees.map(f=>'<div class="school-equipment-line"><span>'+esc(FEES[f])+'</span><strong>'+money(rates[f])+'</strong></div>').join('')+'<strong>Total del curso: '+money(c.fees.reduce((n,f)=>n+(rates[f]||0),0))+'</strong>'+(type==='rpa'?'<div class="school-equipment-line"><span>Tarifa por hora · Registro</span><strong>'+(data().rates.RPA?money(data().rates.RPA.cents)+'/h':'Sin definir')+'</strong></div>'+button('Editar tarifa por hora','rate','data-reg="RPA"'):'')+button('Modificar tarifa','course-rate','data-type="'+type+'"')+'</section>';}).join('')+'</div></div>'+additionalServiceRatesHtml();}
async function correctDeletionKey(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===DELETION_KEY_HASH;}
function protectedDeletion(message,mutator,after){
 if(!window.confirm(message))return;
 modal('Confirmar eliminación','<p class="school-full">'+esc(message)+'</p>'+input('deletionKey','Clave de eliminación','','password','required autocomplete="off"') ,async f=>{
  if(!await correctDeletionKey(f.deletionKey||''))throw Error('Clave incorrecta. No se eliminó ningún registro.');
  await change(mutator);if(after)after();
 },dialog=>{dialog.querySelector('[type="submit"]').textContent='Eliminar';dialog.querySelector('[type="submit"]').classList.add('school-danger');});
}
function deleteStudent(sid){const s=studentById(data(),sid);protectedDeletion('¿Eliminar definitivamente a '+s.name+' y su expediente, cursos, pagos, horas y gastos? Esta acción no se puede deshacer.',school=>{school.students=school.students.filter(s=>s.id!==sid);},()=>{selected=null;render();});}
function deleteArchivedCourse(sid,cid){const s=studentById(data(),sid),c=list(s.deletedCourses).find(c=>c.id===cid);if(!c)return;protectedDeletion('¿Eliminar definitivamente el curso archivado '+(COURSES[c.type]?.name||c.type)+' de '+s.name+', incluidos sus pagos y horas? Esta acción no se puede deshacer.',school=>{const target=studentById(school,sid);target.deletedCourses=list(target.deletedCourses).filter(c=>c.id!==cid);});}
function registryChargeTotal(s){return active(s.registryFlights).reduce((n,f)=>n+Number(f.costCents||0),0);}
function extraTotals(s){return {expenses:active(s.expenses).reduce((n,e)=>n+e.cents,0),payments:active(s.extraPayments).reduce((n,e)=>n+e.cents,0)};}
function addExtra(sid,kind){
 if(kind==='extraPayments'){openPayment('student:'+sid,'general');return;}
 const isPayment=kind==='extraPayments',s=studentById(data(),sid),extraServices=rateServices().filter(x=>x.category==='otro');
 modal(isPayment?'Abono a otros gastos':'Registrar otro gasto',dateField('date','Fecha',today(),true)+(!isPayment?'<label>Servicio<select name="extraService"><option value="">Gasto personalizado</option>'+extraServices.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label>':'')+amountField('amount','Monto (USD)')+(isPayment?'<label>Origen<select name="source">'+options(SOURCES,'Propio')+'</select></label>':input('description','Concepto del gasto','','text','required maxlength="200"')+'<label>Curso relacionado<select name="courseId"><option value="">Gasto general</option>'+list(s.courses).map(c=>'<option value="'+esc(c.id)+'">'+esc(COURSES[c.type].name)+'</option>').join('')+'</select></label><label>Aeronave / equipo<select name="aircraft"><option value="">No aplica</option>'+fleet.map(a=>'<option value="'+esc(a.reg)+'">'+esc(a.reg)+'</option>').join('')+'<option>RPA (Drone)</option><option>Simulador</option></select></label>')+input('reference','Recibo / referencia','','text','maxlength="100"')+'<label class="school-full">Observación<textarea name="note" maxlength="2000"></textarea></label>',async f=>{
  errorDate(f,[['date',true]]);const amount=cents(f.amount);if(!amount)throw Error('El monto debe ser mayor que cero.');if(!isPayment&&!f.description.trim())throw Error('Describe el gasto.');if(isPayment&&!SOURCES.includes(f.source))throw Error('Revisa el origen del abono.');
  await change(school=>{const target=studentById(school,sid),course=!isPayment&&f.courseId?courseById(target,f.courseId):null;target[kind] ||= [];target[kind].push({id:uid(),date:isoFecha(f.date),cents:amount,description:isPayment?'Abono a otros gastos':f.description.trim(),serviceId:!isPayment?f.extraService||'':'',source:isPayment?f.source:'',aircraft:f.aircraft||'',courseId:course?.id||'',courseName:course?COURSES[course.type].name:'',reference:f.reference.trim(),note:f.note.trim(),createdAt:new Date().toISOString()});if(isPayment&&!manualStage(target.stage)){target.stage='En formación';target.enrolledDate ||= isoFecha(f.date);}});
 },dialog=>{if(!isPayment)dialog.querySelector('[name="extraService"]').onchange=e=>{const service=extraServices.find(x=>x.id===e.target.value);if(service){dialog.querySelector('[name="description"]').value=service.name;dialog.querySelector('[name="amount"]').value=numeric(data().rates[service.id]?.cents);}};});
}
function voidExtra(sid,kind,id){
 if(!['expenses','extraPayments'].includes(kind)||!window.confirm('¿Anular este movimiento? Se conservará con el motivo de anulación.'))return;
 modal('Anular movimiento','<label class="school-full">Motivo<textarea name="reason" required maxlength="2000"></textarea></label>',async f=>{if(!f.reason.trim())throw Error('Ingresa el motivo.');await change(school=>{const e=list(studentById(school,sid)[kind]).find(e=>e.id===id);if(!e||e.voidedAt)throw Error('El movimiento ya no está activo.');e.voidedAt=new Date().toISOString();e.voidReason=f.reason.trim();});});
}
function extrasHtml(s){const attrs='data-student="'+esc(s.id)+'"',totals=extraTotals(s);return '<section class="card"><div class="school-row"><h3>Otros gastos</h3><div class="school-actions">'+button('+ Gasto','expense',attrs)+button('+ Abono a otros gastos','extra-payment',attrs)+'</div></div><p class="school-muted">Gastos: '+money(totals.expenses)+' · Abonos: '+money(totals.payments)+' · Saldo pendiente: '+money(totals.expenses-totals.payments)+'</p>'+['expenses','extraPayments'].flatMap(kind=>list(s[kind]).map(e=>'<div class="school-ledger-entry'+(e.voidedAt?' school-void':'')+'"><div class="school-row"><b>'+esc(fechaVista(e.date))+' · '+esc(e.description)+' · '+money(e.cents)+'</b>'+(!e.voidedAt?button('Anular','void-extra',attrs+' data-kind="'+kind+'" data-entry="'+esc(e.id)+'"'):'<span>Anulado</span>')+'</div><p>'+esc([e.courseName,e.aircraft,e.source,e.reference,e.note].filter(Boolean).join(' · '))+'</p>'+(e.voidedAt?'<p>Motivo: '+esc(e.voidReason)+'</p>':'')+'</div>')).join('')+'</section>';}
function statementBalance(value,available=false){const n=Number(value)||0,credit=available?n>0:n<0,debt=available?n<0:n>0;return '<span class="'+(credit?'school-balance-credit':debt?'school-balance-debt':'school-balance-neutral')+'">'+money(n)+'</span>';}
function registryMovement(f){const entry=list(previewData.school?.registry?.entries).find(e=>e.id===f.registryId);return {operationType:entry?.operationType||f.operationType||'instruction',book:entry?.book||f.book||'',pilot:entry?.pilot||f.pilot||f.instructor||'',destinations:[entry?.origin||f.origin,...list(entry?.destinations||f.destinations)].filter(Boolean).join(' → ')};}
const STATEMENT_SERVICES=[['courses','Cursos'],['flight','Horas de vuelo'],['simulator','Horas de simulador'],['rpa','Horas de RPA (Drone)'],['charter','Chárter'],['other','Otros gastos y abonos']];
function statementFlightService(f,c){if(registryMovement(f).operationType==='charter')return 'charter';const kind=sessionCategory(f,c);return kind==='rpa'?'rpa':kind==='simulador'?'simulator':'flight';}
function statementFeeService(fee,c){return fee==='simulador'?'simulator':fee==='vuelo'?(c.type==='rpa'?'rpa':'flight'):'courses';}
function statementData(s){
 const courses=list(s.courses),extra=extraTotals(s),generalCharges=registryChargeTotal(s),rows=[];let budget=0,paid=extra.payments,flightBalance=0,simBalance=0;
 for(const c of courses){const summary=courseSummary(c),name=COURSES[c.type].name;budget+=summary.budget;paid+=summary.paid;flightBalance+=summary.flightBalance;simBalance+=summary.simBalance;
  for(const fee of courseFees(c).filter(f=>!['vuelo','simulador'].includes(f))){const amount=Number(c.budgets?.[fee]||0);if(amount)rows.push({service:'courses',date:c.startDate||'',description:FEES[fee],course:name,aircraft:'',charge:amount,credit:0,note:'Monto acordado del curso'});}
  for(const p of list(c.payments))rows.push({service:statementFeeService(p.fee,c),date:p.date,description:'Abono · '+(FEES[p.fee]||p.fee),course:name,aircraft:'',charge:0,credit:p.voidedAt?0:p.cents,voided:!!p.voidedAt,note:[p.method,p.receiptNumber,p.source,p.reference,p.note,p.voidedAt?'Anulado: '+p.voidReason+' · Importe original '+money(p.cents):''].filter(Boolean).join(' · ')});
  for(const f of list(c.flights))rows.push({...registryMovement(f),service:statementFlightService(f,c),date:f.date,description:sessionDescription(f,c),course:name,aircraft:f.fee==='simulador'?'Simulador'+(f.equipment?' · '+f.equipment:''):f.aircraft,hours100:f.hours100,rateCents:f.rateCents,charge:f.voidedAt?0:f.costCents,credit:0,voided:!!f.voidedAt,note:[f.instructor,f.note,f.voidedAt?'Anulado: '+f.voidReason+' · Importe original '+money(f.costCents):''].filter(Boolean).join(' · ')});
 }
 for(const f of list(s.registryFlights))rows.push({...registryMovement(f),service:statementFlightService(f,{type:'registro'}),date:f.date,description:sessionDescription(f,{type:'registro'}),course:'',aircraft:f.aircraft==='RPA'?'RPA (Drone)':f.aircraft,hours100:f.hours100,rateCents:f.rateCents||0,charge:f.voidedAt?0:Number(f.costCents||0),credit:0,voided:!!f.voidedAt,note:f.note});
 for(const kind of ['expenses','extraPayments'])for(const e of list(s[kind]))rows.push({service:kind==='extraPayments'?(e.service||'other'):'other',date:e.date,description:e.description,course:e.courseName||'',aircraft:e.aircraft||'',charge:kind==='expenses'&&!e.voidedAt?e.cents:0,credit:kind==='extraPayments'&&!e.voidedAt?e.cents:0,voided:!!e.voidedAt,note:[e.method,e.receiptNumber,e.source,e.reference,e.note,e.voidedAt?'Anulado: '+e.voidReason+' · Importe original '+money(e.cents):''].filter(Boolean).join(' · ')});
 rows.sort((a,b)=>STATEMENT_SERVICES.findIndex(x=>x[0]===a.service)-STATEMENT_SERVICES.findIndex(x=>x[0]===b.service)||(isoFecha(a.date)||'').localeCompare(isoFecha(b.date)||''));let balance=0;const balances={};for(const row of rows){balance+=row.charge-row.credit;balances[row.service]=(balances[row.service]||0)+row.charge-row.credit;row.balance=balances[row.service];}const groups=STATEMENT_SERVICES.map(([key,label])=>({key,label,rows:rows.filter(r=>r.service===key),balance:balances[key]||0})).filter(g=>g.key!=='other'||g.rows.length);
 return {rows,groups,budget,paid,generalCharges,expenses:extra.expenses,contractDue:budget+extra.expenses+generalCharges-paid,servicesBalance:balance,flightBalance,simBalance};
}
function emittedAt(){return new Intl.DateTimeFormat('es-GB',{timeZone:'America/Panama',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());}
function statementHtml(s){
 const d=statementData(s);return '<div class="school-print-heading"><h1>HP Flight School</h1><h2>'+esc(s.name)+'</h2><p>Estado de cuenta · Emitido: '+esc(emittedAt())+' · Panamá</p><p>Cédula / pasaporte: '+esc(s.identity||'')+'</p></div><div class="school-statement-summary">'+[['Precio de cursos acordado',d.budget],['Otros gastos',d.expenses],['Horas sin curso asignado',d.generalCharges],['Abonos recibidos',d.paid],['Saldo total por pagar',d.contractDue],['Saldo disponible · vuelos',d.flightBalance],['Saldo disponible · simulador',d.simBalance]].map(([label,value])=>'<div><small>'+label+'</small><b>'+(label.startsWith('Saldo')?statementBalance(value,label.includes('disponible')):money(value))+'</b></div>').join('')+'</div><h3>Precios y saldos por curso</h3><div class="school-statement-table-wrap"><table class="school-statement-table"><thead><tr><th>Curso / inicio</th><th>Conceptos y precios</th><th>Precio total</th><th>Abonado</th><th>Pendiente</th></tr></thead><tbody>'+list(s.courses).map(c=>{const t=courseSummary(c);return '<tr><td>'+esc(COURSES[c.type].name)+'<br>'+esc(fechaVista(c.startDate||''))+'</td><td>'+courseFees(c).map(f=>esc(FEES[f])+': '+money(courseAmount(c,f))).join('<br>')+'</td><td>'+money(t.budget)+'</td><td>'+money(t.paid)+'</td><td>'+statementBalance(t.due)+'</td></tr>';}).join('')+'</tbody></table></div><h3>Horas registradas por equipo</h3>'+equipmentHoursHtml(s,1)+'<h3>Movimientos por servicio</h3><p class="school-statement-note">Los cargos incluyen matrícula, teoría, tutoría y materiales acordados, las horas efectivamente realizadas y otros gastos. El presupuesto de horas se muestra arriba y no se descuenta nuevamente aquí. Saldo positivo: por pagar; saldo negativo: a favor. El saldo de cada sección corresponde a ese servicio; el saldo final reúne todas las secciones. Dentro de cada servicio, los movimientos se ordenan por fecha. Los movimientos anulados no afectan los saldos.</p><div class="school-statement-table-wrap"><table class="school-statement-table"><thead><tr><th>Fecha</th><th>Curso / concepto</th><th>Aeronave / equipo</th><th>Bitácora</th><th>Piloto</th><th>Destino</th><th>Tiempo de vuelo</th><th>Precio/h</th><th>Cargo / monto descontado</th><th>Abono</th><th>Saldo</th></tr></thead><tbody>'+d.groups.map(g=>'<tr class="school-service-heading"><th colspan="11">'+esc(g.label)+'</th></tr>'+g.rows.map(r=>'<tr'+(r.voided?' class="school-statement-void"':'')+'><td>'+esc(fechaVista(r.date||''))+'</td><td>'+esc(r.course)+'<br>'+esc(r.description)+(r.voided?' · ANULADO':'')+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</td><td>'+esc(r.aircraft||'')+'</td><td>'+esc(r.book||'')+'</td><td>'+esc(r.pilot||'')+'</td><td>'+esc(r.destinations||'')+'</td><td>'+(r.hours100!=null?(Number(r.hours100)/100).toFixed(1):'')+'</td><td>'+(r.rateCents!=null?money(r.rateCents):'')+'</td><td>'+money(r.charge)+'</td><td>'+money(r.credit)+'</td><td>'+statementBalance(r.balance)+'</td></tr>').join('')+(g.rows.length?'<tr class="school-service-total"><td colspan="10">Saldo · '+esc(g.label)+'</td><td>'+statementBalance(g.balance)+'</td></tr>':'<tr><td colspan="11" class="school-muted">Sin movimientos</td></tr>')).join('')+'</tbody></table></div><p class="school-statement-closing"><b>Saldo por servicios registrados: '+statementBalance(d.servicesBalance)+'</b></p>'+(!d.rows.length?'<p>Sin movimientos registrados.</p>':'')+(list(s.deletedCourses).length?'<p class="school-statement-note">Cursos archivados excluidos de este estado de cuenta: '+list(s.deletedCourses).map(c=>esc(COURSES[c.type]?.name||c.type)).join(', ')+'.</p>':'');
}
async function printSchoolHtml(html,kind=''){
 document.getElementById('school-print-sheet')?.remove();const sheet=document.createElement('section');sheet.id='school-print-sheet';sheet.className=kind;sheet.innerHTML=html;document.body.appendChild(sheet);document.body.classList.add('school-printing');
 const cleanup=()=>{document.body.classList.remove('school-printing');sheet.remove();};window.addEventListener('afterprint',cleanup,{once:true});try{await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));window.print();}catch(e){cleanup();throw Error('No se pudo abrir la impresión.');}
}
function blankRegistrationHtml(){const labels=['Nombre completo','Cédula o pasaporte','Fecha de nacimiento','Nacionalidad','Dirección','Celular','Teléfono residencial','Correo electrónico','Contacto de emergencia · nombre','Contacto de emergencia · celular','Nombre del padre','Nombre de la madre','Colegio de procedencia','Ingreso al sistema','Fecha de matrícula','Etapa','Financiamiento','Cursos de interés','Culminación','Cursos culminados','Motivo del retiro','Observaciones','Quién lo recomienda'];return '<div class="school-print-heading"><h1>HP Flight School</h1><h2>Formulario de registro</h2></div><div class="school-blank-fields">'+labels.filter(label=>!STUDENT_PRINT_EXCLUDED.has(label)).map(label=>'<div class="school-blank-row"><strong>'+esc(label)+':</strong><span></span></div>').join('')+'<div class="school-blank-row"><strong>Firma del estudiante:</strong><span></span></div></div>';}
function showStatement(sid){showStatementRecord(()=>studentById(data(),sid));}
function showStatementRecord(getRecord){
 const s=getRecord(),dialog=document.createElement('dialog');dialog.className='record-dialog school-statement-dialog';const actions='<div class="school-actions school-statement-actions"><button type="button" class="record-btn" data-print>Imprimir / guardar PDF</button><button type="button" class="record-btn" data-close>Cerrar</button></div>';dialog.innerHTML=actions+statementHtml(s)+actions;document.body.appendChild(dialog);dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());dialog.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>printSchoolHtml(statementHtml(getRecord()),'school-statement-print'));dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();dialog.scrollTop=0;
}

function addCourse(studentId){
 modal('Agregar curso','<label class="school-full">Curso<select name="type">'+courseOptions('privado')+'</select></label>'+dateField('startDate','Fecha de inicio',today())+'<div class="school-full school-form" data-new-budgets>'+studentBudgetFields({type:'privado',budgets:{...courseRates('privado'),tutoria:0}})+'</div>',async f=>{
  errorDate(f,[['startDate',false]]);if(!COURSES[f.type])throw Error('Selecciona un curso.');const budgets=readStudentBudgets(f,{type:f.type,budgets:{}});
  const c={id:uid(),type:f.type,startDate:isoFecha(f.startDate),endDate:'',status:COURSES[f.type].states[0],licenseDate:'',licenseNumber:'',budgets,payments:[],flights:[],history:[]};
  await change(school=>studentById(school,studentId).courses.push(c));
 },dialog=>{const drafts={};let prior='privado';dialog.querySelector('[name="type"]').onchange=e=>{drafts[prior]={};dialog.querySelectorAll('[name^="budget_"]').forEach(el=>{const v=cents(el.value);if(v!==null)drafts[prior][el.name.slice(7)]=v;});prior=e.target.value;dialog.querySelector('[data-new-budgets]').innerHTML=studentBudgetFields({type:prior,budgets:{...courseRates(prior),...drafts[prior],tutoria:0}});};});
}
async function deleteCourse(sid,cid){
 const student=studentById(data(),sid),course=courseById(student,cid);
 const message='¿Quieres eliminar el curso '+COURSES[course.type].name+' de '+student.name+'?\n\nSe retirará de los cursos y de los saldos activos. Sus pagos, horas y datos se conservarán en el historial del expediente.';
 protectedDeletion(message,school=>{const target=studentById(school,sid),index=target.courses.findIndex(c=>c.id===cid);if(index<0)throw Error('El curso ya no está disponible.');
  const [removed]=target.courses.splice(index,1);target.deletedCourses ||= [];target.deletedCourses.push({...removed,deletedAt:new Date().toISOString()});
  target.history ||= [];target.history.push({at:new Date().toISOString(),action:'Curso eliminado',courseId:cid,courseType:removed.type});
 });
}
function editCourse(sid,cid){
 const c=courseById(studentById(data(),sid),cid),spec=COURSES[c.type];
 modal('Curso · '+spec.name,'<label class="school-full">Curso<select name="type">'+courseOptions(c.type)+'</select></label><label class="school-full">Estado<select name="status">'+options(spec.states,c.status)+'</select></label>'+dateField('startDate','Fecha de inicio',c.startDate)+dateField('endDate','Fecha de culminación del curso',c.endDate)+dateField('licenseDate','Fecha de licencia / habilitación',c.licenseDate)+input('licenseNumber','Número de licencia / habilitación',c.licenseNumber||'')+'<div class="school-full school-course-budget-fields school-form">'+studentBudgetFields(c)+'</div>',async f=>{
  const chosen=COURSES[f.type];if(!chosen||!chosen.states.includes(f.status))throw Error('Revisa el curso y el estado.');
  const incompatible=[...list(c.payments),...list(c.flights)].some(x=>!chosen.fees.includes(x.fee));
  if(incompatible)throw Error('Los movimientos existentes no son compatibles con ese curso. Conserva este curso y agrega el nuevo para mantener sus pagos y horas.');
  const completed=f.status===chosen.states.at(-1);errorDate(f,[['startDate',false],['endDate',false],['licenseDate',completed]]);
  const budgets=readStudentBudgets(f,{...c,type:f.type});
  if(f.startDate&&f.endDate&&dayNumber(f.endDate)<dayNumber(f.startDate))throw Error('La fecha de culminación no puede ser anterior al inicio.');
  await change(school=>{const target=courseById(studentById(school,sid),cid);target.history ||= [];target.history.push({at:new Date().toISOString(),before:{type:target.type,status:target.status,budgets:target.budgets,licenseDate:target.licenseDate},after:{type:f.type,status:f.status,budgets,licenseDate:isoFecha(f.licenseDate)}});Object.assign(target,{type:f.type,status:f.status,startDate:isoFecha(f.startDate),endDate:isoFecha(f.endDate),licenseDate:isoFecha(f.licenseDate),licenseNumber:f.licenseNumber.trim(),budgets});});
 },dialog=>{
  const amounts={...c.budgets};
  dialog.querySelector('[name="type"]').onchange=event=>{
   dialog.querySelectorAll('[name^="budget_"]').forEach(el=>{const value=cents(el.value);if(value!==null)amounts[el.name.slice(7)]=value;});
   const next=COURSES[event.target.value],status=dialog.querySelector('[name="status"]');
   status.innerHTML=options(next.states,next.states.includes(status.value)?status.value:next.states[0]);
   dialog.querySelector('.school-course-budget-fields').innerHTML=studentBudgetFields({...c,type:event.target.value,budgets:amounts});
  };
 });
}
function addPayment(sid,cid,fee){openPayment('student:'+sid,fee,cid);}
function rateServices(school=data()){
 return [...fleet.map(a=>({id:a.reg,name:a.reg,description:a.model,category:'vuelo'})),{id:'RPA',name:'RPA (Drone)',description:'Entrenamiento de RPA',category:'rpa'},{id:'Simulador',name:'Simulador',description:'Entrenamiento de SIM',category:'simulador'},...list(school.services)];
}
function serviceLabel(category){return {vuelo:'Horas de vuelo',rpa:'Horas de RPA',simulador:'Horas de simulador',otro:'Servicio adicional'}[category]||'Servicio';}
function editService(id){
 const s=id?list(data().services).find(x=>x.id===id):{name:'',description:'',category:'otro'};if(!s)return;
 modal(id?'Modificar servicio':'Agregar servicio',input('name','Nombre del servicio',s.name,'text','required maxlength="120"')+input('description','Descripción',s.description||'','text','maxlength="250"')+'<label>Tipo de servicio<select name="category">'+['vuelo','rpa','simulador','otro'].map(k=>'<option value="'+k+'"'+(k===s.category?' selected':'')+'>'+serviceLabel(k)+(k==='otro'?' · precio por servicio':' · precio por hora')+'</option>').join('')+'</select></label>'+amountField('rate','Tarifa (USD)',data().rates[id]?.cents)+'<p class="school-full school-muted">Los servicios por hora estarán disponibles al registrar sesiones. Los servicios adicionales estarán disponibles en Otros gastos. Los registros anteriores conservan el equipo, el tipo y la tarifa cobrados.</p>',async f=>{
  const name=f.name.trim(),rate=cents(f.rate);if(!name||rate===null||!['vuelo','rpa','simulador','otro'].includes(f.category))throw Error('Revisa el nombre, el tipo y la tarifa.');
  if(rateServices().some(x=>x.id!==id&&(countrySearch(x.name)===countrySearch(name)||countrySearch(x.id)===countrySearch(name))))throw Error('Ya existe una aeronave o servicio con ese nombre.');
  const key=id||'service-'+uid();await change(school=>{school.services ||= [];const record={id:key,name,description:f.description.trim(),category:f.category};if(id){const target=school.services.find(x=>x.id===id);if(!target)throw Error('No se encontró el servicio.');Object.assign(target,record);}else school.services.push(record);const old=school.rates[key];school.rates[key]={cents:rate,updatedAt:new Date().toISOString(),history:[...list(old?.history),...(old?[{cents:old.cents,updatedAt:old.updatedAt}]:[])]};});
 });
}
function ratesHtml(school){return '<div class="card"><div class="school-row"><h3>Tarifas de aeronaves y servicios</h3>'+button('+ Agregar servicio','add-service')+'</div><p class="school-muted">Tarifas editables en USD. Los registros anteriores conservan el precio cobrado.</p><div class="school-rate-grid">'+rateServices(school).map(a=>'<div class="school-rate"><b>'+esc(a.name)+'</b><span>'+esc(a.description||'')+'</span><span>'+serviceLabel(a.category)+'</span><strong>'+(school.rates[a.id]?money(school.rates[a.id].cents)+(a.category==='otro'?'/servicio':'/h'):'Sin tarifa')+'</strong>'+button('Editar tarifa','rate','data-reg="'+esc(a.id)+'"')+(a.id.startsWith('service-')?button('Modificar servicio','edit-service','data-service="'+esc(a.id)+'"'):'')+'</div>').join('')+'</div></div>';}
function sessionCategory(flight,course){
 if(flight.equipmentKind)return flight.equipmentKind;
 if(flight.fee==='simulador'||flight.aircraft==='Simulador')return 'simulador';
 if(['RPA','RPA (Drone)'].includes(flight.aircraft))return 'rpa';
 if(flight.aircraft==='Otra / RPA')return course.type==='rpa'?'rpa':'unknown';
 return 'vuelo';
}
function sessionDescription(f,c){if(registryMovement(f).operationType==='charter')return 'Chárter';const kind=sessionCategory(f,c);return kind==='rpa'?'Sesión de RPA':kind==='simulador'?'Sesión de simulador':kind==='unknown'?'Sesión · equipo sin clasificar':'Sesión de vuelo';}

function logFlight(sid,cid,kind='vuelo'){
 const school=data(),student=studentById(school,sid),course=courseById(student,cid),sim=kind==='simulador',services=rateServices(school).filter(x=>sim?x.category==='simulador':['vuelo','rpa'].includes(x.category));
 const selectedService=sim?'Simulador':course.type==='rpa'?'RPA':'';
 const selector='<label>'+ (sim?'Servicio de simulador':'Aeronave / servicio')+'<select name="serviceId"'+(!sim?' required':'')+'><option value="">'+(sim?'Ingresar equipo y tarifa manualmente':'Seleccionar…')+'</option>'+services.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===selectedService?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>';
 modal(sim?'Registrar horas de simulador':course.type==='rpa'?'Registrar horas de RPA':'Registrar horas de vuelo / RPA',dateField('date','Fecha de la sesión',today(),true)+selector+(sim?input('equipment','Simulador / equipo','Simulador','text','required maxlength="160"'):'')+input('hours','Horas realizadas','','number','min="0.01" max="99999.99" step="0.01" required')+amountField('rate','Tarifa por hora (USD)',school.rates[selectedService]?.cents)+'<p class="school-full school-muted" id="school-flight-estimate"></p>'+input('instructor','Instructor / referencia')+'<label class="school-full">Observación<textarea name="note" maxlength="2000"></textarea></label>',async f=>{
  errorDate(f,[['date',true]]);const hours100=cents(f.hours),rate=cents(f.rate),service=services.find(x=>x.id===f.serviceId);
  if(!hours100||rate===null)throw Error('Revisa las horas y la tarifa.');if(!sim&&!service)throw Error('Selecciona una aeronave o servicio.');if(sim&&!f.equipment.trim())throw Error('Ingresa el simulador o equipo.');if(rate===0&&!f.note.trim())throw Error('Explica en la observación por qué la sesión no tiene cargo.');
  const costCents=Math.round(hours100*rate/100);if(!Number.isSafeInteger(costCents))throw Error('El importe excede el rango permitido.');const latest=courseById(studentById(data(),sid),cid),balance=paymentTotal(latest,kind)-flightTotal(latest,kind);
  if(costCents>balance&&!window.confirm('El cargo es '+money(costCents)+' y el saldo disponible es '+money(balance)+'. ¿Registrar la sesión y dejar el saldo negativo?'))return;
  await change(s=>courseById(studentById(s,sid),cid).flights.push({id:uid(),fee:kind,date:isoFecha(f.date),aircraft:sim?'Simulador':service.id==='RPA'?'RPA':service.name,serviceId:service?.id||'',equipmentKind:sim?'simulador':service.category,equipment:sim?f.equipment.trim():'',hours100,rateCents:rate,costCents,instructor:f.instructor.trim(),note:f.note.trim(),createdAt:new Date().toISOString()}));
 },dialog=>{
  const calc=()=>{const h=cents(dialog.querySelector('[name="hours"]').value)||0,r=cents(dialog.querySelector('[name="rate"]').value)||0;dialog.querySelector('#school-flight-estimate').textContent='Cargo: '+money(Math.round(h*r/100))+' · Saldo actual: '+money(paymentTotal(course,kind)-flightTotal(course,kind));};
  dialog.querySelector('[name="hours"]').addEventListener('input',calc);dialog.querySelector('[name="rate"]').addEventListener('input',calc);
  dialog.querySelector('[name="serviceId"]').onchange=e=>{const service=services.find(x=>x.id===e.target.value),rate=school.rates[service?.id]?.cents;dialog.querySelector('[name="rate"]').value=rate==null?'':numeric(rate);if(sim)dialog.querySelector('[name="equipment"]').value=service?.name||'';calc();};calc();
 });
}
function voidEntry(sid,cid,kind,id){
 const linked=list(courseById(studentById(data(),sid),cid)[kind]).find(e=>e.id===id);if(linked?.registryId){window.Registro.edit(linked.registryId);return;}
 modal('Anular registro','<p class="school-full school-muted">El original se conserva. La anulación recalcula el saldo y las horas.</p><label class="school-full">Motivo obligatorio<textarea name="reason" required maxlength="2000"></textarea></label>',async f=>{
  if(!f.reason.trim())throw Error('Ingresa el motivo de la anulación.');
  if(!window.confirm('¿Confirmas anular este registro?'))return;
  await change(school=>{const c=courseById(studentById(school,sid),cid),entry=list(c[kind]).find(e=>e.id===id);if(!entry||entry.voidedAt)throw Error('Este registro ya no está activo.');entry.voidedAt=new Date().toISOString();entry.voidReason=f.reason.trim();});
 });
}
function editRate(reg){
 const current=data().rates[reg],service=rateServices().find(s=>s.id===reg);
 modal('Tarifa · '+(service?.name||reg),amountField('rate',service?.category==='otro'?'Precio por servicio (USD)':'Precio por hora (USD)',current?.cents)+'<p class="school-full school-muted">Se usará en nuevos registros. Las sesiones anteriores conservan la tarifa cobrada.</p>',async f=>{
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
function editBrochure(){modal('Folleto de la carrera',input('url','Enlace público al folleto (PDF)',data().brochureUrl||'','url','placeholder="https://…"')+'<p class="school-full school-muted">Este enlace se incluirá en el correo. El envío automático todavía requiere conectar un servicio de correo.</p>',async f=>{
 let value=f.url.trim();if(value){let u;try{u=new URL(value);}catch{throw Error('Usa un enlace HTTPS válido.');}if(u.protocol!=='https:')throw Error('Usa un enlace HTTPS.');}
 await change(s=>{s.brochureUrl=value;});});}
function showEmail(sid,intakeId){
 const school=data(),student=studentById(school,sid),intake=school.intakes.find(i=>i.id===intakeId);if(!intake||student.stage!=='Interesado')return;
 const subject='Próximo curso de '+COURSES[intake.type].name+' · HP Flight School';
 const body='Hola '+student.name+',\n\nNuestro próximo curso de '+COURSES[intake.type].name+' inicia el '+fechaVista(intake.startDate)+'.\n\n'+(school.brochureUrl?'Conoce la carrera de aviación: '+school.brochureUrl:'[Pendiente: adjuntar el folleto de la carrera]')+'\n\nContáctanos para conocer los pasos de matrícula.\n\nHP Flight School';
 const dialog=document.createElement('dialog');dialog.className='record-dialog school-dialog';
 dialog.innerHTML='<h3>Correo preparado · sin enviar</h3><p class="school-muted">Destinatario: '+esc(student.email||'Falta correo')+'</p><label>Asunto<input class="school-preview-input" readonly value="'+esc(subject)+'"></label><textarea class="school-email-preview" readonly>'+esc(body)+'</textarea><p class="school-muted">El sistema no ha enviado este correo. Al abrirlo, podrás revisarlo y enviarlo desde tu aplicación de correo.</p><div class="record-actions">'+(student.email?'<a class="record-btn" href="mailto:'+encodeURIComponent(student.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)+'">Abrir en mi correo</a>':'')+'<button class="record-btn" data-close>Cerrar</button></div>';
 document.body.appendChild(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();dialog.scrollTop=0;
}
function button(label,action,attrs=''){return '<button type="button" class="record-btn" data-action="'+action+'" '+attrs+'>'+label+'</button>';}
function courseHtml(student,c){
 const spec=COURSES[c.type],sum=courseSummary(c),sid='data-student="'+esc(student.id)+'" data-course="'+esc(c.id)+'"';
 return '<section class="card school-course"><div class="school-row"><div><h3>'+spec.name+'</h3><span class="school-tag">'+esc(schoolDisplayText(c.status))+'</span></div>'+'<div class="school-actions">'+button('Modificar curso','edit-course',sid)+(spec.fees.includes('tutoria')&&!courseFees(c).includes('tutoria')?button('+ Agregar tutoría','add-tutoring',sid):'')+button('Eliminar','delete-course',sid)+'</div>'+'</div><div class="school-course-dates">Inicio: '+esc(fechaVista(c.startDate)||'')+' · Fin: '+esc(fechaVista(c.endDate)||'')+(c.licenseDate?'<br>Licencia / habilitación: '+esc(fechaVista(c.licenseDate))+' · '+esc(c.licenseNumber||''):'')+'</div>'+
  courseFees(c).map(fee=>{const total=courseAmount(c,fee),paid=paymentTotal(c,fee),pct=total>0?Math.min(100,Math.round(paid/total*100)):0,complete=total>0&&paid>=total;
   return '<div class="school-fee"><div class="school-row"><strong>'+FEES[fee]+'</strong>'+button('+ Abono','payment',sid+' data-fee="'+fee+'"')+'</div><div class="school-fee-figures"><span>Monto: '+money(total)+'</span><span>Abonado: '+money(paid)+'</span><span>'+(!total?(['vuelo','simulador'].includes(fee)?'Sin abonos':'Monto por definir'):paid>total?'Crédito: '+money(paid-total):'Pendiente: '+money(total-paid))+'</span></div><div class="school-progress-row"><div class="school-progress" role="progressbar" aria-label="Pagos de '+FEES[fee]+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div><b class="school-paid">'+(complete?'✓':pct+'%')+'</b></div></div>';
  }).join('')+'<div class="school-balances"><div><small>Saldo disponible · vuelos</small><b class="'+(sum.flightBalance<0?'school-negative':'')+'">'+statementBalance(sum.flightBalance,true)+'</b><small>'+numeric(hoursTotal(c,'vuelo'))+' h realizadas · cargos '+money(flightTotal(c,'vuelo'))+'</small></div>'+(spec.fees.includes('simulador')?'<div><small>Saldo disponible · simulador</small><b class="'+(sum.simBalance<0?'school-negative':'')+'">'+statementBalance(sum.simBalance,true)+'</b><small>'+numeric(hoursTotal(c,'simulador'))+' h realizadas</small></div>':'')+'</div><div class="school-actions">'+button(c.type==='rpa'?'+ Horas de RPA':'+ Horas de vuelo / RPA','flight',sid)+(spec.fees.includes('simulador')?button('+ Simulador','simulator',sid):'')+'</div>'+historyHtml(student,c)+'</section>';
}
function historyHtml(student,c){
 const attrs='data-student="'+esc(student.id)+'" data-course="'+esc(c.id)+'"';
 const payments=list(c.payments).map(p=>({date:p.date,html:'<div class="school-ledger-entry'+(p.voidedAt?' school-void':'')+'"><div class="school-row"><b>'+esc(fechaVista(p.date))+' · Abono '+money(p.cents)+'</b>'+(!p.voidedAt?button('Anular','void',attrs+' data-kind="payments" data-entry="'+esc(p.id)+'"'):'<span>Anulado</span>')+'</div><span>'+FEES[p.fee]+' · '+esc(p.source)+' · '+esc(p.reference||'Sin referencia')+'</span><p>'+esc(p.note||'')+'</p>'+(p.voidedAt?'<p>Motivo de anulación: '+esc(p.voidReason)+'</p>':'')+'</div>'}));
 const flights=list(c.flights).map(f=>({date:f.date,html:'<div class="school-ledger-entry'+(f.voidedAt?' school-void':'')+'"><div class="school-row"><b>'+esc(fechaVista(f.date))+' · '+esc(f.aircraft)+' · '+numeric(f.hours100)+' h</b>'+(!f.voidedAt?button(f.registryId?'Corregir':'Anular','void',attrs+' data-kind="flights" data-entry="'+esc(f.id)+'"'):'<span>Anulado</span>')+'</div><span>'+money(f.rateCents)+'/h · Cargo '+money(f.costCents)+' · '+esc(f.equipment||f.instructor||'')+'</span><p>'+esc(f.note||'')+'</p>'+(f.voidedAt?'<p>Motivo de anulación: '+esc(f.voidReason)+'</p>':'')+'</div>'}));
 const entries=[...payments,...flights].sort((a,b)=>b.date.localeCompare(a.date));
 return '<details class="school-ledger"><summary>Movimientos y estado de cuenta ('+entries.length+')</summary><p class="school-muted">Saldo de vuelo = abonos de vuelo − cargos por sesiones. El monto del curso es el presupuesto; no se descuenta otra vez del saldo.</p>'+entries.map(e=>e.html).join('')+(entries.length?'':'<p>Sin movimientos.</p>')+'</details>';
}
function deletedCoursesHtml(s){
 if(!list(s.deletedCourses).length)return '';
 return '<details class="card school-deleted-courses"><summary>Cursos eliminados ('+s.deletedCourses.length+')</summary>'+s.deletedCourses.map(c=>'<section class="school-ledger-entry"><h4>'+esc(COURSES[c.type]?.name||c.type)+'</h4>'+button('Eliminar definitivamente','delete-archived-course','data-student="'+esc(s.id)+'" data-course="'+esc(c.id)+'"')+'<p class="school-muted">Conservado solo como historial; no forma parte de los saldos activos.</p>'+studentInfoItem('Estado al eliminar',schoolDisplayText(c.status))+studentInfoItem('Abonos registrados',money(paymentTotal(c)))+studentInfoItem('Horas registradas',numeric(hoursTotal(c))+' h')+list(c.payments).map(p=>studentInfoItem('Abono '+fechaVista(p.date),FEES[p.fee]+' · '+money(p.cents)+' · '+p.source+(p.voidedAt?' · Anulado':'')+' · '+(p.note||''))).join('')+list(c.flights).map(f=>studentInfoItem('Sesión '+fechaVista(f.date),f.aircraft+' · '+numeric(f.hours100)+' h · '+money(f.costCents)+(f.voidedAt?' · Anulada':''))).join('')+'</section>').join('')+'</details>';
}

function studentPrintHtml(student){
 const now=new Date();
 const date=new Intl.DateTimeFormat('es-GB',{timeZone:'America/Panama',day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
 const time=new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
 return '<div class="school-print-heading school-registration-heading"><img class="school-registration-logo" src="receipt-logo.svg" alt="Helicópteros Personales S.A."><h2>'+esc(student.name||'')+'</h2><p>Emitido: '+esc(date)+' · '+esc(time)+' · Panamá</p></div><div class="school-print-fields">'+studentPersonalHtml(student,true)+'</div>';
}
async function printStudent(id){
 const student=studentById(data(),id);
 document.getElementById('school-print-sheet')?.remove();
 const sheet=document.createElement('section');sheet.id='school-print-sheet';sheet.className='school-personal-print';sheet.innerHTML=studentPrintHtml(student);
 document.body.appendChild(sheet);document.body.classList.add('school-printing');
 const cleanup=()=>{document.body.classList.remove('school-printing');sheet.remove();};
 window.addEventListener('afterprint',cleanup,{once:true});
 try{await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode()));window.print();}catch(e){cleanup();throw Error('No se pudo cargar el formulario o abrir la impresión. Intenta nuevamente.');}
}

function equipmentHours(student){
 const groups=new Map();
 for(const course of [...list(student.courses),{type:'registro',flights:list(student.registryFlights)}])for(const flight of active(course.flights)){
  const category=sessionCategory(flight,course),simulator=category==='simulador';
  const label=simulator?'Simulador'+(flight.equipment?' · '+flight.equipment:''):(flight.aircraft==='RPA'?'RPA (Drone)':flight.aircraft||'Equipo sin registrar');
  const key=category+':'+label;
  if(!groups.has(key))groups.set(key,{label,simulator,category,hours100:0});
  groups.get(key).hours100+=Number(flight.hours100)||0;
 }
 return [...groups.values()].sort((a,b)=>Number(a.simulator)-Number(b.simulator)||a.label.localeCompare(b.label,'es'));
}
function equipmentHoursHtml(student,decimals=2){
 const hoursText=n=>(Number(n||0)/100).toFixed(decimals);
 const groups=equipmentHours(student),total=kind=>groups.filter(g=>g.category===kind).reduce((n,g)=>n+g.hours100,0);
 return '<div class="school-equipment-hours"><small>Horas por equipo</small><div class="school-hour-total"><span>Horas de vuelo:</span> <strong>'+hoursText(total('vuelo'))+' h</strong></div><div class="school-hour-total"><span>Horas de simulador:</span> <strong>'+hoursText(total('simulador'))+' h</strong></div><div class="school-hour-total"><span>Horas de RPA:</span> <strong>'+hoursText(total('rpa'))+' h</strong></div>'+(total('unknown')?'<div class="school-hour-total">Horas sin clasificar: '+hoursText(total('unknown'))+' h</div>':'')+'<div class="school-equipment-list">'+(groups.length?groups.map(g=>'<div class="school-equipment-line"><span>'+esc(g.label)+'</span><strong>'+hoursText(g.hours100)+' h</strong></div>').join(''):'<small>Sin horas registradas</small>')+'</div></div>';
}
function registryFlightsHtml(s){return list(s.registryFlights).length?'<section class="card"><h3>Horas sin curso asignado</h3>'+s.registryFlights.map(f=>'<div class="school-row school-ledger-entry"><span>'+esc(fechaVista(f.date))+' · '+esc(f.aircraft==='RPA'?'RPA (Drone)':f.aircraft)+' · '+numeric(f.hours100)+' h'+(!window.ROLE_VIEW||window.ROLE_VIEW.areas['Estado de cuenta y abonos']?' · Cargo: '+money(f.costCents||0):'')+'</span>'+button('Corregir','registry-edit','data-entry="'+esc(f.registryId)+'"')+'</div>').join('')+'</section>':'';}
function profileHtml(s){
 const courses=list(s.courses),totals=courses.map(courseSummary),sum=key=>totals.reduce((n,t)=>n+t[key],0),licenses=courses.filter(c=>c.licenseDate&&c.status===COURSES[c.type].states.at(-1));
 return '<div class="school-profile"><div class="card"><div class="school-row"><div><h2>'+esc(s.name)+'</h2><span class="school-tag">'+esc(s.stage)+'</span></div>'+'<div class="school-actions">'+button('Editar expediente','edit-student','data-student="'+esc(s.id)+'"')+button('Imprimir información personal','print-student','data-student="'+esc(s.id)+'"')+button('Eliminar estudiante','delete-student','data-student="'+esc(s.id)+'"')+'</div>'+'</div><div class="school-profile-info">'+studentPersonalHtml(s)+'</div><div class="school-totals"><div><small>Presupuesto de cursos</small><b>'+money(sum('budget'))+'</b></div><button type="button" class="school-account-button" data-action="statement" data-student="'+esc(s.id)+'"><small>Abonos recibidos / estado de cuenta</small><b>'+money(sum('paid')+extraTotals(s).payments)+'</b><span>Ver estado de cuenta →</span></button><div><small>Saldo total por pagar</small><b>'+statementBalance(sum('due')+extraTotals(s).expenses+registryChargeTotal(s)-extraTotals(s).payments)+'</b></div><div><small>Saldo disponible · simulador</small><b>'+statementBalance(sum('simBalance'),true)+'</b></div><div><small>Saldo disponible · vuelos</small><b>'+statementBalance(sum('flightBalance'),true)+'</b></div>'+equipmentHoursHtml(s)+'</div><p class="school-muted">Licencias obtenidas mediante cursos registrados: '+(licenses.length?licenses.map(c=>esc(COURSES[c.type].name)+' ('+esc(fechaVista(c.licenseDate))+')').join(' · '):'Ninguna registrada')+'</p></div><div class="school-row"><h3>Cursos y pagos</h3>'+button('+ Agregar curso','add-course','data-student="'+esc(s.id)+'"')+'</div><div class="school-course-grid">'+courses.map(c=>courseHtml(s,c)).join('')+'</div>'+registryFlightsHtml(s)+extrasHtml(s)+deletedCoursesHtml(s)+'</div>';
}
function clientById(school,id){const c=list(school.registry?.clients).find(c=>c.id===id);if(!c)throw Error('No se encontró el cliente.');return c;}
function clientStatement(c){return {...c,courses:[],registryFlights:list(c.flights),extraPayments:list(c.payments)};}
function clientPaymentRecord(f,id){errorDate(f,[['date',true]]);const amount=cents(f.amount);if(!amount)throw Error('Ingresa un monto mayor que cero.');if(!SOURCES.includes(f.source))throw Error('Selecciona el origen del pago.');return {id,date:isoFecha(f.date),cents:amount,source:f.source,reference:String(f.reference||'').trim(),note:String(f.note||'').trim(),description:'Abono de cliente',createdAt:new Date().toISOString()};}
function recordClientPayment(school,cid,payment){const client=clientById(school,cid);client.payments ||= [];if(!client.payments.some(p=>p.id===payment.id))client.payments.push(payment);}
function addClientPayment(cid){openPayment('client:'+cid);}

function paymentPeople(){const school=data();return [...school.students.map(s=>({id:'student:'+s.id,name:s.name,kind:'Estudiante',record:s})),...list(school.registry?.clients).map(c=>({id:'client:'+c.id,name:c.name,kind:'Cliente',record:c}))].sort(comparePersonNames);}
function paymentMovements(person){if(!person)return [];const p=person.record;return person.id.startsWith('client:')?list(p.payments).map(e=>({...e,concept:'Cuenta de cliente'})):[...list(p.courses).flatMap(c=>list(c.payments).map(e=>({...e,concept:(COURSES[c.type]?.name||'')+' · '+(FEES[e.fee]||'')}))),...list(p.extraPayments).map(e=>({...e,concept:'Cuenta general'}))];}
function newClientRecord(school,f,id){
 const name=String(f.name||'').trim(),email=String(f.email||'').trim(),identity=String(f.identity||'').trim();
 if(!name)throw Error('Ingresa el nombre del cliente.');
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(list(school.registry?.clients).some(c=>norm(c.name)===norm(name)||(email&&norm(c.email)===norm(email))||(identity&&norm(c.identity)===norm(identity))))throw Error('Ya existe un cliente con ese nombre, correo o identificación. Revisa la lista antes de crear otro.');
 return {id,name,email,identity,phone:String(f.phone||'').trim(),address:String(f.address||'').trim(),notes:String(f.notes||'').trim(),createdAt:new Date().toISOString(),createdDate:today(),flights:[],payments:[]};
}
function addClient(){
 const id=uid();
 modal('Agregar cliente',input('name','Nombre completo / empresa','','text','required maxlength="160"')+input('identity','Cédula, pasaporte o RUC','','text','maxlength="60"')+input('phone','Celular','','tel','maxlength="40"')+input('email','Correo electrónico','','email','maxlength="180"')+input('address','Dirección','','text','maxlength="500"')+'<label class="school-full">Observaciones<textarea name="notes" maxlength="4000"></textarea></label>',async f=>{
  await change(school=>{const record=newClientRecord(school,f,id);school.registry ||= {entries:[],clients:[],destinations:[]};school.registry.clients ||= [];school.registry.clients.push(record);});
 });
}
function comparePersonNames(a,b){const x=String(a.name||'').trim(),y=String(b.name||'').trim();return (!x)-(!y)||x.localeCompare(y,'es',{sensitivity:'base',numeric:true});}
function clientsHtml(){const clients=[...list(data().registry?.clients)].sort(comparePersonNames);return '<div class="school-actions">'+button('+ Agregar cliente','new-client')+'</div><div class="school-rate-grid">'+clients.map(c=>{const st=statementData(clientStatement(c));return '<section class="card"><h3>'+esc(c.name)+'</h3><p>Saldo: '+statementBalance(st.servicesBalance)+'</p>'+equipmentHoursHtml(clientStatement(c),1)+'<div class="school-actions">'+button('Estado de cuenta','client-statement','data-client="'+esc(c.id)+'"')+button('Registrar pago','client-payment','data-client="'+esc(c.id)+'"')+'</div></section>';}).join('')+'</div>'+(!clients.length?'<div class="card">Todavía no hay clientes. Usa Agregar cliente o guarda un registro de chárter con un nombre nuevo.</div>':'');}
const panel=document.createElement('div');panel.id='panel-estudiantes';panel.className='aircraft-panel';contentEl.appendChild(panel);
const tab=document.createElement('div');tab.className='aircraft-tab';tab.innerHTML='<div class="tab-reg" style="font-size:10px">🎓 ESTUDIANTES / CLIENTES</div>';itinerariosTab.insertAdjacentElement('afterend',tab);
tab.addEventListener('click',()=>{document.querySelectorAll('.aircraft-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.aircraft-panel').forEach(p=>p.classList.remove('active'));tab.classList.add('active');panel.classList.add('active');render();});
function render(){
 const school=data();
 if(window.ROLE_VIEW?.ownStatement){const s=school.students[0]|| (school.registry?.clients?.[0]?clientStatement(school.registry.clients[0]):null);panel.innerHTML='<div class="aircraft-reg" style="font-size:20px;margin-bottom:16px">MI ESTADO DE CUENTA</div><section class="card" style="padding:18px" data-permission-page="estudiantes" data-permission-box="account" data-box-name="Estado de cuenta y abonos">'+(s?'<div class="school-actions"><button type="button" class="record-btn" data-own-statement-print>Imprimir / guardar PDF</button></div>'+statementHtml(s):'<p>No hay un expediente vinculado a tu correo verificado. Solicita al Director revisar el correo del expediente.</p>')+'</section>';const print=panel.querySelector('[data-own-statement-print]');if(print)print.onclick=()=>printSchoolHtml(statementHtml(s),'school-statement-print');return;}
 panel.innerHTML='<div class="school-header"><div><div class="aircraft-reg" style="font-size:20px">ESTUDIANTES / CLIENTES</div><p class="school-muted">HP Flight School · Seguimiento académico y financiero</p></div>'+'<div class="school-actions">'+button('Imprimir formulario en blanco','blank-registration')+button('+ Nuevo estudiante','new-student')+'</div></div><div class="school-nav">'+[['students','Estudiantes'],['clients','Clientes'],['rates','Tarifas de aeronaves'],['course-rates','Tarifas de servicios'],['intakes','Próximos cursos y correos']].map(([key,label])=>'<button class="record-btn" data-action="view" data-view="'+key+'" aria-pressed="'+(view===key)+'">'+label+'</button>').join('')+'</div><div id="school-content"></div>';
 const body=panel.querySelector('#school-content');
 if(view==='clients'){body.innerHTML=clientsHtml();return;}
 if(view==='rates'){body.innerHTML=ratesHtml(school);return;}
 if(view==='course-rates'){body.innerHTML=courseRatesHtml();return;}
 if(view==='intakes'){renderIntakes(body,school);return;}
 body.innerHTML='<div class="school-workspace"><aside class="card school-directory"><label>Buscar estudiante<input id="school-search" type="search" value="'+esc(query)+'" placeholder="Nombre, cédula, correo o celular"></label><label>Etapa<select id="school-stage"><option value="">Todas</option>'+options(STAGES,stageFilter)+'</select></label><div id="school-student-list"></div></aside><div id="school-student-profile"></div></div>';
 body.querySelector('#school-search').oninput=e=>{query=e.target.value;renderDirectory();};body.querySelector('#school-stage').onchange=e=>{stageFilter=e.target.value;renderDirectory();};renderDirectory();
 const s=school.students.find(s=>s.id===selected&&(!s.directoryKind||s.directoryKind==='student'));body.querySelector('#school-student-profile').innerHTML=s?profileHtml(s):'<div class="card school-empty"><h3>Expediente del estudiante</h3><p>Selecciona un estudiante o registra al primer interesado.</p><p>Cursos, pagos, horas y licencias se guardan en su expediente.</p></div>';
}
function renderDirectory(){
 const element=panel.querySelector('#school-student-list');if(!element)return;
 const students=data().students.filter(s=>(!s.directoryKind||s.directoryKind==='student')&&(!stageFilter||s.stage===stageFilter)&&[s.name,s.identity,s.email,s.phone].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort(comparePersonNames);
 element.innerHTML='<p class="school-muted">'+students.length+' estudiantes / clientes</p>'+students.map(s=>'<button class="school-student-button" data-action="select" data-student="'+esc(s.id)+'" aria-pressed="'+(selected===s.id)+'"><b>'+esc(s.name)+'</b><span>'+esc(s.stage)+' · '+esc(s.funding)+'</span></button>').join('');
}
function renderIntakes(body,school){
 const rows=noticeRows(school);
 body.innerHTML='<div class="card"><div class="school-row"><h3>Próximas fechas de cursos</h3>'+button('+ Fecha de curso','intake')+'</div><p class="school-muted">Los avisos se preparan dos meses calendario antes del inicio para interesados sin matrícula. Si el interesado ingresa después, el aviso aparece pendiente inmediatamente.</p><div class="school-intakes">'+school.intakes.slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(i=>'<div class="school-row school-ledger-entry"><span>'+esc(COURSES[i.type]?.name||i.type)+' · '+esc(fechaVista(i.startDate))+'<small class="school-muted"> Aviso: '+esc(fechaVista(twoMonthsBefore(i.startDate)))+'</small></span>'+button('Editar','intake','data-intake="'+esc(i.id)+'"')+'</div>').join('')+'</div></div><div class="card school-mail"><div class="school-row"><h3>Correos a interesados</h3>'+button('Configurar folleto','brochure')+'</div><p class="school-mail-status">Envío automático pendiente de conectar. No se envían correos desde este panel.</p><p class="school-muted">'+(school.brochureUrl?'Folleto configurado.':'Falta agregar el enlace al folleto.')+' Puedes preparar un correo y revisarlo en tu aplicación de correo.</p>'+rows.map(({student,intake,scheduled,due})=>'<div class="school-row school-ledger-entry"><div><b>'+esc(student.name)+'</b><p>'+esc(COURSES[intake.type].name)+' · Inicio '+esc(fechaVista(intake.startDate))+'</p><small>'+esc(fechaVista(scheduled))+' · '+(due?'Pendiente de envío':'Aviso previsto')+(student.email?'':' · Falta correo')+'</small></div>'+button('Ver correo','email','data-student="'+esc(student.id)+'" data-intake="'+esc(intake.id)+'"')+'</div>').join('')+(rows.length?'':'<p class="school-muted">No hay avisos: registra interesados, sus cursos de interés y las próximas fechas.</p>')+'</div>';
}
panel.addEventListener('click',event=>{
 const b=event.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,s=b.dataset.student,c=b.dataset.course;
 const handlers={
  'registry-edit':()=>window.Registro.edit(b.dataset.entry),
  'new-client':()=>addClient(),'client-statement':()=>showStatementRecord(()=>clientStatement(clientById(data(),b.dataset.client))),'client-payment':()=>addClientPayment(b.dataset.client),
  'add-service':()=>editService(),'edit-service':()=>editService(b.dataset.service),
  'blank-registration':()=>printSchoolHtml(blankRegistrationHtml(),'school-blank-print'),'delete-student':()=>deleteStudent(s),'delete-archived-course':()=>deleteArchivedCourse(s,c),statement:()=>showStatement(s),'course-rate':()=>editCourseRate(b.dataset.type),expense:()=>addExtra(s,'expenses'),'extra-payment':()=>addExtra(s,'extraPayments'),'void-extra':()=>voidExtra(s,b.dataset.kind,b.dataset.entry),
  'new-student':()=>editStudent(), 'edit-student':()=>editStudent(s),'print-student':()=>printStudent(s),select:()=>{selected=s;render();requestAnimationFrame(()=>{const profile=panel.querySelector('#school-student-profile');if(profile){profile.style.scrollMarginTop='80px';profile.scrollIntoView({block:'start',behavior:'instant'});}});},view:()=>{view=b.dataset.view;render();},
  'add-course':()=>addCourse(s),'add-tutoring':()=>addTutoring(s,c),'edit-course':()=>editCourse(s,c),'delete-course':()=>deleteCourse(s,c),payment:()=>addPayment(s,c,b.dataset.fee),flight:()=>logFlight(s,c),simulator:()=>logFlight(s,c,'simulador'),
  void:()=>voidEntry(s,c,b.dataset.kind,b.dataset.entry),rate:()=>editRate(b.dataset.reg),intake:()=>editIntake(b.dataset.intake),brochure:editBrochure,email:()=>showEmail(s,b.dataset.intake)
 };if(handlers[a])try{Promise.resolve(handlers[a]()).catch(e=>alert(e.message));}catch(e){alert(e.message);}
});
function decorateAircraftPanel(acPanel,reg){
 const header=acPanel.querySelector('.aircraft-toolbar')||acPanel.querySelector('.aircraft-detail-header');if(!header)return;
 let button=header.querySelector('.school-aircraft-rate');if(!button){button=document.createElement('button');button.className='record-btn school-aircraft-rate';button.type='button';button.onclick=()=>editRate(reg);header.appendChild(button);}
 const rate=data().rates[reg];button.textContent='Tarifa: '+(rate?money(rate.cents)+'/h':'sin definir');
}
function decorateRates(){fleet.forEach((ac,idx)=>{const p=document.getElementById('panel-'+idx);if(p)decorateAircraftPanel(p,ac.reg);const t=document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="'+idx+'"]');if(t){let label=t.querySelector('.school-tab-rate');if(!label){label=document.createElement('div');label.className='school-tab-rate';t.appendChild(label);}const rate=data().rates[ac.reg];label.textContent=rate?money(rate.cents)+'/h':'Tarifa sin definir';}});}
const PAYMENT_CONCEPTS={matricula:'Matrícula',material:'Material de estudio',teoria:'Curso teórico',vuelo:'Horas de vuelo',simulador:'Horas de SIM',tutoria:'Tutoría',charter:'Chárter',general:'Otros / cuenta general'};
// Banco options based on the Superintendencia de Bancos directory; custom banks remain editable.
const PAYMENT_BANKS=['Banco General','Banco Nacional de Panamá','Caja de Ahorros','Banistmo','BAC International Bank','Global Bank','Banesco','BANISI','Banco Davivienda (Panamá)','Banco Aliado','Credicorp Bank','Towerbank','Banco Lafise Panamá','Banco Delta'];
function paymentReceivers(){return window.getPaymentReceivers?.()||[];}
const PAYMENT_METHODS=['ACH','Yappy','TC','Efectivo'];
function paymentService(fee){return fee==='charter'?'charter':fee==='vuelo'?'flight':fee==='simulador'?'simulator':fee==='general'?'other':'courses';}
function receiptPerson(school,key){const i=key.indexOf(':'),kind=key.slice(0,i),id=key.slice(i+1);if(!['student','client'].includes(kind))throw Error('Selecciona estudiante o cliente.');return {kind,record:kind==='student'?studentById(school,id):clientById(school,id)};}
function resolvePaymentService(school,value){
 const name=String(value||'').trim(),norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
 const builtin=Object.entries(PAYMENT_CONCEPTS).find(([fee,label])=>norm(label)===norm(name)||norm(fee)===norm(name));
 if(builtin)return {fee:builtin[0],label:builtin[1],serviceId:''};
 const existing=list(school.services).find(s=>norm(s.name)===norm(name));
 return {fee:'general',label:existing?.name||name,serviceId:existing?.id||'',isNew:!existing};
}
function recordReceipt(school,key,f,id,attachment=null){
 school.paymentReceipts ||= [];
 const previous=school.paymentReceipts.find(r=>r.id===id);if(previous)return previous;
 const allocations=Array.isArray(f.allocations)?f.allocations:('serviceName' in f?[{serviceName:f.serviceName,amount:f.amount,targetCourse:f.targetCourse}]:Object.entries(PAYMENT_CONCEPTS).filter(([fee])=>String(f['amount_'+fee]||'').trim()&&Number(f['amount_'+fee])!==0).map(([fee,label])=>({serviceName:label,amount:f['amount_'+fee],targetCourse:f['target_'+fee]})));

 errorDate(f,[['date',true]]);
 if(!PAYMENT_METHODS.includes(f.method))throw Error('Selecciona cómo se realizó el pago.');
 const reference=String(f.reference||'').trim();
 if(['ACH','Yappy'].includes(f.method)&&!reference)throw Error('Ingresa el número de transferencia.');
 const receiver=paymentReceivers().find(user=>user.uid===f.receivedByUid);if(!receiver)throw Error('Selecciona un usuario autorizado para recibir el abono.');
 const receiverName=String(receiver.label||f.receiverName||'').trim();if(!receiverName||receiverName.includes('@'))throw Error('Ingresa el nombre del usuario que recibe, sin correo electrónico.');
 const {kind,record}=receiptPerson(school,key),lines=[];
 for(const item of allocations){
  const selected=resolvePaymentService(school,item.serviceName),fee=selected.fee,label=selected.label;if(!label)throw Error('Selecciona o escribe el servicio.');
  const amount=cents(String(item.amount||'').trim());if(amount===null||amount<=0)throw Error('El abono de '+label+' debe ser mayor que cero.');
  const courseId=String(item.targetCourse||''),course=courseId&&kind==='student'?courseById(record,courseId):null;
  if(courseId&&(!course||!courseFees(course).includes(fee)))throw Error('El curso no corresponde al concepto '+label+'.');
  lines.push({id:id+'-'+lines.length,fee,cents:amount,courseId:course?.id||'',courseName:course?COURSES[course.type].name:'',label,serviceId:selected.serviceId});
 }

 if(!lines.length)throw Error('Ingresa un abono mayor que cero.');
 if(!SOURCES.includes(f.source))throw Error('Selecciona el origen de fondos.');
 const total=lines.reduce((n,l)=>n+l.cents,0);if(!Number.isSafeInteger(total))throw Error('El monto es demasiado grande.');
 for(const line of lines){
  const service=resolvePaymentService(school,line.label);
  if(service.isNew){school.services ||= [];service.serviceId='service-'+line.id;school.services.push({id:service.serviceId,name:service.label,description:'',category:'otro',createdAt:new Date().toISOString()});}
  line.serviceId=service.serviceId;
 }
 const sequence=Math.max(Number(school.lastReceiptSequence)||0,...school.paymentReceipts.map(r=>Number(r.sequence)||0))+1;school.lastReceiptSequence=sequence;
 const receipt={id,sequence,number:String(sequence).padStart(6,'0')+'-'+panamaISO().slice(2,4),date:isoFecha(f.date),createdAt:new Date().toISOString(),issuedAt:emittedAt(),personKey:key,personName:record.name,identity:record.identity||'',payer:String(f.payer||record.name).trim(),receivedBy:receiverName,receivedByUid:receiver.uid,method:f.method,source:f.source,reference,bank:String(f.bank||'').trim(),note:String(f.note||'').trim(),lines,totalCents:total,attachment};
 for(const line of lines){
  const payment={id:line.id,receiptId:id,receiptNumber:receipt.number,serviceId:line.serviceId||'',fee:line.fee,service:paymentService(line.fee),date:receipt.date,cents:line.cents,source:receipt.source,method:receipt.method,reference:receipt.reference,note:receipt.note,description:'Abono · '+line.label,createdAt:receipt.createdAt};
  if(line.courseId){const c=courseById(record,line.courseId);c.payments ||= [];c.payments.push(payment);}
  else{const field=kind==='student'?'extraPayments':'payments';record[field] ||= [];record[field].push(payment);}
 }
 if(kind==='student'&&!manualStage(record.stage)){record.stage='En formación';record.enrolledDate ||= receipt.date;}
 school.paymentReceiverNames ||= {};school.paymentReceiverNames[receiver.uid]=receiverName;school.paymentReceipts.push(receipt);return receipt;
}
async function paymentPhoto(file){
 if(!file?.size)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Adjunta una foto JPG, PNG o WebP.');
 if(file.size>10*1024*1024)throw Error('La foto debe ser menor de 10 MB.');
 const url=URL.createObjectURL(file);try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo leer la foto.'));img.src=url;});
  const scale=Math.min(1,1400/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
  let image=canvas.toDataURL('image/jpeg',.8);if(image.length>500000)image=canvas.toDataURL('image/jpeg',.55);
  if(image.length>500000)throw Error('La foto es demasiado grande; usa una imagen más pequeña.');
  return {name:file.name,data:image};
 }finally{URL.revokeObjectURL(url);}
}
function paymentBuckets(school,key){
 const person=receiptPerson(school,key),p=person.record;
 return person.kind==='student'?[{owner:p,field:'extraPayments'},...[...list(p.courses),...list(p.deletedCourses)].map(c=>({owner:c,field:'payments'}))]:[{owner:p,field:'payments'}];
}
function removePaymentRecord(school,key,receiptId='',movementId=''){
 const receipts=list(school.paymentReceipts),receipt=receiptId?receipts.find(r=>r.id===receiptId&&r.personKey===key):receipts.find(r=>r.personKey===key&&list(r.lines).some(l=>l.id===movementId));
 if(receiptId&&!receipt)throw Error('El recibo ya no existe.');
 const buckets=paymentBuckets(school,key),movement=movementId&&buckets.flatMap(b=>list(b.owner[b.field])).find(p=>p.id===movementId);
 if(movementId&&!movement)throw Error('El movimiento ya no existe.');
 school.lastReceiptSequence=Math.max(Number(school.lastReceiptSequence)||0,...receipts.map(r=>Number(r.sequence)||0));
 const ids=new Set(receiptId?list(receipt.lines).map(l=>l.id):[movementId]);
 for(const b of buckets)b.owner[b.field]=list(b.owner[b.field]).filter(p=>!ids.has(p.id)&&!(receiptId&&p.receiptId===receiptId));
 if(receipt){
  if(receiptId)school.paymentReceipts=receipts.filter(r=>r.id!==receipt.id);
  else{
   receipt.lines=list(receipt.lines).filter(l=>l.id!==movementId);
   receipt.totalCents=receipt.lines.reduce((sum,l)=>sum+l.cents,0);
   if(!receipt.lines.length)school.paymentReceipts=receipts.filter(r=>r.id!==receipt.id);
  }
 }
}
function deletePaymentReceipt(key,id){
 const r=list(data().paymentReceipts).find(r=>r.id===id&&r.personKey===key);if(!r)return;
 protectedDeletion('¿Eliminar el recibo '+r.number+' de '+r.personName+' por '+money(r.totalCents)+' y todos sus movimientos de pago? Se actualizarán los saldos. Esta acción no se puede deshacer.',school=>removePaymentRecord(school,key,id));
}
function deletePaymentMovement(key,id){
 const p=paymentBuckets(data(),key).flatMap(b=>list(b.owner[b.field])).find(p=>p.id===id);if(!p)return;
 protectedDeletion('¿Eliminar este movimiento de pago por '+money(p.cents)+'? Se actualizarán los saldos y el total del recibo vinculado; si no quedan movimientos, también se eliminará el recibo. Esta acción no se puede deshacer.',school=>removePaymentRecord(school,key,'',id));
}
function receiptStatus(receipt){
 const school=data();let person;try{person=receiptPerson(school,receipt.personKey);}catch{return 'Expediente no disponible';}
 const payments=person.kind==='student'?[...list(person.record.extraPayments),...list(person.record.courses).flatMap(c=>list(c.payments)),...list(person.record.deletedCourses).flatMap(c=>list(c.payments))]:list(person.record.payments);
 const lines=receipt.lines.map(l=>payments.find(p=>p.id===l.id)),voids=lines.filter(p=>p?.voidedAt).length;
 return voids===lines.length?'ANULADO':voids?'PARCIALMENTE ANULADO':lines.some(p=>!p)?'Revisar movimientos vinculados':'';
}
function receiptNumber(r){
 if(!/^HP-/.test(r.number||''))return r.number||'';
 const year=r.createdAt?new Intl.DateTimeFormat('en',{year:'2-digit',timeZone:'America/Panama'}).format(new Date(r.createdAt)):(r.date||panamaISO()).slice(2,4);
 return String(r.sequence||Number(r.number.slice(3))).padStart(6,'0')+'-'+year;
}
function receiptReceiverName(r){
 if(r.receivedBy&&!r.receivedBy.includes('@')&&r.receivedBy!=='Administrador autorizado')return r.receivedBy;
 const name=data().paymentReceiverNames?.[r.receivedByUid]||paymentReceivers().find(u=>u.uid===r.receivedByUid)?.label||'';
 return name&&!name.includes('@')?name:'Nombre pendiente de registrar';
}
function receiptHtml(r,status=''){
 const copy=label=>'<article class="payment-receipt"><div class="receipt-number">Recibo de pago '+esc(receiptNumber(r))+'</div><div class="receipt-company"><img class="receipt-logo" src="receipt-logo.svg" alt="Helicópteros Personales S.A."><p>R.U.C. 1117805-1-563687 D.V. 07</p><p>TELS.: (507) 315-0887 / 315-1797</p><p>Albrook, Aeropuerto Marcos A. Gelabert, Hangar 4G.</p><b>'+label+'</b></div>'+(status?'<p class="payment-void">'+esc(status)+'</p>':'')+'<div class="payment-receipt-grid"><span><b>Fecha de emisión:</b> '+esc(r.issuedAt||fechaVista(r.date))+'</span><span><b>Estudiante / Cliente:</b> '+esc(r.personName)+'</span><span><b>Identificación:</b> '+esc(r.identity)+'</span><span><b>Método de pago:</b> '+esc(r.method)+'</span><span><b>Número de transferencia:</b> '+esc(r.reference)+'</span>'+(r.method==='Efectivo'?'':'<span><b>Banco:</b> '+esc(r.bank)+'</span>')+'<span><b>Fondos:</b> '+esc(r.source)+'</span></div><table><thead><tr><th>Concepto</th><th>Curso / cuenta</th><th>Abono (USD)</th></tr></thead><tbody>'+r.lines.map(l=>'<tr><td>'+esc(l.label)+'</td><td>'+esc(l.courseName||'Cuenta general')+'</td><td>'+money(l.cents)+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="2">TOTAL RECIBIDO</th><th>'+money(r.totalCents)+'</th></tr></tfoot></table>'+(r.note?'<p><b>Observaciones:</b> '+esc(r.note)+'</p>':'')+'<div class="receipt-signatures"><div><span><b>Pagado por:</b> '+esc(r.payer)+'</span><span class="receipt-sign-line">Firma</span></div><div><span><b>Recibido por:</b> '+esc(receiptReceiverName(r))+'</span><span class="receipt-sign-line">Firma</span></div></div></article>';
 return copy('COPIA DEL CLIENTE')+copy('COPIA DE ARCHIVO');
}
function showReceipt(id){
 const r=list(data().paymentReceipts).find(x=>x.id===id);if(!r)return;
 const dialog=document.createElement('dialog');dialog.className='record-dialog school-statement-dialog';
 dialog.innerHTML='<div class="school-actions"><button type="button" class="record-btn" data-receipt-print>Imprimir ambas copias / PDF</button><button type="button" class="record-btn" data-receipt-close>Cerrar</button></div>'+receiptHtml(r,receiptStatus(r))+(r.attachment?'<details><summary>Comprobante de transferencia</summary><img style="max-width:100%" src="'+esc(r.attachment.data)+'" alt="Comprobante de transferencia"></details>':'');
 document.body.appendChild(dialog);dialog.querySelector('[data-receipt-close]').onclick=()=>dialog.close();dialog.querySelector('[data-receipt-print]').onclick=()=>printSchoolHtml(receiptHtml(r,receiptStatus(r)),'school-receipt-print');dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();dialog.scrollTop=0;
}
function openPayment(key,defaultFee='',defaultCourse=''){
 let id=uid();const person=receiptPerson(data(),key),names=[...Object.values(PAYMENT_CONCEPTS),...list(data().services).map(s=>s.name)];
 modal('Crear abono · '+person.record.name,'<div class="school-full" data-payment-lines></div><button type="button" class="record-btn" data-add-payment-line>+ Agregar servicio / curso</button><p class="school-full"><b>Total del abono: <span data-payment-total>$0.00</span></b></p><datalist id="payment-services">'+[...new Set(names)].map(name=>'<option value="'+esc(name)+'"></option>').join('')+'</datalist>'+dateField('date','Fecha del pago',today(),true)+'<label>Método de pago<select name="method" required>'+options(PAYMENT_METHODS,'Efectivo')+'</select></label><label>Origen de fondos<select name="source">'+options(SOURCES,'Propio')+'</select></label>'+input('reference','Número de transferencia / referencia','','text','maxlength="120"')+input('bank','Banco / entidad','','text','list="payment-banks" maxlength="120" placeholder="Seleccionar o escribir"')+'<datalist id="payment-banks">'+PAYMENT_BANKS.map(bank=>'<option value="'+esc(bank)+'"></option>').join('')+'</datalist>'+input('payer','Pagado por',person.record.name,'text','maxlength="160"')+'<label>Recibido por<select name="receivedByUid" required>'+paymentReceivers().map(user=>'<option value="'+esc(user.uid)+'">'+esc(user.label||'Usuario autorizado · registrar nombre')+'</option>').join('')+'</select></label>'+(paymentReceivers().some(user=>!user.label)?input('receiverName','Nombre del usuario que recibe','','text','required maxlength="160"'): '')+'<label class="school-full">Foto del comprobante (opcional)<input type="file" name="proof" accept="image/jpeg,image/png,image/webp"></label><label class="school-full">Observaciones<textarea name="note" maxlength="1000"></textarea></label>',async(f,form)=>{
  f.allocations=[...form.querySelectorAll('[data-payment-line]')].map(row=>({serviceName:row.querySelector('[name="serviceName"]').value,amount:row.querySelector('[name="amount"]').value,targetCourse:row.querySelector('[name="targetCourse"]').value}));
  const attachment=await paymentPhoto(form.querySelector('[name="proof"]').files[0]);
  await change(school=>recordReceipt(school,key,f,id,attachment));
  setTimeout(()=>showReceipt(id),0);
 },dialog=>{
  const container=dialog.querySelector('[data-payment-lines]');
  const total=()=>{dialog.querySelector('[data-payment-total]').textContent=money([...container.querySelectorAll('[name="amount"]')].reduce((n,input)=>n+(cents(input.value)||0),0));};
  const addLine=(initial=false)=>{
   const row=document.createElement('div');row.className='payment-allocation';row.setAttribute('data-payment-line','');
   row.innerHTML=input('serviceName','Servicio',initial?PAYMENT_CONCEPTS[defaultFee]||'':'','text','list="payment-services" required maxlength="160"')+amountField('amount','Monto (USD)')+'<label>Aplicar al curso<select name="targetCourse"><option value="">Cuenta general</option></select></label><button type="button" class="record-btn" data-remove-line aria-label="Quitar servicio">×</button>';
   container.appendChild(row);row.querySelector('[name="amount"]').value='';
   const service=row.querySelector('[name="serviceName"]'),target=row.querySelector('[name="targetCourse"]');
   const refreshCourse=()=>{const current=target.value,fee=resolvePaymentService(data(),service.value).fee,courses=person.kind==='student'?list(person.record.courses).filter(c=>courseFees(c).includes(fee)):[];
    target.innerHTML='<option value="">Cuenta general</option>'+courses.map(c=>'<option value="'+esc(c.id)+'">'+esc(COURSES[c.type].name)+'</option>').join('');
    target.value=courses.some(c=>c.id===current)?current:initial&&fee===defaultFee&&courses.some(c=>c.id===defaultCourse)?defaultCourse:'';target.disabled=!courses.length;
   };service.oninput=refreshCourse;refreshCourse();row.querySelector('[name="amount"]').oninput=total;
   row.querySelector('[data-remove-line]').onclick=()=>{if(container.querySelectorAll('[data-payment-line]').length===1)return;if(window.confirm('¿Quitar este servicio del abono?')){row.remove();total();}};
  };
  dialog.querySelector('[data-add-payment-line]').onclick=()=>addLine();addLine(true);
  const refresh=()=>{dialog.querySelector('[name="reference"]').required=['ACH','Yappy'].includes(dialog.querySelector('[name="method"]').value);};dialog.querySelector('[name="method"]').onchange=refresh;refresh();
  dialog.paymentDraft=window.DraftRecovery?.bind('payment:'+key+':'+defaultFee+':'+defaultCourse,dialog.querySelector('form'),()=>({fields:DraftRecovery.fields(dialog),id,count:container.children.length}),draft=>{
   container.replaceChildren();for(let i=0;i<Math.min(draft.count,100);i++)addLine();
   DraftRecovery.applyFields(dialog,draft.fields);id=draft.id;total();refresh();
   const note=document.createElement('p');note.textContent='Revisa el abono y vuelve a adjuntar la foto del comprobante si corresponde. Aún no se ha registrado ningún pago.';dialog.querySelector('form').append(note);
  },'Abono de '+person.record.name);

 });
}

let paymentSelection='';
function filterPaymentPeople(people,kind,query){return people.filter(p=>(kind==='all'||p.id.startsWith(kind+':'))&&countrySearch(p.name+' '+(p.record.identity||'')).includes(countrySearch(query)));}
const paymentPanel=document.createElement('div');paymentPanel.className='aircraft-panel';paymentPanel.id='panel-registro-pago';contentEl.appendChild(paymentPanel);
const paymentTab=document.createElement('div');paymentTab.className='aircraft-tab';paymentTab.id='tab-registro-pago';paymentTab.innerHTML='<div class="tab-reg" style="font-size:10px">💳 REGISTRO DE PAGO</div>';itinerariosTab.insertAdjacentElement('beforebegin',paymentTab);
paymentTab.addEventListener('click',()=>{document.querySelectorAll('.aircraft-tab,.aircraft-panel').forEach(e=>e.classList.remove('active'));paymentTab.classList.add('active');paymentPanel.classList.add('active');renderPayments();});
function balanceActivity(record){
 const entries=items=>list(items).map(e=>[e.id||'',e.date||'',e.fee||'',Number(e.cents||0),Number(e.costCents||0),e.voidedAt||'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify({courses:list(record.courses).map(c=>({id:c.id,type:c.type,charges:courseFees(c).filter(f=>!['vuelo','simulador'].includes(f)).map(f=>[f,courseAmount(c,f)]),payments:entries(c.payments),flights:entries(c.flights)})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),payments:entries(record.extraPayments),flights:entries(record.registryFlights),expenses:entries(record.expenses)});
}
function balanceAlertPeople(school){return [...list(school.students).map(student=>({student,key:'student:'+student.id,kind:'Estudiante'})),...list(school.registry?.clients).map(c=>({student:clientStatement(c),key:'client:'+c.id,kind:'Cliente'}))];}
function lowBalanceStudents(school=data()){
 return balanceAlertPeople(school).map(row=>({...row,balance:(-statementData(row.student).servicesBalance||0)})).filter(row=>row.balance<50000&&school.balanceAlertDismissals?.[row.key]?.activity!==balanceActivity(row.student)).sort((a,b)=>a.balance-b.balance||a.student.name.localeCompare(b.student.name,'es'));
}
function dismissZeroBalanceAlert(school,key){
 const row=balanceAlertPeople(school).find(row=>row.key===key);if(!row)throw Error('No se encontró el expediente.');
 if(statementData(row.student).servicesBalance!==0)throw Error('Solo puedes quitar de la lista un saldo de $0.00.');
 school.balanceAlertDismissals ||= {};school.balanceAlertDismissals[key]={activity:balanceActivity(row.student),dismissedAt:new Date().toISOString()};
}
async function hideZeroBalanceAlert(key){
 if(!window.confirm('¿Quitar este saldo de $0.00 de la lista de alertas? El expediente y sus movimientos no se modificarán. Volverá a aparecer si cambia su actividad de saldo y queda por debajo de $500.00.'))return;
 try{await change(school=>dismissZeroBalanceAlert(school,key));}catch(error){window.alert(error.message);}
}
function renderBalanceAlerts(){
 let panel=document.getElementById('panel-alerta-saldos');
 if(!panel){
  panel=document.createElement('div');panel.id='panel-alerta-saldos';panel.className='aircraft-panel';contentEl.appendChild(panel);
  const tab=document.createElement('div');tab.id='tab-alerta-saldos';tab.className='aircraft-tab';tab.innerHTML='<div class="tab-reg" style="font-size:10px;color:#d90020">🚨 ALERTA DE SALDOS</div>';
  if(typeof statsTab!=='undefined')statsTab.insertAdjacentElement('afterend',tab);else paymentTab.insertAdjacentElement('afterend',tab);
  tab.onclick=()=>{document.querySelectorAll('.aircraft-tab,.aircraft-panel').forEach(e=>e.classList.remove('active'));tab.classList.add('active');panel.classList.add('active');renderBalanceAlerts();};
 }
 const rows=lowBalanceStudents();
 panel.innerHTML='<div class="school-header"><div><div class="aircraft-reg">🚨 ALERTA DE SALDOS</div><p class="school-muted">Saldo disponible menor de $500.00 · '+rows.length+' estudiantes / clientes</p></div></div><section class="card"><p class="school-muted">Abonos menos cargos por servicios registrados, según el estado de cuenta. Incluye saldos en cero y deudas.</p><div class="school-statement-table-wrap"><table class="school-statement-table"><thead><tr><th>Estudiante / Cliente</th><th>Celular</th><th>Saldo disponible</th><th>Estado</th><th></th></tr></thead><tbody>'+rows.map(({student:s,balance,key,kind})=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.phone||'')+'</td><td style="color:'+(balance<0?'#d90020':'#996600')+';font-weight:700">'+money(balance)+'</td><td>'+(balance<0?'Deuda':balance===0?'Sin saldo':'Saldo bajo')+'</td><td><button class="record-btn" data-balance-person="'+esc(key)+'">Estado de cuenta</button>'+(balance===0?'<button class="record-btn" data-hide-balance="'+esc(key)+'">Quitar de la lista</button>':'')+'</td></tr>').join('')+'</tbody></table></div>'+(!rows.length?'<p>Sin estudiantes o clientes con saldo menor de $500.00.</p>':'')+'</section>';
 panel.querySelectorAll('[data-balance-person]').forEach(b=>b.onclick=()=>{const key=b.dataset.balancePerson;if(key.startsWith('student:'))showStatement(key.slice(8));else showStatementRecord(()=>clientStatement(clientById(data(),key.slice(7))));});
 panel.querySelectorAll('[data-hide-balance]').forEach(b=>b.onclick=()=>hideZeroBalanceAlert(b.dataset.hideBalance));
}
function renderPayments(){
 renderBalanceAlerts();
 const people=paymentPeople(),person=people.find(p=>p.id===paymentSelection),receipts=list(data().paymentReceipts).filter(r=>r.personKey===paymentSelection).slice().reverse();
 paymentPanel.innerHTML='<div class="payment-page-heading">REGISTRO DE PAGO</div><section class="payment-launch"><img class="hp-payment-logo" src="hp-logo.svg?v=1" width="150" height="76" alt="Helicópteros Personales"><div class="payment-person-combo" data-person-combo><label>Estudiante / Cliente<input data-payment-person role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="payment-person-options" autocomplete="off" placeholder="Seleccionar o escribir nombre" value="'+esc(person?.name||'')+'"></label><div id="payment-person-options" class="payment-person-options" role="listbox" hidden></div></div><div class="school-actions"><button class="save-btn" data-payment-add '+(!person?'disabled':'')+'>＋ Crear abono</button></div></section><details class="payment-history"><summary>Recibos y movimientos</summary><section class="card"><h3>Recibos de pago</h3>'+receipts.map(r=>'<div class="school-ledger-entry"><strong>'+esc(receiptNumber(r))+' · '+esc(fechaVista(r.date))+' · '+money(r.totalCents)+'</strong><p>'+esc([r.method,r.reference,receiptStatus(r)].filter(Boolean).join(' · '))+'</p><button class="record-btn" data-receipt="'+esc(r.id)+'">Ver recibo / imprimir dos copias</button><button class="record-btn school-danger" data-delete-receipt="'+esc(r.id)+'">Eliminar recibo</button></div>').join('')+(!receipts.length?'<p class="school-muted">Sin recibos para esta persona.</p>':'')+'</section><section class="card"><h3>Movimientos de pago</h3>'+paymentMovements(person).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>'<div class="school-ledger-entry'+(p.voidedAt?' school-void':'')+'"><strong>'+esc(fechaVista(p.date))+' · '+money(p.cents)+(p.voidedAt?' · ANULADO':'')+'</strong><p>'+esc([p.description||p.concept,p.method,p.receiptNumber,p.source,p.reference,p.note].filter(Boolean).join(' · '))+'</p><button class="record-btn school-danger" data-delete-payment="'+esc(p.id)+'">Eliminar movimiento</button></div>').join('')+'</section></details>';
 const combo=paymentPanel.querySelector('[data-person-combo]'),field=paymentPanel.querySelector('[data-payment-person]'),box=paymentPanel.querySelector('#payment-person-options'),add=paymentPanel.querySelector('[data-payment-add]');let choices=[],position=-1;
 const close=()=>{box.hidden=true;field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');};
 const choose=id=>{paymentSelection=id;renderPayments();paymentPanel.querySelector('[data-payment-add]').focus();};
 const show=(all=false)=>{choices=filterPaymentPeople(people,'all',all?'':field.value);position=-1;
  box.innerHTML=choices.map((p,i)=>'<button type="button" role="option" aria-selected="false" id="payment-person-'+i+'" data-person-id="'+esc(p.id)+'">'+esc(p.name)+'<small>'+esc(p.kind)+(p.record.identity?' · '+esc(p.record.identity):'')+(choices.filter(x=>x.name===p.name&&x.kind===p.kind).length>1?' · '+esc(p.record.email||p.id):'')+'</small></button>').join('')||'<p>Sin coincidencias</p>';
  box.querySelectorAll('[data-person-id]').forEach(b=>b.onclick=()=>choose(b.dataset.personId));box.hidden=false;field.setAttribute('aria-expanded','true');field.removeAttribute('aria-activedescendant');
 };
 field.onfocus=()=>show(true);field.onclick=()=>show(true);
 field.oninput=()=>{paymentSelection='';add.disabled=true;paymentPanel.querySelector('.payment-history').hidden=true;show();};
 field.onkeydown=e=>{if(e.key==='Escape'){close();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(box.hidden)show();position=Math.max(0,Math.min(choices.length-1,position+(e.key==='ArrowDown'?1:-1)));box.querySelectorAll('[role="option"]').forEach((b,i)=>b.setAttribute('aria-selected',String(i===position)));if(choices[position])field.setAttribute('aria-activedescendant','payment-person-'+position);}if(e.key==='Enter'&&!box.hidden){e.preventDefault();if(choices[position]||choices.length===1)choose((choices[position]||choices[0]).id);}};
 // Safari may blur the input without focusing the option before its click fires.
 let selectingOption=false;
 box.onpointerdown=e=>{selectingOption=true;if(e.pointerType==='mouse')e.preventDefault();};
 box.onmousedown=e=>e.preventDefault();
 box.onpointerup=()=>{setTimeout(()=>{selectingOption=false;},0);};
 box.onpointercancel=()=>{selectingOption=false;if(!combo.contains(document.activeElement))close();};
 combo.onfocusout=e=>{if(!selectingOption&&!combo.contains(e.relatedTarget))close();};
 add.onclick=()=>{if(paymentSelection)openPayment(paymentSelection);};

 paymentPanel.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.receipt));
 paymentPanel.querySelectorAll('[data-delete-receipt]').forEach(b=>b.onclick=()=>deletePaymentReceipt(paymentSelection,b.dataset.deleteReceipt));
 paymentPanel.querySelectorAll('[data-delete-payment]').forEach(b=>b.onclick=()=>deletePaymentMovement(paymentSelection,b.dataset.deletePayment));
}

renderPayments();
function openSearchTarget(target){
 if(target.kind==='student'){if(!data().students.some(s=>s.id===target.id))return;view='students';query='';stageFilter='';selected=target.id;render();document.getElementById('school-student-profile')?.scrollIntoView({block:'start'});}
 if(target.kind==='client'){if(!list(data().registry?.clients).some(c=>c.id===target.id))return;view='clients';render();const b=[...panel.querySelectorAll('[data-client]')].find(e=>e.dataset.client===target.id);b?.closest('.card')?.scrollIntoView({block:'center'});}
 if(target.kind==='receipt'){const receipt=list(data().paymentReceipts).find(r=>r.id===target.id);if(!receipt)return;paymentSelection=receipt.personKey;renderPayments();const details=paymentPanel.querySelector('.payment-history');if(details)details.open=true;[...paymentPanel.querySelectorAll('[data-receipt]')].find(e=>e.dataset.receipt===target.id)?.click();}
}
window.School={openSearchTarget,modal,money,verifyDeletionKey:correctDeletionKey,courseName:type=>COURSES[type]?.name||type,refresh:()=>{render();decorateRates();renderPayments();},decorateAircraftPanel,hasDraft:()=>!!activeDialog?.dataset.dirty};
const oldDraft=window.hasDraftChanges;window.hasDraftChanges=()=>!!oldDraft?.()||window.School.hasDraft();
window.addEventListener('beforeunload',event=>{if(busy||window.School.hasDraft()){event.preventDefault();event.returnValue='';}});
render();decorateRates();window.STUDENTS_READY=true;
// Pure functions exposed for deterministic local verification; no student data is exported.
window.School.math={lowBalanceStudents,resolvePaymentService,recordReceipt,receiptHtml,paymentService,cents,courseSummary,paymentTotal,flightTotal,hoursTotal,twoMonthsBefore,noticeRows};
})();




























