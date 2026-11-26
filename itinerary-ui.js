'use strict';
// One UI for director and restricted-role sessions; all decisions are validated by the server.
(()=>{
 const E=window.HPItinerary,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const commandId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():'web-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const pretty=d=>String(d||'').split('-').reverse().join('/');
 const clock=value=>{const m=/^(\d{1,2}):([0-5]\d)$/.exec(String(value||''));if(!m||Number(m[1])>23)return 'Sin hora';const h=Number(m[1]);return (h%12||12)+':'+m[2]+' '+(h<12?'AM':'PM');};
 const range=q=>clock(q.start)+' – '+clock(q.end);
 const timeText=value=>String(value??'').replace(/\b([ap])\.\s*m\./gi,(_,p)=>p.toUpperCase()+'M').replace(/\b(\d{1,2}):([0-5]\d)(?:\s*(AM|PM)\b)?/gi,(all,h,m,p)=>p?Number(h)+':'+m+' '+p.toUpperCase():Number(h)<24?clock(h+':'+m):all);
 let api,onChange,root,model,date=E.panamaClock(new Date()).tomorrow,category='Todas',busy=false,loaded=false,noticeData={notices:[],alerts:[]},bell,lastRead=0,dialog,attempt=null,pendingFlightFocus=null,practiceMode=false,noticeSequence=0;
 let calendarMonth=E.panamaClock(new Date()).date.slice(0,7),calendarYear=calendarMonth.slice(0,4),calendarData=null,calendarBusy=false,calendarError='',calendarSequence=0,queuedDate=null;
 const field=(name,label,value,type='text')=>type==='time'?timeField(name,label,value):'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(name==='newDate'?'required':'')+'></label>';
 function timeField(name,label,value){
  const valid=/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''),h=valid?Number(value.slice(0,2)):null,minute=valid?value.slice(3):'';
  return '<fieldset class="hp-time-field" data-time-field="'+name+'"><legend>'+esc(label)+'</legend><div class="hp-time-parts"><input data-hour type="number" inputmode="numeric" min="1" max="12" step="1" required aria-label="'+esc(label)+': hora" value="'+(valid?(h%12||12):'')+'"><span aria-hidden="true">:</span><input data-minute type="number" inputmode="numeric" min="0" max="59" step="1" required aria-label="'+esc(label)+': minutos" value="'+minute+'"><select data-period required aria-label="'+esc(label)+': AM o PM"><option value="AM" '+(h<12?'selected':'')+'>AM</option><option value="PM" '+(h>=12?'selected':'')+'>PM</option></select></div><input type="hidden" name="'+name+'" value="'+esc(valid?value:'')+'"></fieldset>';
 }
 function bindTimes(container){
  container.querySelectorAll('[data-time-field]').forEach(group=>{
   const h=group.querySelector('[data-hour]'),m=group.querySelector('[data-minute]'),p=group.querySelector('[data-period]'),value=group.querySelector('input[type=hidden]');
   const update=()=>{const hour=Number(h.value),minute=Number(m.value);value.value=h.value!==''&&m.value!==''&&Number.isInteger(hour)&&hour>=1&&hour<=12&&Number.isInteger(minute)&&minute>=0&&minute<=59?String(hour%12+(p.value==='PM'?12:0)).padStart(2,'0')+':'+String(minute).padStart(2,'0'):'';};
   group.addEventListener('input',update);group.addEventListener('change',update);m.addEventListener('blur',()=>{if(m.value!==''&&m.checkValidity())m.value=m.value.padStart(2,'0');});update();
  });
 }
 const select=(name,label,rows,value,empty=false)=>'<label>'+esc(label)+'<select name="'+name+'"'+(empty?'':' required')+'>'+(empty?'<option value="">Sin seleccionar</option>':'')+rows.map(r=>'<option value="'+esc(r.id)+'" '+(String(r.id)===String(value)?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select></label>';

 const panamaRouteCodes=[
  {code:'MPTO',name:'Tocumen',category:'Aeródromo',system:'OACI'},
  {code:'PTY',name:'Tocumen',category:'Aeródromo',system:'IATA'},
  {code:'MPMG',name:'Marcos A. Gelabert',category:'Aeródromo',system:'OACI'},
  {code:'PAC',name:'Marcos A. Gelabert',category:'Aeródromo',system:'IATA'},
  {code:'MPDA',name:'Enrique Malek · David',category:'Aeródromo',system:'OACI'},
  {code:'MPBO',name:'José Ezequiel Hall · Bocas del Toro',category:'Aeródromo',system:'OACI'},
  {code:'MPCH',name:'Cap. Manuel Niño · Changuinola',category:'Aeródromo',system:'OACI'},
  {code:'MPPA',name:'Panamá Pacífico',category:'Aeródromo',system:'OACI'},
  {code:'MPEJ',name:'Enrique Jiménez · Colón',category:'Aeródromo',system:'OACI'},
  {code:'MPSM',name:'Cap. Scarlett Martínez · Río Hato',category:'Aeródromo',system:'OACI'},
  {code:'MPAC',name:'Achutupo',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPAI',name:'Ailigandí',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCL',name:'Cap. Alex H. Bosquez',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCE',name:'Chitré',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPVC',name:'Álvaro Berroa',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPAR',name:'Arenas',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPGU',name:'Augusto Vergara',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPBR',name:'Barú',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCA',name:'Caledonia',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCS',name:'Casaya',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMC',name:'Chame Mayor',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCO',name:'Coiba',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCJ',name:'Corazón de Jesús',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRE',name:'El Real',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPFE',name:'Fernando Eleta',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPFC',name:'Finca 45',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSS',name:'Finca 67',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPGA',name:'Garachiné',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPN',name:'Guillermo Palm',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPIO',name:'Ingenio Ofelina',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSR',name:'Ingenio Santa Rosa',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSJ',name:'Isla San José',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSE',name:'Islas Secas',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPJE',name:'Jaque',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPD',name:'Cap. Justiniano Montenegro',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPCM',name:'Cap. Krish E. Persaud',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPES',name:'La Especial',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPLY',name:'Lago Bay',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPLA',name:'Las Lajas',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMA',name:'Mamitupo',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMN',name:'Mansucum',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMF',name:'Miraflores',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMB',name:'Missions Beyond Aviation',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMU',name:'Mulatupo',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPOG',name:'Ogobsucum',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPI',name:'Piña',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPX',name:'Pixvae',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPH',name:'Playón Chico',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPOA',name:'Puerto Obaldía',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPPU',name:'Punta Cocos',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRA',name:'Raúl Arias E. · Isla Contadora',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRP',name:'Reserva Punta Patiño',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRG',name:'Cap. Reynaldo Guiraud',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRZ',name:'Río Azúcar',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPRS',name:'Río Sidra',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSA',name:'Rubén Cantú',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPSB',name:'Sambú',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPMI',name:'San Miguel',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPTI',name:'Ticantikí',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPTU',name:'Tubualá',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPUP',name:'Ustupo',category:'Aeródromo nacional',system:'OACI'},
  {code:'MPWN',name:'Wannukandí',category:'Aeródromo nacional',system:'OACI'},
  {code:'BDT',name:'Bocas del Toro',category:'VOR/DME',system:'VOR'},
  {code:'DAV',name:'David',category:'VOR/DME',system:'VOR'},
  {code:'FNC',name:'France',category:'DVOR/DME',system:'VOR'},
  {code:'PML',name:'La Palma',category:'VOR/DME',system:'VOR'},
  {code:'RHT',name:'Río Hato',category:'DVOR/DME',system:'VOR'},
  {code:'STG',name:'Santiago',category:'VOR/DME',system:'VOR'},
  {code:'TBG',name:'Taboga',category:'DVOR/DME',system:'VOR'},
  {code:'TUM',name:'Tocumen',category:'DVOR/DME',system:'VOR'},
  {code:'MPHH',name:'Hospital Santo Tomás',category:'Helipuerto',system:'OACI'},
  {code:'MPIR',name:'Importadora Ricamar',category:'Helipuerto',system:'OACI'},
  {code:'MPHM',name:'Megapolis',category:'Helipuerto',system:'OACI'},
  {code:'MPHU',name:'Punta Barco',category:'Helipuerto',system:'OACI'},
  {code:'MPHT',name:'The Panamá Clinic',category:'Helipuerto',system:'OACI'},
  {code:'MPOR',name:'Ocean Reef',category:'Helipuerto',system:'OACI'}
 ];
 function routeEntryMarkup(code,index){return '<label class="hp-route-entry">'+(index?'<span aria-hidden="true">-</span>':'')+'<input name="routePart'+(index+1)+'" data-route-part="'+index+'" type="text" minlength="3" maxlength="4" pattern="[A-Za-z0-9]{3,4}" required autocapitalize="characters" autocomplete="off" spellcheck="false" value="'+esc(code)+'" placeholder="MPMG" aria-label="Código '+(index+1)+' de la ruta"></label>';}
 function routeMarkup(value=''){
  const normalized=E.normalizeRoute(value),parts=E.routeError(normalized)?[]:normalized.split(' - '),codes=parts.length>=3?parts:['','',''];
  const options=panamaRouteCodes.slice().sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'})||a.code.localeCompare(b.code,'es')).map(row=>'<div class="hp-route-code-option" data-route-item data-search="'+esc((row.code+' '+row.name+' '+row.category+' '+row.system).toLocaleLowerCase('es'))+'"><button type="button" data-insert-route-code="'+esc(row.code)+'" aria-label="Agregar '+esc(row.name)+' - '+esc(row.code)+'">'+esc(row.name)+' - '+esc(row.code)+'</button></div>').join('');
  return '<div class="hp-full hp-route-field" data-route-field><div class="hp-route-heading"><span>Ruta o destino</span><button type="button" data-route-toggle aria-expanded="false">Consultar códigos nacionales</button></div><div class="hp-route-inputs" data-route-inputs aria-label="Tres códigos iniciales, separados por guiones">'+codes.map(routeEntryMarkup).join('')+'</div><div class="hp-route-actions"><button type="button" data-route-add>Agregar casilla</button><button type="button" data-route-remove-last '+(codes.length>3?'':'hidden')+'>Quitar última</button></div><input type="hidden" name="route" value="'+esc(codes.every(Boolean)?codes.join(' - '):'')+'"><div class="hp-route-catalog" data-route-catalog hidden><label>Buscar ciudad o aeropuerto<input type="search" data-route-search placeholder="Ej.: Chitré, MPCE, Río Hato"></label><div class="hp-route-code-list" data-route-list>'+options+'</div><p data-route-no-results hidden>No se encontraron códigos con esa búsqueda.</p></div><small>Indica al menos tres códigos OACI, IATA o VOR, separados por guiones. Puedes agregar más casillas; cada código tiene 3 o 4 caracteres.</small></div>';
 }
 function bindRouteFields(container){
  container.querySelectorAll('[data-route-field]').forEach(section=>{
   const inputs=section.querySelector('[data-route-inputs]'),hidden=section.querySelector('[name="route"]'),toggle=section.querySelector('[data-route-toggle]'),catalog=section.querySelector('[data-route-catalog]'),search=section.querySelector('[data-route-search]'),items=[...section.querySelectorAll('[data-route-item]')],empty=section.querySelector('[data-route-no-results]'),add=section.querySelector('[data-route-add]'),removeLast=section.querySelector('[data-route-remove-last]');
   let active=0;
   const fields=()=>[...section.querySelectorAll('[data-route-part]')];
   const update=()=>{const current=fields();for(const field of current)field.value=field.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);const values=current.map(field=>field.value),complete=values.every(Boolean);hidden.value=complete?values.join(' - '):'';const error=complete?E.routeError(hidden.value):'';for(const field of current)field.setCustomValidity(error);removeLast.hidden=current.length<=3;};
   const addField=(code='',focus=true)=>{const current=fields(),index=current.length,wrapper=document.createElement('span');wrapper.innerHTML=routeEntryMarkup(code,index);inputs.append(wrapper.firstElementChild);update();if(focus)fields()[index].focus();return fields()[index];};
   inputs.addEventListener('focusin',event=>{const index=fields().indexOf(event.target);if(index>=0)active=index;});
   inputs.addEventListener('input',update);inputs.addEventListener('change',update);
   add.addEventListener('click',()=>addField());
   removeLast.addEventListener('click',()=>{const current=fields();if(current.length<=3)return;current.at(-1).closest('.hp-route-entry').remove();const remaining=fields();active=remaining.length-1;update();remaining[active].focus();});
   toggle.addEventListener('click',()=>{catalog.hidden=!catalog.hidden;toggle.setAttribute('aria-expanded',String(!catalog.hidden));if(!catalog.hidden)search.focus();});
   search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase('es');let shown=0;for(const item of items){item.hidden=!!query&&!item.dataset.search.includes(query);if(!item.hidden)shown++;}empty.hidden=shown>0;});
   section.querySelectorAll('[data-insert-route-code]').forEach(button=>button.addEventListener('click',()=>{let current=fields(),index=active;if(current[index]?.value){const next=current.findIndex(field=>!field.value);if(next>=0)index=next;else{addField('',false);current=fields();index=current.length-1;}}current[index].value=button.dataset.insertRouteCode;active=index;update();current[index].focus();}));
   update();
  });
 }
 function flightAircraftChoices(state,type,role){return state.aircraft.filter(a=>a.status!=='grounded'&&E.canSchedule(role,a)&&E.canChooseFlightType(state,type,role,a));}
 function flightAircraftOptions(rows,selected){return rows.length?rows.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===selected?'selected':'')+'>'+esc(a.id+' · '+a.model)+'</option>').join(''):'<option value="">No hay aeronaves habilitadas para este tipo.</option>';}
 function refreshFlightAircraft(form){
  const selector=form.elements.aircraft,type=form.elements.flightType.value,rows=flightAircraftChoices(model.state,type,model.rights.role),selected=rows.some(a=>a.id===selector.value)?selector.value:rows[0]?.id||'';
  if(selector.dataset.flightAircraftType!==type||selector.value!==selected){selector.innerHTML=flightAircraftOptions(rows,selected);selector.dataset.flightAircraftType=type;selector.value=selected;}
 }

 const acName=id=>model.state.aircraft.find(a=>a.id===id)?.id||id;
 const pilotName=id=>model.state.pilots.find(p=>p.id===id)?.name||(String(id).startsWith('legacy-name:')?String(id).slice(12):'Piloto');
 const sortedPilots=rows=>rows.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es',{sensitivity:'base'})||String(a.id).localeCompare(String(b.id),'es'));
 const personName=id=>model.state.students.find(p=>p.id===id)?.name||'';
 function message(text,error=false){const p=root?.querySelector('[data-message]');if(p){p.textContent=timeText(text);p.className=error?'hp-error':'';}}
 function modal(title,body,submit){
  dialog?.close();const d=document.createElement('dialog');dialog=d;d.className='hp-itinerary-dialog';d.dataset.itineraryControl='true';
  d.innerHTML='<h2>'+esc(title)+'</h2><form>'+body+'<p class="hp-error" role="alert"></p><div class="hp-actions"><button type="button" data-close>Cancelar</button>'+(submit?'<button type="submit" class="hp-primary">Guardar</button>':'')+'</div></form>';
  document.body.appendChild(d);bindTimes(d);bindRouteFields(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>{d.remove();if(dialog===d)dialog=null;};
  if(submit)d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target;if(form.dataset.busy)return;form.dataset.busy='1';form.querySelector('[type=submit]').disabled=true;try{await submit(Object.fromEntries(new FormData(form)),form);d.close();}catch(error){form.querySelector('[role=alert]').textContent=timeText(error.message);}finally{delete form.dataset.busy;form.querySelector('[type=submit]').disabled=false;}};
  else d.querySelector('[data-close]').textContent='Cerrar';d.showModal();return d;
 }
 async function load(d=date){
  if(busy){queuedDate=d;return;}busy=true;root.setAttribute('aria-busy','true');root.querySelector('[data-retry]')?.setAttribute('hidden','');message(loaded?'Actualizando itinerario…':'Cargando itinerario por bloques…');
  try{const result=await api(practiceMode?'itinerary-practice-read':'itinerary-read',{date:d});if(result.version!==1)throw Error('No se pudo cargar la versión actual del itinerario. Intenta actualizar.');model=result;date=result.state.date;noticeSequence++;noticeData=result;loaded=true;acceptCalendar(result);render();focusPendingFlight();await onChange?.(result);}
  catch(e){if(!loaded)root.querySelector('[data-retry]')?.removeAttribute('hidden');message(e.message==='Operación no válida.'?'No se pudo cargar el itinerario. Intenta actualizar.':e.message,true);}
  finally{busy=false;root.setAttribute('aria-busy','false');const next=queuedDate;queuedDate=null;if(next&&next!==date)load(next);}
 }
 async function save(command,extra={}){
  const body={date,revision:model.state.revision,configurationRevision:model.state.configurationRevision,command,...extra},signature=JSON.stringify(body);
  if(attempt?.signature!==signature)attempt={signature,id:commandId()};
  const result=await api(practiceMode?'itinerary-practice-command':'itinerary-command',{...body,actionId:attempt.id});attempt=null;model=result;date=result.state.date;noticeSequence++;noticeData=result;acceptCalendar(result);render();message(result.actionWarning||'✓ Guardado en Firebase');await onChange?.(result);return result;
 }
 function acceptCalendar(result){calendarSequence++;calendarYear=calendarMonth.slice(0,4);calendarData=result.calendar?.year===calendarYear?result.calendar:null;calendarBusy=false;calendarError='';if(model?.rights.role==='director'&&!calendarData)loadCalendar(calendarYear);}
 async function loadCalendar(year){
  if(model?.rights.role!=='director')return;
  if(!/^[1-9]\d{3}$/.test(year))return;
  const sequence=++calendarSequence;calendarYear=year;calendarData=null;calendarError='';calendarBusy=true;renderCalendarView();
  try{const result=await api('itinerary-calendar',{year});if(sequence!==calendarSequence)return;if(result.version!==1||result.year!==year||!Array.isArray(result.days))throw Error('No se pudo cargar el calendario. Reintenta.');calendarData=result;}
  catch(e){if(sequence===calendarSequence)calendarError=e.message;}
  finally{if(sequence===calendarSequence){calendarBusy=false;renderCalendarView();}}
 }
 function moveCalendarMonth(delta){const [year,month]=calendarMonth.split('-').map(Number),next=new Date(Date.UTC(year,month-1+delta,1)),newYear=String(next.getUTCFullYear());calendarMonth=newYear+'-'+String(next.getUTCMonth()+1).padStart(2,'0');if(newYear!==calendarYear||calendarData?.year!==newYear)loadCalendar(newYear);else renderCalendarView();}
 function renderCalendarView(){
  const el=root?.querySelector('[data-year-calendar]');if(!el)return;
  const counts=new Map((calendarData?.year===calendarYear?calendarData.days:[]).map(d=>[d.date,d.count])),today=E.panamaClock(new Date()).date,[year,monthNumber]=calendarMonth.split('-').map(Number),month=String(monthNumber).padStart(2,'0'),first=new Date(calendarMonth+'-01T12:00:00Z'),length=new Date(Date.UTC(year,monthNumber,0)).getUTCDate(),title=new Intl.DateTimeFormat('es-PA',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
  el.setAttribute('aria-busy',String(calendarBusy));
  el.innerHTML='<div class="hp-calendar-heading"><h3>Calendario de vuelos</h3><div class="hp-calendar-controls"><button type="button" data-calendar-month="-1" aria-label="Mes anterior">‹</button><strong>'+esc(title)+'</strong><button type="button" data-calendar-month="1" aria-label="Mes siguiente">›</button></div></div><p class="hp-calendar-legend"><span aria-hidden="true"></span>Verde: días con vuelos agendados. Toca una fecha para ver su programación.</p><p role="status" aria-live="polite">'+esc(calendarBusy?'Cargando vuelos del año…':calendarError)+'</p>'+(calendarError?'<button type="button" data-calendar-retry>Reintentar calendario</button>':'')+'<div class="hp-calendar-months"><section class="hp-calendar-month" aria-label="'+esc(title)+'"><div class="hp-calendar-week" aria-hidden="true">'+['D','L','M','M','J','V','S'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="hp-calendar-days">'+'<span aria-hidden="true"></span>'.repeat(first.getUTCDay())+Array.from({length},(_,i)=>{const d=calendarYear+'-'+month+'-'+String(i+1).padStart(2,'0'),count=counts.get(d)||0;return '<button type="button" data-calendar-date="'+d+'" class="'+(count?'hp-has-flights ':'')+(d===date?'hp-selected-date':'')+'" aria-label="'+pretty(d)+(count?' · '+count+' vuelo'+(count===1?' agendado':'s agendados'):'')+'" aria-pressed="'+(d===date)+'"'+(d===today?' aria-current="date"':'')+'><span>'+(i+1)+'</span>'+(count?'<small>'+count+'</small>':'')+'</button>';}).join('')+'</div></section></div>';
  el.querySelectorAll('[data-calendar-month]').forEach(b=>b.onclick=()=>moveCalendarMonth(Number(b.dataset.calendarMonth)));
  el.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>load(b.dataset.calendarDate));
  el.querySelector('[data-calendar-retry]')?.addEventListener('click',()=>loadCalendar(calendarYear));
 }
 function visibleAircraft(a){const r=model.rights;if(practiceMode)return E.requestSelectable(a);return r.role==='pilot'?E.requestSelectable(a):r.role==='admin'?a.category!=='Monomotor':true;}
 function render(){
  const s=model.state,r=model.rights,requestGate=E.reservationGate(s),requestOpen=!requestGate,held=E.nightPublication(s,s.confirmed),heldIds=new Set(held.blockedIds),pending=s.requests.filter(q=>!s.cancelled.includes(q.id)&&q.status!=='approved'&&!s.confirmed.some(f=>f.sourceRequestId===q.id)),unusualHours=s.confirmed.filter(q=>E.operatingHoursWarning(q)),pilotRequestNotice=r.role==='pilot'?(timeText(requestGate)||(s.published?'El horario ya fue publicado.':'Reservas abiertas para mañana.'))+(!s.published?' Puedes modificar o eliminar tus solicitudes pendientes hasta que Dirección publique.':''):'';
  root.innerHTML='<div class="hp-top"><div><span class="hp-label">Programación de vuelos</span><h2>Itinerario por bloques</h2><small>Hora de Panamá · cierre diario a las 8:15 PM</small></div><label>Fecha de vuelo<div class="hp-itinerary-date"><input data-date type="date" aria-label="Abrir calendario de fecha de vuelo" value="'+date+'"></div></label></div><div class="hp-metrics"><div class="hp-metric"><small>'+(r.role==='pilot'?'Aeronaves seleccionables':'Aeronaves disponibles')+'</small><b>'+s.aircraft.filter(a=>visibleAircraft(a)&&(r.role==='pilot'?E.requestSelectable(a):E.bookable(a,date))).length+'</b></div><div class="hp-metric"><small>Solicitudes pendientes</small><b>'+pending.length+'</b></div><div class="hp-metric"><small>Horario</small><b>'+(s.published?'Publicado':s.draftMode?'Borrador editable':'Por publicar')+'</b></div></div><div data-director-alerts></div>'+(s.draftMode?'<div class="hp-notice hp-warning" role="status"><b>Borrador editable de Dirección.</b> Solo Dirección lo ve antes de publicar; el horario se publica automáticamente a las 8:15 p. m. · Último cambio '+esc(s.draftUpdatedAt||'')+'</div>':'')+(r.settings&&unusualHours.length?'<div class="hp-notice hp-warning" role="alert"><b>Alerta de horario:</b> hay '+unusualHours.length+' vuelo(s) fuera del horario habitual de 6:30 a. m. a 6:30 p. m. Revisa el bloque nocturno; nunca se permite terminar después de las 8:00 p. m.</div>':'')+(r.settings&&s.draftPlan?.warnings?.length?'<div class="hp-notice hp-warning" role="alert"><b>Alertas del horario:</b> '+s.draftPlan.warnings.map(esc).join(' ')+'</div>':'')+'<p class="hp-notice">Horario para monomotores: '+(s.scheduleWindow?esc(range(s.scheduleWindow)):'horarios habituales de cada aeronave')+(s.published?'':' · solicitudes de monomotor fuera de este rango se ajustarán al publicar')+'</p>'+(s.nightEnabled?'<div class="hp-night">Nocturnos Habilitados <small>'+pretty(date)+'</small></div>':'')+(held.nightCount?'<p class="hp-notice '+(!held.ready?'hp-warning':'')+'">'+(held.ready?'Nocturnos: '+held.count+' aeronaves.':esc(timeText(held.reason)))+'</p>':'')+'<p class="hp-notice">'+esc(r.role==='pilot'?(timeText(E.reservationGate(s))||'Reservas abiertas para mañana. Puedes modificar la duración de tu solicitud.'):'Los exámenes de vuelo tienen prioridad sobre las demás solicitudes pendientes. Los vuelos confirmados de multimotores y helicópteros no se mueven automáticamente.')+'</p><div class="hp-tools"><label>Categoría<select data-category>'+['Todas','Monomotor','Multimotor','Helicóptero'].map(c=>'<option '+(c===category?'selected':'')+'>'+c+'</option>').join('')+'</select></label><button data-refresh>Actualizar</button>'+(r.create?'<button class="hp-primary" data-manual>Agendar vuelo</button>':'')+(r.settings?'<button data-window '+(s.published?'disabled':'')+'>Horario monomotores</button><button data-priorities>Prioridades de asignación</button><button data-types>Aeronaves por tipo de vuelo</button><button data-fleet>Prioridad de monomotores</button><button data-preview>Revisar cierre</button><button class="hp-primary" data-publish '+(s.published?'disabled':'')+'>Publicar horario</button><label class="hp-check"><input type="checkbox" data-night '+(s.nightEnabled?'checked':'')+'>Habilitar 6:30 PM – 8:00 PM en esta fecha</label>':'')+'</div><p data-message role="status" aria-live="polite"></p><section data-board-section><span class="hp-label">Calendario por aeronave</span><div class="hp-grid" data-board></div></section><section class="hp-section" style="margin-top:20px" data-flights><span class="hp-label">Vuelos del día</span><h3>'+(s.draftMode?'Borrador del horario':'Vuelos confirmados')+'</h3><div data-flight-list></div></section><section class="hp-section" data-open-slots '+(r.role==='pilot'&&(s.openSlots||[]).length?'':'hidden')+'><span class="hp-label">Espacios liberados</span><h3>Vuelos disponibles para tomar</h3><div data-open-slot-list></div></section><section class="hp-section" data-itinerary-requests><span class="hp-label">Solicitudes de vuelos</span><h3>'+(r.role==='pilot'?'Mis solicitudes':'Solicitudes y asignaciones')+'</h3><small>Una solicitud pendiente no equivale a un vuelo confirmado.</small><div data-requests></div></section>';
  if(practiceMode){
   const panama=E.panamaClock(s.now),gate=requestGate;
   root.insertAdjacentHTML('afterbegin','<div class="hp-night" role="status">SIMULACIÓN · itinerario temporal; no modifica los vuelos reales ni envía avisos del horario oficial. Reloj '+(s.simulatedTime?'simulado':'real')+': '+esc(clock(panama.time))+'. '+esc(gate?timeText(gate):'Solicitudes abiertas para mañana.')+'</div>');
   if(r.settings){
    root.insertAdjacentHTML('beforeend','<section class="hp-section" data-practice-clock><span class="hp-label">Control de práctica</span><h3>Reloj simulado de Panamá</h3><p>Las solicitudes de los pilotos abren a las 12:01 p. m. y cierran a las 8:00 p. m. para el día siguiente. El reloj simulado solo afecta este itinerario.</p><label>Hora de práctica (24 h)<input type="text" inputmode="numeric" maxlength="5" placeholder="12:01" autocomplete="off" data-practice-clock-time value="'+esc(s.simulatedTime||'')+'"></label><div class="hp-buttons"><button data-practice-clock-apply>Aplicar hora</button><button data-practice-clock-real>Usar hora real</button></div><p>'+esc(s.simulatedTime?'Hora simulada':'Hora real')+': '+esc(clock(panama.time))+'. '+esc(gate?timeText(gate):'Solicitudes abiertas para mañana.')+'</p><hr><h3>Aeronaves operativas para la simulación</h3><p>Este ajuste solo afecta el itinerario temporal.</p>'+s.aircraft.map(a=>'<label class="hp-row">'+esc(a.id)+' · '+esc(a.model)+'<select data-practice-status="'+esc(a.id)+'"><option value="operativo" '+(a.status==='operativo'?'selected':'')+'>Operativa</option><option value="mantenimiento" '+(a.status==='mantenimiento'?'selected':'')+'>Mantenimiento</option><option value="grounded" '+(a.status==='grounded'?'selected':'')+'>Grounded</option></select></label>').join('')+'</section>');
   }
  }
  if(r.role==='director'&&!practiceMode)root.insertAdjacentHTML('beforeend','<section class="hp-year-calendar" data-year-calendar aria-label="Calendario de vuelos"></section>');
  if(r.boxes){root.querySelector('[data-board-section]').hidden=!r.boxes.planner;root.querySelector('[data-flights]').hidden=!r.boxes.flights&&!r.boxes.planner;root.querySelector('[data-itinerary-requests]').hidden=!r.boxes.requests;}
  root.querySelector('[data-board]').innerHTML=s.aircraft.filter(a=>visibleAircraft(a)&&(category==='Todas'||category===a.category)).sort((a,b)=>a.rank-b.rank).map(a=>{const maintenance=a.status==='mantenimiento',grounded=a.status==='grounded',canRequest=r.request&&E.requestSelectable(a);return '<article class="hp-aircraft '+(maintenance||grounded?'hp-maintenance':'')+'" aria-label="'+a.id+(maintenance?' · MANTENIMIENTO':grounded?' · GROUNDED':'')+'"><div class="hp-aircraft-head" style="border-top-color:'+(maintenance||grounded?'#b4232d':a.color.startsWith('#')?a.color:'#315b9a')+'"><div class="hp-tail">'+a.id+'</div><small>'+esc(a.model)+' · '+a.category+'</small><p><span class="hp-status '+(a.status==='operativo'?'hp-green':'hp-red')+'">● '+esc(maintenance?'MANTENIMIENTO':grounded?'GROUNDED':a.status==='operativo'?'Operativa':a.status)+'</span></p>'+(a.release?.enabled?'<p><small>Disponibilidad prevista '+clock(a.release.from)+' – '+clock(a.release.until||a.slots.at(-1)?.end||'18:30')+'</small></p>':'')+(r.settings?'<div class="hp-buttons"><button data-config="'+a.id+'">Bloques y disponibilidad</button><button data-priority="'+a.id+'">Pilotos prioritarios</button></div>':'')+'</div><div class="hp-blocks">'+(canRequest?E.requestSlots(a,date):a.slots.filter(b=>b.id!=='b5'||a.night)).filter(b=>E.minutes(b.end)-E.minutes(b.start)>=E.MIN_ASSIGNMENT_MINUTES).map(b=>{const flightCount=s.confirmed.filter(f=>f.aircraft===a.id&&E.overlaps(b,f)).length,count=pending.filter(q=>q.aircraft===a.id&&E.overlaps(q,b)).length;const disabled=grounded||r.request&&!canRequest;return '<div class="hp-slot"><div><strong>'+range(b)+'</strong><small>'+flightCount+' confirmados · '+count+' solicitudes</small></div><button '+(disabled?'disabled':'')+' data-slot="'+a.id+':'+b.id+'">'+(grounded?'GROUNDED':maintenance&&r.request?'Solicitar · alerta':r.request?(practiceMode&&!requestOpen?'Solicitudes cerradas':'Solicitar'):'Ver bloques')+'</button></div>';}).join('')+'</div></article>';}).join('')||'<p>No hay aeronaves disponibles para esta categoría y fecha.</p>';
  root.querySelector('[data-flight-list]').innerHTML=s.confirmed.slice().sort((a,b)=>a.start.localeCompare(b.start)).map(q=>flightRow(q,heldIds.has(q.id)||q.publicationStatus==='held')).join('')||'<p>No hay vuelos confirmados en esta fecha.</p>';
  root.querySelector('[data-open-slot-list]').innerHTML=(s.openSlots||[]).map(q=>'<div class="hp-row"><div><b>'+esc(q.aircraft)+' · '+range(q)+'</b><p>Este espacio puede ser tomado por un piloto habilitado.</p></div><button class="hp-primary" data-claim-slot="'+esc(q.id)+'">Tomar espacio</button></div>').join('');
  const ownRequests=pending.filter(q=>r.role!=='pilot'||q.pilot===r.pilot);
  root.querySelector('[data-requests]').innerHTML=ownRequests.map(q=>'<div class="hp-row"><div><b>'+esc(q.aircraft)+' · '+esc(pilotName(q.pilot))+'</b>'+(q.route?'<p>Ruta o destino: '+esc(q.route)+'</p>':'')+'<p>'+range(q)+' · '+esc(E.flightTypeLabel(q.flightType,q.aircraft))+'</p>'+(q.delegationNumber&&(r.role==='director'||q.pilot===r.pilot)?'<p>Número de delegación: '+esc(q.delegationNumber)+'</p>':'')+'<small>'+esc(timeText(s.lastResults.find(x=>x.id===q.id)?.reason||'Pendiente de asignación'))+'</small></div><div class="hp-buttons">'+(r.settings?(s.published?'<button class="hp-danger" data-request-cancel="'+esc(q.id)+'" data-request-delete="true">Retirar solicitud pendiente</button>':'<button data-approve="'+esc(q.id)+'">Aprobar y fijar</button><button class="hp-danger" data-request-cancel="'+esc(q.id)+'" data-request-delete="true">Eliminar solicitud</button>'):'')+(r.request&&!s.published&&q.pilot===r.pilot?'<button data-request-edit="'+esc(q.id)+'">Modificar</button><button class="hp-danger" data-request-cancel="'+esc(q.id)+'">Eliminar mi solicitud</button>':'')+'</div></div>').join('')||'<p>No hay solicitudes pendientes.</p>';
  root.querySelector('[data-date]').onchange=e=>{if(e.target.value)load(e.target.value);};
  root.querySelectorAll('[data-practice-status]').forEach(el=>el.onchange=async()=>{try{await api('itinerary-practice-status',{aircraft:el.dataset.practiceStatus,status:el.value});await load(date);}catch(e){message(e.message,true);await load(date);}});
  const applyPracticeClock=async time=>{try{await api('itinerary-practice-clock',{time});await load(date);message(time?'Hora simulada aplicada.':'Se restauró la hora real.');}catch(e){message(e.message,true);await load(date);}};
  root.querySelector('[data-practice-clock-apply]')?.addEventListener('click',()=>{const time=root.querySelector('[data-practice-clock-time]')?.value.trim()||'';if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){message('Escribe una hora válida en formato 24 h, por ejemplo 12:01.',true);return;}applyPracticeClock(time);});
  root.querySelector('[data-practice-clock-real]')?.addEventListener('click',()=>applyPracticeClock(null));
  root.querySelector('[data-category]').onchange=e=>{category=e.target.value;render();};root.querySelector('[data-refresh]').onclick=()=>load();
  root.querySelector('[data-manual]')?.addEventListener('click',()=>flightDialog());
  root.querySelector('[data-window]')?.addEventListener('click',windowDialog);
  root.querySelector('[data-priorities]')?.addEventListener('click',prioritySettingsDialog);root.querySelector('[data-types]')?.addEventListener('click',typeDialog);root.querySelector('[data-fleet]')?.addEventListener('click',fleetDialog);
  root.querySelector('[data-preview]')?.addEventListener('click',previewDialog);
  root.querySelector('[data-publish]')?.addEventListener('click',async()=>{if(confirm(practiceMode?'¿Publicar la SIMULACIÓN del '+pretty(date)+'? Se enviará un correo marcado como simulación.':'¿Publicar el horario del '+pretty(date)+' y avisar a todos los usuarios?'))try{await save('publish');}catch(e){message(e.message,true);}});
  root.querySelector('[data-night]')?.addEventListener('change',async e=>{try{await save('settings',{nightEnabled:e.target.checked});}catch(error){e.target.checked=!e.target.checked;message(error.message,true);}});
  root.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{const [id,slot]=b.dataset.slot.split(':'),a=s.aircraft.find(a=>a.id===id),block=(r.request?E.requestSlots(a,date):a.slots).find(b=>b.id===slot);if(r.request)requestDialog({aircraft:id,slot,...block,id:undefined});else detailsDialog(a,block);});
  root.querySelectorAll('[data-config]').forEach(b=>b.onclick=()=>configDialog(b.dataset.config));root.querySelectorAll('[data-priority]').forEach(b=>b.onclick=()=>priorityDialog(b.dataset.priority));
  root.querySelectorAll('[data-edit-flight]').forEach(b=>b.onclick=()=>flightDialog(s.confirmed.find(f=>f.id===b.dataset.editFlight)));
  root.querySelectorAll('[data-cancel-flight]').forEach(b=>b.onclick=()=>modal('Cancelar vuelo','<label class="hp-full">Motivo de la cancelación<textarea name="reason" required maxlength="500" rows="4" placeholder="Escribe el motivo"></textarea></label>',async f=>save('cancel-flight',{id:b.dataset.cancelFlight,reason:f.reason})));
  root.querySelectorAll('[data-claim-slot]').forEach(b=>b.onclick=()=>claimSlotDialog(s.openSlots.find(x=>x.id===b.dataset.claimSlot)));
  root.querySelectorAll('[data-request-edit]').forEach(b=>b.onclick=()=>requestDialog(s.requests.find(q=>q.id===b.dataset.requestEdit)));
  root.querySelectorAll('[data-request-cancel]').forEach(b=>b.onclick=async()=>{const q=s.requests.find(q=>q.id===b.dataset.requestCancel),label=b.dataset.requestDelete==='true'?(s.published?'¿Retirar la solicitud pendiente no asignada de '+pilotName(q?.pilot)+' del horario publicado? Los vuelos confirmados se conservarán.':'¿Eliminar la solicitud pendiente de '+pilotName(q?.pilot)+'?'):'¿Eliminar tu solicitud pendiente?';if(confirm(label))try{await save('cancel-request',{id:b.dataset.requestCancel});}catch(e){message(e.message,true);}});
  root.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{const q=s.requests.find(q=>q.id===b.dataset.approve),a=s.aircraft.find(a=>a.id===q.aircraft);if(confirm('¿Aprobar y fijar '+q.aircraft+' · '+range(q)+' · '+pilotName(q.pilot)+'?'+(a.status!=='operativo'?'\nADVERTENCIA: la aeronave está '+a.status+'.':'')))try{await save('approve',{id:q.id,acknowledge:true});}catch(e){message(e.message,true);}});
  renderCalendarView();renderAlerts();updateBell();
 }
 function flightRow(q,held){
  const r=model.rights,person=personName(q.studentId)||q.studentName||'',detail=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
  const aircraft=model.state.aircraft.find(a=>a.id===q.aircraft),maintenance=aircraft&&['mantenimiento','grounded'].includes(aircraft.status);
  const content=r.role==='director'?'<dl class="hp-flight-details">'+detail('Aeronave',q.aircraft)+detail('Hora de inicio y fin',range(q))+detail('Ruta o destino',q.route||'Sin registrar')+detail('Cliente / Estudiante',person||'Sin asignar')+detail('Piloto / Instructor',pilotName(q.pilot))+detail('Tipo de vuelo',E.flightTypeLabel(q.flightType,q.aircraft))+(q.delegationNumber?detail('Número de delegación',q.delegationNumber):'')+(q.socioName?detail('Socio',q.socioName):'')+'</dl><p class="hp-flight-note"><strong>Observaciones:</strong> '+esc(q.note||'Sin observaciones registradas')+'</p>':'<b>'+esc(q.aircraft)+' · '+range(q)+'</b><p>'+esc(pilotName(q.pilot))+(q.studentId?' · '+esc(person):'')+'</p>'+(q.route?'<p>Ruta o destino: '+esc(q.route)+'</p>':'')+(q.pilot===r.pilot&&q.delegationNumber?'<p>Número de delegación: '+esc(q.delegationNumber)+'</p>':'');
  return '<div class="hp-row '+(maintenance?'hp-maintenance-flight':'')+'" data-flight-id="'+esc(q.id)+'" tabindex="-1"><div>'+content+(maintenance?'<strong class="hp-maintenance-label">'+(aircraft.status==='grounded'?'GROUNDED':'MANTENIMIENTO')+'</strong>':'')+'<small>'+esc(E.flightTypeLabel(q.flightType,q.aircraft))+(q.directorApproved?' · Aprobado por director · fuera de prioridades':'')+(q.relocation?' · Reubicado desde '+esc(q.relocation.from):'')+(q.relocationPending?' · Requiere revisión del director':'')+(held?' · SIN PUBLICAR'+(q.validationHold?' · '+esc(timeText(q.validationHold)):' · mínimo nocturno'):'')+'</small></div><div class="hp-buttons">'+(r.edit?'<button data-edit-flight="'+esc(q.id)+'">Modificar</button>':'')+(r.edit||E.canCancelRelocated(model.state,q,r.pilot,model.state.now)?'<button class="hp-danger" data-cancel-flight="'+esc(q.id)+'">Cancelar vuelo</button>':'')+'</div></div>';
 }
 function detailsDialog(a,b){const s=model.state;modal(a.id+' · '+range(b),'<div class="hp-notice">'+esc(a.status)+(a.release?.enabled?' · Disponible '+clock(a.release.from)+' – '+clock(a.release.until||a.slots.at(-1)?.end||'18:30'):'')+'</div>'+s.confirmed.filter(q=>q.aircraft===a.id&&E.overlaps(q,b)).map(q=>'<p><b>'+range(q)+'</b> · '+esc(pilotName(q.pilot))+'</p>').join('')+'<p>'+s.requests.filter(q=>q.aircraft===a.id&&E.overlaps(q,b)&&!s.cancelled.includes(q.id)).length+' solicitudes en este bloque.</p>');}
 function personKey(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
 function validPersonPhone(value){const raw=String(value||'').trim();return /^[+0-9().\s-]+$/.test(raw)&&/^\+?\d{7,15}$/.test(raw.replace(/[().\s-]/g,''));}
 function personRows(){return model.state.students.slice().sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'})||a.id.localeCompare(b.id,'es'));}
 function personFieldsMarkup(q={}){
  const s=model.state,rows=personRows(),person=s.students.find(p=>p.id===q.studentId),initialName=person?.name||q.studentName||(q.flightType==='socio'?q.socioName:'')||'',kindDefault=['charter','socio'].includes(q.flightType)?'client':'student';
  const existingOptions=rows.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===q.studentId?'selected':'')+'>'+esc(p.name)+' · '+(p.kind==='client'?'Cliente':'Estudiante')+'</option>').join('');
  const matchOptions=rows.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+(p.kind==='client'?'Cliente':'Estudiante')+'</option>').join('');
  return '<div class="hp-full hp-person-fields" data-person-fields><label class="hp-full">Elegir expediente existente<select name="existingStudentId"><option value="">Selecciona un estudiante o cliente existente</option>'+existingOptions+'</select><small>La lista incluye estudiantes y clientes en orden alfabético.</small></label><div class="hp-full hp-person-lookup"><label>Estudiante o cliente<input name="studentName" required maxlength="120" autocomplete="off" aria-autocomplete="list" aria-controls="hp-person-suggestions" aria-expanded="false" value="'+esc(initialName)+'" placeholder="Escribe para buscar"><small>Escribe las primeras letras para ver coincidencias.</small></label><div class="hp-person-suggestions" id="hp-person-suggestions" role="listbox" aria-label="Estudiantes y clientes coincidentes" data-person-suggestions hidden></div></div><input type="hidden" name="studentId" value="'+esc(q.studentId||'')+'"><label class="hp-full" data-person-match hidden>Hay varios expedientes con este nombre<select name="personMatchId"><option value="">Selecciona el expediente</option>'+matchOptions+'</select></label><p class="hp-full hp-notice" data-person-status></p><div class="hp-full" data-person-new hidden><label>Tipo de expediente<select name="newPersonKind"><option value="student" '+(kindDefault==='student'?'selected':'')+'>Estudiante</option><option value="client" '+(kindDefault==='client'?'selected':'')+'>Cliente</option></select></label><label>Cédula<input name="personIdentity" type="text" maxlength="40" autocomplete="off"></label><label>Correo<input name="personEmail" type="email" maxlength="200" autocomplete="off"></label><label>Celular<input name="personPhone" type="tel" maxlength="30" autocomplete="tel" inputmode="tel" placeholder="Ej. número nacional o internacional"><small>Acepta números de Panamá o del extranjero, con 7 a 15 dígitos.</small></label></div><input type="hidden" name="socioName" value="'+esc(q.socioName||'')+'"></div>';
 }
 function choosePersonSuggestion(form,button){
  const input=form.elements.studentName,refresh=form.__personRefresh||(()=>{});
  if(button.hasAttribute('data-person-create')){
   delete input.dataset.personSelectedKey;form.elements.existingStudentId.value='';form.elements.personMatchId.value='';form.elements.studentId.value='';form.dataset.personCreateNewKey=personKey(input.value);syncPersonFields(form,form.elements.flightType.value);refresh();input.focus();return;
  }
  const person=personRows().find(p=>p.id===button.dataset.personSuggestion);if(!person)return;
  delete form.dataset.personCreateNewKey;input.value=person.name;input.dataset.personSelectedKey=personKey(person.name);form.elements.existingStudentId.value=person.id;form.elements.personMatchId.value=person.id;form.elements.studentId.value=person.id;syncPersonFields(form,form.elements.flightType.value);refresh();input.focus();
 }
 function renderPersonSuggestions(form){
  const input=form.elements.studentName,list=form.querySelector('[data-person-suggestions]');if(!input||!list)return;
  const query=personKey(input.value),rows=personRows(),selected=rows.find(p=>p.id===form.elements.studentId.value),exact=rows.some(p=>personKey(p.name)===query);
  if(!query||input.dataset.personSelectedKey===query&&selected&&personKey(selected.name)===query||form.dataset.personCreateNewKey===query){list.hidden=true;list.innerHTML='';input.setAttribute('aria-expanded','false');return;}
  const matches=rows.filter(p=>personKey(p.name).startsWith(query));
  list.innerHTML=matches.map(p=>'<button type="button" role="option" aria-selected="false" data-person-suggestion="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><small>'+(p.kind==='client'?'Cliente':'Estudiante')+'</small></button>').join('')+(!exact?'<button type="button" role="option" aria-selected="false" data-person-create><span>Crear expediente nuevo</span><small>'+esc(input.value.trim())+'</small></button>':'');
  list.hidden=!matches.length&&exact;input.setAttribute('aria-expanded',String(!list.hidden));
  list.querySelectorAll('[data-person-suggestion],[data-person-create]').forEach(button=>button.addEventListener('click',()=>choosePersonSuggestion(form,button)));
 }
 function bindPersonSuggestions(form,refresh){
  const input=form.elements.studentName,list=form.querySelector('[data-person-suggestions]');if(!input||!list)return;
  form.__personRefresh=refresh;
  input.addEventListener('input',()=>{delete form.dataset.personCreateNewKey;delete input.dataset.personSelectedKey;form.elements.existingStudentId.value='';form.elements.personMatchId.value='';form.elements.studentId.value='';renderPersonSuggestions(form);});
  input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();list.querySelector('button')?.focus();}});
  list.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();list.hidden=true;input.setAttribute('aria-expanded','false');input.focus();return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(event.target),next=index+(event.key==='ArrowDown'?1:-1);if(next>=0&&next<buttons.length)buttons[next].focus();else if(event.key==='ArrowUp')input.focus();}
  });
 }
 function syncPersonFields(form,flightType){
  const nameField=form.elements.studentName;if(!nameField)return;
  const existingSelect=form.elements.existingStudentId,idField=form.elements.studentId,matchWrap=form.querySelector('[data-person-match]'),matchSelect=form.elements.personMatchId,newFields=form.querySelector('[data-person-new]'),status=form.querySelector('[data-person-status]');
  let normalized=personKey(nameField.value),selected=existingSelect?.value?model.state.students.find(p=>p.id===existingSelect.value):null;
  if(selected&&normalized&&personKey(selected.name)!==normalized){existingSelect.value='';selected=null;}
  if(selected){
   nameField.value=selected.name;normalized=personKey(selected.name);nameField.dataset.personSelectedKey=normalized;idField.value=selected.id;
   matchWrap.hidden=true;matchSelect.required=false;matchSelect.disabled=true;newFields.hidden=true;status.textContent='Expediente seleccionado: '+selected.name+'.';
  }else{
   delete nameField.dataset.personSelectedKey;
   const matches=normalized?model.state.students.filter(p=>personKey(p.name)===normalized):[];
   if(matches.length===1){
    idField.value=matches[0].id;if(existingSelect)existingSelect.value=matches[0].id;nameField.dataset.personSelectedKey=normalized;
    matchWrap.hidden=true;matchSelect.required=false;matchSelect.disabled=true;newFields.hidden=true;status.textContent='Expediente encontrado: '+matches[0].name+'.';
   }else if(matches.length>1){
    if(existingSelect)existingSelect.value='';const previous=matchSelect.value||idField.value;matchWrap.hidden=false;matchSelect.disabled=false;
    matchSelect.innerHTML='<option value="">Selecciona el expediente</option>'+matches.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+(p.kind==='client'?'Cliente':'Estudiante')+'</option>').join('');
    const selectedId=matches.some(p=>p.id===previous)?previous:'';matchSelect.value=selectedId;idField.value=selectedId;matchSelect.required=true;newFields.hidden=true;status.textContent='Elige el expediente correcto para evitar duplicados.';
   }else if(normalized){
    if(existingSelect)existingSelect.value='';idField.value='';matchWrap.hidden=true;matchSelect.required=false;matchSelect.disabled=true;
    const hasPrefixMatch=personRows().some(p=>personKey(p.name).startsWith(normalized)),createConfirmed=form.dataset.personCreateNewKey===normalized;
    newFields.hidden=hasPrefixMatch&&!createConfirmed;status.textContent=hasPrefixMatch&&!createConfirmed?'Selecciona una coincidencia o elige crear un expediente nuevo.':'No hay coincidencia. Completa estos datos para crear el expediente.';
   }else{
    if(existingSelect)existingSelect.value='';idField.value='';matchWrap.hidden=true;matchSelect.required=false;matchSelect.disabled=true;newFields.hidden=true;status.textContent='';
   }
  }
  const exactMatch=normalized&&model.state.students.some(p=>personKey(p.name)===normalized),hasPrefixMatch=normalized&&personRows().some(p=>personKey(p.name).startsWith(normalized)),isNew=!!normalized&&!exactMatch&&(!hasPrefixMatch||form.dataset.personCreateNewKey===normalized);
  for(const name of ['newPersonKind','personIdentity','personEmail','personPhone']){const field=form.elements[name];if(field){field.disabled=!isNew;field.required=isNew;if(name==='personPhone')field.setCustomValidity(isNew&&field.value&&!validPersonPhone(field.value)?'Escribe un número de 7 a 15 dígitos; se aceptan números de Panamá o del extranjero.':'');}}
  if(isNew&&!form.dataset.personKindTouched)form.elements.newPersonKind.value=['charter','socio'].includes(flightType)?'client':'student';
  form.elements.socioName.value=flightType==='socio'?nameField.value.trim():'';
  renderPersonSuggestions(form);
 }
 function formFlight(q,request){
  const s=model.state,selectedAircraft=s.aircraft.find(a=>a.id===q.aircraft),pilot880=model.rights.role==='pilot'&&selectedAircraft?.id==='HP880BL';
  const typeIds=request&&pilot880?['multi','multiLey89','multiConversion','atp','charter','socio','examen']:Object.keys(E.flightTypes);
  if(q.flightType&&!typeIds.includes(q.flightType))typeIds.push(q.flightType);
  const visibleTypes=typeIds.filter(id=>id!=='charter'||model.rights.role==='director'||pilot880);
  const typeValue=q.flightType||'privado',types=select('flightType','Tipo de vuelo',visibleTypes.map(id=>({id,name:E.flightTypeLabel(id,q.aircraft)})),typeValue);
  const aircraftChoices=request?[]:flightAircraftChoices(s,typeValue,model.rights.role),aircraftValue=aircraftChoices.some(a=>a.id===q.aircraft)?q.aircraft:aircraftChoices[0]?.id||'';
  const aircraftField=request?'': '<label>Aeronave<select name="aircraft" required data-flight-aircraft-type="'+esc(typeValue)+'">'+flightAircraftOptions(aircraftChoices,aircraftValue)+'</select></label>';
  const delegation='<label class="hp-full" data-delegation '+(q.flightType==='examen'?'':'hidden')+'>Número de delegación<input name="delegationNumber" type="text" value="'+esc(q.delegationNumber||'')+'"></label>';
  const pilotRows=sortedPilots(model.rights.role==='pilot'?s.pilots.filter(p=>p.id===model.rights.pilot):s.pilots),pilotDefault=pilotRows.some(p=>p.id===q.pilot)?q.pilot:pilotRows.some(p=>p.id===model.rights.pilot)?model.rights.pilot:pilotRows[0]?.id,pilotField=model.rights.role==='pilot'?'<div class="hp-full hp-notice">Piloto: '+esc(pilotName(model.rights.pilot))+'</div><input type="hidden" name="pilot" value="'+esc(model.rights.pilot||'')+'">':select('pilot','Piloto',pilotRows,pilotDefault);
  const identity=request?'<div class="hp-full hp-notice">'+esc(q.aircraft)+' · '+pretty(date)+' · '+esc(pilotName(model.rights.pilot))+'</div><div class="hp-full">'+types+'</div>'+delegation:field('newDate','Fecha de vuelo',date,'date')+pilotField+types+delegation+aircraftField;
  const chosenAircraft=s.aircraft.find(a=>a.id===(request?q.aircraft:aircraftValue)),showMonoWindow=request&&s.scheduleWindow&&chosenAircraft?.category==='Monomotor',dayWindow=request&&s.scheduleWindow?'<p class="hp-full hp-notice" data-day-window '+(showMonoWindow?'':'hidden')+'>'+(showMonoWindow?'Horario permitido para monomotores en '+pretty(date)+': '+esc(range(s.scheduleWindow)):'')+'</p>':'';
  return '<div class="hp-form-grid">'+identity+dayWindow+
   '<div class="hp-full hp-flight-times">'+field('start','Hora de inicio',q.start||'06:30','time')+field('end','Hora final',q.end||'09:30','time')+'</div>'+
   routeMarkup(q.route)+
   personFieldsMarkup(q)+
   '<label class="hp-full">Observaciones (opcional)<textarea name="note" maxlength="1000" placeholder="Detalles del vuelo (opcional)">'+esc(q.note||'')+'</textarea></label></div><p class="hp-notice">Indica obligatoriamente un estudiante o cliente. Si no existe expediente, completa nombre, cédula, correo y celular. Observaciones son opcionales.</p><p class="hp-notice" data-flight-warning></p>';
 }
 function watchFlight(d,q,request){
  const form=d.querySelector('form');
  form.elements.newPersonKind?.addEventListener('change',()=>form.dataset.personKindTouched='1');
  form.elements.existingStudentId?.addEventListener('change',()=>{const person=model.state.students.find(p=>p.id===form.elements.existingStudentId.value);if(person)form.elements.studentName.value=person.name;syncPersonFields(form,form.elements.flightType.value);update();});
  const update=()=>{
   if(!request)refreshFlightAircraft(form);
   const aircraft=model.state.aircraft.find(a=>a.id===(request?q.aircraft:form.elements.aircraft.value));
   for(const option of form.elements.flightType.options){
    const enabled=!request||E.canChooseFlightType(model.state,option.value,model.rights.role,aircraft);
    option.disabled=!enabled;option.hidden=!enabled;option.textContent=E.flightTypeLabel(option.value,aircraft?.id);
   }
   if(form.elements.flightType.selectedOptions[0]?.disabled)form.elements.flightType.value=[...form.elements.flightType.options].find(o=>!o.disabled)?.value||'';
   if(!form.dataset.personKindTouched)syncPersonFields(form,form.elements.flightType.value);
   const exam=form.elements.flightType.value==='examen';form.querySelector('[data-delegation]').hidden=!exam;form.elements.delegationNumber.required=exam;form.elements.delegationNumber.disabled=!exam;form.elements.delegationNumber.setCustomValidity(exam?E.delegationNumberError(form.elements.delegationNumber.value):'');
   const f={...q,...Object.fromEntries(new FormData(form)),studentId:form.elements.studentId.value,pilot:request?model.rights.pilot:form.elements.pilot.value},target=E.normalizeRequest(model.state,f),competing=E.competingRequests(model.state,target),studentOverlap=E.studentConflicts(model.state,target).length,a=model.state.aircraft.find(row=>row.id===target.aircraft),windowError=request?E.scheduleWindowError(a,target):'',hoursWarning=E.operatingHoursWarning(target),hoursError=E.operatingHoursError(target),nightError=E.validWindow(target)&&E.minutes(target.end)>E.minutes('18:30')&&!model.state.nightEnabled?'Dirección debe habilitar los vuelos nocturnos hasta las 8:00 p. m. para esta fecha.':'',routeIssue=E.routeError(form.elements.route.value),warning=form.querySelector('[data-flight-warning]'),windowNotice=form.querySelector('[data-day-window]');
   if(windowNotice){const constrained=a?.category==='Monomotor'&&model.state.scheduleWindow;windowNotice.hidden=!constrained;windowNotice.textContent=constrained?'Horario permitido para monomotores en '+pretty(date)+': '+range(model.state.scheduleWindow):'';}
   const aircraftAlert=a?.status==='mantenimiento'?'⚠ La aeronave está en MANTENIMIENTO. Puedes enviar la solicitud; el borrador solo la asignará si estaba operativa a las 8:00 p. m. y sigue operativa al publicar. ':a?.status==='grounded'?'⚠ La aeronave está GROUNDED; no se aceptan solicitudes. ':'';
   warning.textContent=(windowError?timeText(windowError)+' ':'')+(hoursWarning?timeText(hoursWarning)+' ':'')+(hoursError?timeText(hoursError)+' ':'')+(nightError?timeText(nightError)+' ':'')+(routeIssue?routeIssue+' ':'')+aircraftAlert+(competing.length?'Ya hay '+competing.length+' solicitud(es) en este horario. Puedes solicitarlo; el cierre decidirá la asignación. ':'')+(studentOverlap?'El estudiante ya tiene una solicitud o vuelo en ese horario; puedes guardar y Dirección ajustará el horario al publicar. ':'')+timeText(E.typeHint(model.state,f.flightType,target.aircraft));
   warning.classList.toggle('hp-warning',!!windowError||!!hoursWarning||!!hoursError||!!nightError||!!routeIssue||!!aircraftAlert||!!competing.length||!!studentOverlap);
   const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=!!windowError||!!hoursError||!!nightError;
  };
  bindPersonSuggestions(form,update);
  form.addEventListener('input',()=>{syncPersonFields(form,form.elements.flightType.value);update();});form.addEventListener('change',event=>{if(event.target===form.elements.studentName)return;syncPersonFields(form,form.elements.flightType.value);update();});syncPersonFields(form,form.elements.flightType.value);update();
 }
 function requestDialog(q){const gate=q.id&& !model.state.published?'':E.reservationGate(model.state);if(gate){modal('Reservas cerradas','<p>'+esc(timeText(gate))+'</p>');return;}const d=modal(q.id?'Modificar solicitud':'Solicitar vuelo',formFlight(q,true),async f=>save('request',{...(q.id?{id:q.id}:{}),flight:{...q,...f}}));watchFlight(d,q,true);}
 function claimSlotDialog(slot){
  if(!slot)return;
  const s=model.state,aircraft=s.aircraft.find(a=>a.id===slot.aircraft),pilot880=aircraft?.id==='HP880BL',typeIds=pilot880?['multi','multiLey89','multiConversion','charter','socio','examen']:Object.keys(E.flightTypes);
  if(slot.flightType&&!typeIds.includes(slot.flightType))typeIds.push(slot.flightType);
  const types=typeIds.filter(id=>E.canChooseFlightType(s,id,'pilot',aircraft)).map(id=>({id,name:E.flightTypeLabel(id,aircraft?.id)})),d=modal('Tomar espacio liberado · '+slot.aircraft,'<div class="hp-form-grid">'+select('flightType','Tipo de vuelo',types,slot.flightType||'privado')+'<label class="hp-full" data-delegation '+(slot.flightType==='examen'?'':'hidden')+'>Número de delegación<input name="delegationNumber" type="text"></label>'+personFieldsMarkup({flightType:slot.flightType||'privado'})+routeMarkup('')+'<label class="hp-full">Observaciones (opcional)<textarea name="note" maxlength="1000"></textarea></label></div><p class="hp-notice">Horario: '+esc(range(slot))+' · La aeronave y las horas están reservadas. Indica un estudiante o cliente; si no existe, completa sus datos para crear el expediente.</p>',f=>save('claim-open-slot',{id:slot.id,flight:{...f,aircraft:slot.aircraft,start:slot.start,end:slot.end}}));
  const form=d.querySelector('form');if(s.draftMode){const dateField=d.querySelector('[name="newDate"]');if(dateField)dateField.disabled=true;}const update=()=>{
   const exam=form.elements.flightType.value==='examen';form.querySelector('[data-delegation]').hidden=!exam;form.elements.delegationNumber.required=exam;form.elements.delegationNumber.disabled=!exam;form.elements.delegationNumber.setCustomValidity(exam?E.delegationNumberError(form.elements.delegationNumber.value):'');
   syncPersonFields(form,form.elements.flightType.value);
  };
  bindPersonSuggestions(form,update);
  form.elements.newPersonKind?.addEventListener('change',()=>form.dataset.personKindTouched='1');
  form.elements.existingStudentId?.addEventListener('change',()=>{const person=model.state.students.find(p=>p.id===form.elements.existingStudentId.value);if(person)form.elements.studentName.value=person.name;update();});
  form.addEventListener('input',update);form.addEventListener('change',event=>{if(event.target===form.elements.studentName)return;update();});update();
 }
 function flightDialog(q={}){const s=model.state,r=model.rights,pilots=sortedPilots(r.role==='pilot'?s.pilots.filter(p=>p.id===r.pilot):s.pilots),pilot=pilots.some(p=>p.id===r.pilot)?r.pilot:pilots[0]?.id,initial={aircraft:s.aircraft.find(a=>E.canSchedule(r.role,a))?.id,pilot,...q};const d=modal(q.id?'Modificar vuelo':'Agendar vuelo',formFlight(initial,false),async (f,form)=>{f.newDate=form.elements.newDate.value;const a=s.aircraft.find(a=>a.id===f.aircraft);if(a.status!=='operativo'&&!confirm('La aeronave '+a.id+' está '+a.status+'. ¿Confirmas agendar? Esto no cambia su estado.'))throw Error('Guardado cancelado.');const oldDate=date;let target=model;if(f.newDate&&f.newDate!==date)target=await api('itinerary-read',{date:f.newDate});await save('flight',{...(q.id?{id:q.id,originalDate:oldDate,originalRevision:s.revision}:{}),date:f.newDate||date,revision:target.state.revision,flight:f,acknowledge:true});});watchFlight(d,initial,false);}
 function orderHTML(ids,rows,all=true){const ordered=[...ids,...rows.map(r=>r.id).filter(id=>!ids.includes(id))];return '<div data-order>'+ordered.map(id=>'<div class="hp-order-row" data-id="'+esc(id)+'"><label>'+(all?'<input type="checkbox" '+(ids.includes(id)?'checked':'')+'>':'')+esc(rows.find(r=>r.id===id)?.name||id)+'</label><div><button type="button" data-up aria-label="Subir '+esc(id)+'">↑</button><button type="button" data-down aria-label="Bajar '+esc(id)+'">↓</button></div></div>').join('')+'</div>';}
 function bindOrder(d){d.querySelectorAll('[data-up],[data-down]').forEach(b=>b.onclick=()=>{const row=b.closest('[data-id]');if(b.hasAttribute('data-up'))row.previousElementSibling?.before(row);else row.nextElementSibling?.after(row);});}
 const ordered=(el,all=true)=>[...el.querySelectorAll(':scope > [data-id]')].filter(r=>!all||r.querySelector('input').checked).map(r=>r.dataset.id);
 function priorityDialog(id){const a=model.state.aircraft.find(a=>a.id===id),d=modal('Pilotos prioritarios · '+id,'<p>Selecciona los pilotos y ordena de mayor a menor prioridad.</p>'+orderHTML(a.pilots,model.state.pilots),async(_,f)=>save('settings',{aircraft:id,pilots:ordered(f.querySelector('[data-order]'))}));bindOrder(d);}
 function fleetDialog(){const rows=model.state.aircraft.filter(a=>a.category==='Monomotor').sort((a,b)=>a.rank-b.rank).map(a=>({id:a.id,name:a.id})),d=modal('Prioridad de monomotores','<p>Este orden sirve como base; prevalece el orden definido para cada tipo de vuelo.</p>'+orderHTML(rows.map(r=>r.id),rows,false),async(_,f)=>save('settings',{aircraftOrder:ordered(f.querySelector('[data-order]'),false)}));bindOrder(d);}
 function prioritySettingsDialog(){
  const s=model.state,settings=s.prioritySettings||{aircraftMode:'balanced',pilotMode:'hours',hourPeriod:'honorarios',pilotOrder:s.pilots.map(p=>p.id)},rows=s.pilots.map(p=>({id:p.id,name:p.name})),order=settings.pilotOrder?.length?settings.pilotOrder:rows.map(p=>p.id),hoursFor=(pilot,period)=>Number(pilot['periodMinutes'+(period==='month'?'Month':'Honorarios')]||0)/60;
  const body='<p>Se respetan la habilitación, el tipo de vuelo, las aeronaves permitidas y los cruces. El sistema intenta cubrir primero los monomotores operativos compatibles.</p><label>Distribución de aeronaves<select name="aircraftMode"><option value="balanced" '+(settings.aircraftMode==='balanced'?'selected':'')+'>Balanceada: usar cada avión compatible antes de repetir</option><option value="priority" '+(settings.aircraftMode==='priority'?'selected':'')+'>Prioridad manual: favorecer los primeros aviones</option></select></label><label>Prioridad de pilotos<select name="pilotMode"><option value="hours" '+(settings.pilotMode==='hours'?'selected':'')+'>Balancear por menos horas asignadas</option><option value="manual" '+(settings.pilotMode==='manual'?'selected':'')+'>Usar el orden manual de pilotos</option></select></label><label>Período para comparar horas<select name="hourPeriod"><option value="honorarios" '+(settings.hourPeriod==='honorarios'?'selected':'')+'>Ciclo de Honorarios: 26–10 o 11–25</option><option value="month" '+(settings.hourPeriod==='month'?'selected':'')+'>Mes calendario</option></select></label><div class="hp-priority-hours"><b>Horas ya asignadas por piloto</b><small data-hours-range></small><ul data-hours-list>'+s.pilots.map(p=>'<li data-pilot-hours="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><b></b></li>').join('')+'</ul></div><p class="hp-notice">El orden manual de pilotos se usa como prioridad y como desempate. La prioridad por avión específica de cada matrícula también se conserva.</p><b>Orden de pilotos · primero tiene mayor prioridad</b>'+orderHTML(order,rows,false);
  const d=modal('Prioridades de asignación',body,async(f,form)=>save('settings',{prioritySettings:{aircraftMode:f.aircraftMode,pilotMode:f.pilotMode,hourPeriod:f.hourPeriod,pilotOrder:ordered(form.querySelector('[data-order]'),false)}}));
  const updateHours=()=>{const mode=d.querySelector('[name="hourPeriod"]').value,period=s.pilotHoursRanges?.[mode]||s.pilotHoursRange;d.querySelector('[data-hours-range]').textContent=period?'Período '+pretty(period.start)+'–'+pretty(period.end):'';for(const p of s.pilots){const row=[...d.querySelectorAll('[data-pilot-hours]')].find(el=>el.dataset.pilotHours===p.id)?.querySelector('b');if(row)row.textContent=hoursFor(p,mode).toFixed(1)+' h';}};
  d.querySelector('[name="hourPeriod"]').addEventListener('change',updateHours);updateHours();bindOrder(d);
 }
 function typeDialog(){
  const s=model.state,previous=Object.fromEntries(Object.keys(E.flightTypes).map(type=>[type,E.allowedForType(s,type)])),d=modal('Aeronaves por tipo de vuelo',Object.entries(E.flightTypes).map(([id,v])=>'<details data-type="'+id+'"><summary>'+v.label+'</summary>'+orderHTML(E.allowedForType(s,id),E.typeConfigAircraft(s,id).map(a=>({id:a.id,name:a.id})))+'</details>').join(''),async(_,f)=>{const typeRules={};f.querySelectorAll('[data-type]').forEach(x=>{const type=x.dataset.type,ids=ordered(x.querySelector('[data-order]'));if(JSON.stringify(ids)!==JSON.stringify(previous[type]||[]))typeRules[type]=ids;});if(Object.keys(typeRules).length)await save('settings',{typeRules});});bindOrder(d);
 }
 function windowDialog(){
  const current=model.state.scheduleWindow||{start:'06:30',end:'18:30'};
  const d=modal('Horario de monomotores','<p>Define el horario de los monomotores para '+pretty(date)+'. Las solicitudes anteriores fuera del rango se reubicarán al publicar cuando haya espacio, con un mínimo de 1 hora y 30 minutos y sin cruces. Los multimotores y helicópteros conservan sus horarios normales.</p><div class="hp-window-editor">'+timeField('windowStart','Desde',current.start)+timeField('windowEnd','Hasta',current.end)+'</div><p class="hp-notice">Los vuelos monomotor ya confirmados deben quedar dentro del rango. Este ajuste se puede hacer antes de publicar.</p><button type="button" class="hp-danger" data-clear-window>Usar horarios habituales de las aeronaves</button>',async f=>{const scheduleWindow={start:f.windowStart,end:f.windowEnd};if(!E.validWindow(scheduleWindow))throw Error('La hora final debe ser posterior a la inicial.');if(E.minutes(scheduleWindow.end)-E.minutes(scheduleWindow.start)<E.MIN_ASSIGNMENT_MINUTES)throw Error('El rango debe permitir vuelos de al menos 1 hora y 30 minutos.');await save('settings',{scheduleWindow});});
  d.querySelector('[data-clear-window]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await save('settings',{scheduleWindow:null});d.close();}catch(error){d.querySelector('[role=alert]').textContent=timeText(error.message);button.disabled=false;}};
 }
 function configDialog(id){const a=model.state.aircraft.find(a=>a.id===id);modal('Bloques · '+id,'<p>Horarios y disponibilidad para '+pretty(date)+'.</p>'+a.slots.map((s,i)=>'<div class="hp-block-editor"><b>'+(i===4?'Noche':'#'+(i+1))+'</b>'+timeField('start'+i,'Inicio bloque '+(i+1),s.start)+timeField('end'+i,'Fin bloque '+(i+1),s.end)+'</div>').join('')+'<label class="hp-check"><input name="release" type="checkbox" '+(a.release?.enabled?'checked':'')+'>Habilitar disponibilidad prevista</label>'+field('from','Disponible desde',a.release?.from||'06:30','time')+field('until','Disponible hasta',a.release?.until||(a.night?'20:00':'18:30'),'time')+'<p class="hp-notice">La disponibilidad prevista no cambia el estado real de mantenimiento o grounded.</p>',async(f,form)=>{const slots=a.slots.map((s,i)=>({id:s.id,start:f['start'+i],end:f['end'+i]})),reason=E.validateSlots(slots,true);if(reason)throw Error(reason);await save('settings',{aircraft:id,slots,release:{enabled:form.elements.release.checked,from:f.from,until:f.until}});});}
 function previewDialog(){const s=model.state,result=s.draftMode?{assignments:s.confirmed,results:s.lastResults}:E.simulate(s),mono=s.aircraft.filter(a=>a.category==='Monomotor'&&a.status==='operativo'&&E.bookable(a,s.date)),used=new Set(result.assignments.map(q=>q.aircraft)),idle=mono.filter(a=>!used.has(a.id));modal('Revisión del cierre','<p>Vista previa; aún no modifica el horario.</p><p class="hp-notice"><b>Monomotores operativos con vuelo: '+(mono.length-idle.length)+' de '+mono.length+'.</b> El sistema intenta usar cada avión compatible antes de repetir.</p>'+(idle.length?'<p class="hp-warning">Sin vuelo asignado: '+idle.map(a=>esc(a.id)).join(', ')+'. Revisa si hay solicitudes compatibles, horarios libres y pilotos habilitados.</p>':'')+result.results.map(q=>'<div class="hp-notice"><b>'+esc(pilotName(q.pilot))+' · '+range(q)+' · '+esc(q.assignedAircraft||q.aircraft)+'</b><p>'+esc(timeText(q.reason))+'</p></div>').join('')+'<p>'+result.assignments.length+' vuelos propuestos. Los nocturnos requieren al menos dos aeronaves elegibles.</p>');}
 function renderAlerts(){
   const el=root?.querySelector('[data-director-alerts]');if(!el)return;const parts=[];
   if(noticeData.alerts?.length)parts.push('<section class="hp-section"><span class="hp-label">Alertas operativas del director</span><h3>⚠ Aeronaves por confirmar</h3>'+noticeData.alerts.map(a=>'<p class="hp-notice hp-warning"><b>'+esc(a.aircraft)+' · '+pretty(a.date)+' · '+range(a)+'</b><br>Estado: '+esc(a.status)+'</p>').join('')+'</section>');
   const emailStats=x=>{const recipients=Number(x.recipientCount||0),sent=Number(x.sentCount||0),review=Number(x.reviewCount||0),failed=Number(x.failedCount||0),pending=Number(x.pendingCount||0),unaccounted=x.unaccountedCount==null?Math.max(0,recipients-sent-review-failed-pending):Math.max(0,Number(x.unaccountedCount)||0);return {recipients,sent,review,failed,pending,unaccounted,needsReview:review+failed+pending+unaccounted};};
   const failures=(model.emailStatus||[]).map(x=>({row:x,stats:emailStats(x)})).filter(({row,stats})=>stats.needsReview>0||stats.sent<stats.recipients);
   if(failures.length)parts.push('<section class="hp-section hp-warning" role="status"><h3>⚠ Revisión de correos del horario</h3>'+failures.map(({row,stats})=>'<p class="hp-notice">Correo del '+(row.kind==='draft'?'borrador':'horario publicado')+': '+stats.sent+' de '+stats.recipients+' destinatarios aceptados por el servidor; '+stats.needsReview+' requieren revisión ('+stats.unaccounted+' sin comprobante).'+(Number(row.codeCounts?.['smtp-unconfirmed']||0)?' El servidor de correo no confirmó la recepción; Dirección debe revisar el estado antes de reenviar.':'')+' Actualiza esta página para comprobar el estado.</p>').join('')+'</section>');
   el.innerHTML=parts.join('');
  }
 function updateBell(){if(!bell)return;const count=(noticeData.notices||[]).filter(n=>Date.parse(n.createdAt)>lastRead).length+(noticeData.alerts||[]).length;bell.textContent='🔔 Avisos de vuelos'+(count?' ('+count+')':'');}
 async function readNotices(){if(document.hidden||dialog)return;const sequence=++noticeSequence;try{const result=await api('itinerary-notices');if(sequence!==noticeSequence)return;noticeData=result;updateBell();renderAlerts();}catch{/* Existing app remains available before server deployment. */}}
 function openNotices(){lastRead=Date.now();updateBell();modal('Avisos de vuelos',(noticeData.alerts||[]).map(a=>'<div class="hp-notice hp-warning">'+esc(a.aircraft)+' · '+pretty(a.date)+' · '+range(a)+' · '+esc(a.status)+'</div>').join('')+(noticeData.notices||[]).map(n=>'<div class="hp-notice"><b>'+esc(n.kind==='publication'?'Horario publicado':n.kind==='relocated'?'Vuelo reubicado':n.kind==='review'?'Vuelo pendiente de revisión':'Cambio en el horario')+' · '+pretty(n.date)+'</b>'+(n.before?'<p>Antes: '+esc(n.before.aircraft)+' · '+range(n.before)+'</p>':'')+(n.after?'<p>Ahora: '+esc(n.after.aircraft)+' · '+range(n.after)+'</p>':'')+(n.reason?'<p>'+esc(timeText(n.reason))+'</p>':'')+'</div>').join('')||'<p>No hay avisos de vuelos.</p>');}
 function install(options={}){
  if(root)return;api=options.api||((action,payload)=>AccountRegistration.api(action,payload));onChange=options.onChange;practiceMode=options.practice===true;
  const panel=document.getElementById('panel-itinerarios');if(!panel)return;
  root=document.createElement('div');root.className='hp-itinerary';root.dataset.itineraryControl='true';root.innerHTML='<h2>Itinerario por bloques</h2><p data-message role="status" aria-live="polite">Cargando itinerario por bloques…</p><button type="button" data-retry hidden>Reintentar</button>';root.querySelector('[data-retry]').onclick=()=>load();panel.replaceChildren(root);
  const refreshVisible=()=>{if(panel.classList.contains('active')&&!dialog)load(pendingFlightFocus?.date||date);};new MutationObserver(refreshVisible).observe(panel,{attributes:true,attributeFilter:['class']});
  bell=document.createElement('button');bell.className='hp-itinerary-bell';bell.dataset.itineraryControl='true';bell.onclick=openNotices;bell.textContent='🔔 Avisos de vuelos';(document.getElementById('sidebar')||panel).appendChild(bell);
  refreshVisible();readNotices();setInterval(()=>{if(!document.hidden){readNotices();if(loaded&&panel.classList.contains('active')&&!dialog)load();}},90000);
 }
 function focusPendingFlight(){
  if(!pendingFlightFocus||pendingFlightFocus.date!==date||!root)return;
  const row=[...root.querySelectorAll('[data-flight-id]')].find(e=>e.dataset.flightId===pendingFlightFocus.id);
  pendingFlightFocus=null;if(!row)return;
  row.classList.add('hp-search-highlight');row.scrollIntoView({block:'center',behavior:'instant'});row.focus({preventScroll:true});
  setTimeout(()=>row.classList.remove('hp-search-highlight'),3500);
 }
 function focusFlight(id,targetDate){
  id=id==null?'':String(id);
  if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate||''))return false;
  pendingFlightFocus={id,date:targetDate};
  if(busy){queuedDate=targetDate;return true;}
  if(loaded&&date===targetDate){focusPendingFlight();return true;}
  load(targetDate);return true;
 }
 window.HPItineraryUI={install,openDate:load,focusFlight};
})();
