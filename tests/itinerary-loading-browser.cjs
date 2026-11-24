'use strict';
// Synthetic browser data only; no Firebase credentials, requests, or writes.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const initial=require('./fixtures/itinerary-initial.cjs');
const root=path.resolve(__dirname,'..');
let browser;
before(async()=>{browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});});
after(async()=>{await browser?.close();});
function response(date='2026-10-30'){
 const state={...initial(),date,requests:[],lastResults:[],revision:0,configurationRevision:0};
 return {version:1,state,calendar:{version:1,year:date.slice(0,4),days:[{date:date.slice(0,4)+'-10-30',count:2},{date:date.slice(0,4)+'-11-03',count:1}]},rights:{role:'director',create:true,edit:true,settings:true},notices:[],alerts:[]};
}
async function app(t,width=1440){
 const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
 page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.fulfill({body:''}));
 await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 await page.evaluate(()=>{
  window.CLOUD_INITIAL={fleet:{},pilotos:[],itinerarios:[{id:'historic',fecha:'2026-10-30',horaInicio:'08:00',horaFin:'09:00',piloto:'Piloto histórico',aeronave:'HP-1784'}],school:{students:[],rates:{},intakes:[],registry:{clients:[],entries:[]}}};
  window.cloudWrite=()=>{throw Error('Unexpected write');};
  window.showCloudError=e=>{throw e;};
  window.itineraryReads=[];window.itineraryCommands=[];
  window.readItinerary=(action,payload)=>{
   if(action==='itinerary-command'){window.itineraryCommands.push(payload);return Promise.resolve(window.commandResult);}
   if(action==='itinerary-notices')return Promise.resolve({notices:[],alerts:[]});
   if(action==='itinerary-calendar')return Promise.resolve({version:1,year:payload.year,days:[{date:payload.year+'-02-28',count:3}]});
   if(action!=='itinerary-read')throw Error('Unexpected mutation');
   window.itineraryReads.push(payload.date);
   return new Promise((resolve,reject)=>{window.resolveRead=resolve;window.rejectRead=reject;});
  };
 });
 for(const file of ['dashboard.js','functions/itinerary-engine.js','itinerary-ui.js'])await page.addScriptTag({path:path.join(root,file)});
 await page.addStyleTag({path:path.join(root,'itinerary.css')});
 await page.evaluate(()=>{
  window.originalFlights=JSON.stringify(flightsData);
  document.getElementById('access-screen').hidden=true;
  document.getElementById('dashboard-app').hidden=false;
  HPItineraryUI.install({api:readItinerary});
  itinerariosTab.click();closeDrawer();
 });
 t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
 return page;
}
async function noOldScreen(page){
 for(const selector of ['#itinerary-legacy','#cal-cells','#flight-date','#planner-timeline'])assert.equal(await page.locator(selector).count(),0,'Previous screen is removed: '+selector);
 assert.equal(await page.evaluate(()=>JSON.stringify(flightsData)===originalFlights),true,'Historical flights survive screen replacement');
}
for(const width of [1440,390])test('Only the new itinerary appears during delayed loading and navigation ('+width+'px)',async t=>{
 const page=await app(t,width);
 await noOldScreen(page);
 assert.match(await page.locator('.hp-itinerary [role=status]').textContent(),/Cargando itinerario/);
 assert.equal(await page.locator('.hp-itinerary').getAttribute('aria-busy'),'true');
 await page.evaluate(result=>resolveRead(result),response());
 await page.locator('[data-date]').waitFor({state:'visible'});
 await noOldScreen(page);
 assert.equal(await page.locator('[data-year-calendar]').evaluate(el=>el===el.parentElement.lastElementChild),true);
 assert.equal(await page.locator('.hp-calendar-month').count(),12);
 assert.equal(await page.locator('[data-calendar-date]').count(),365);
 assert.equal(await page.locator('.hp-has-flights').count(),2);
 assert.match(await page.locator('[data-calendar-date="2026-10-30"]').getAttribute('aria-label'),/2 vuelos agendados/);
 assert.equal(await page.locator('[data-year-calendar]').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 await page.getByRole('button',{name:'Año siguiente',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.hp-calendar-heading strong').textContent==='2027'&&!document.querySelector('[data-year-calendar]').matches('[aria-busy=true]'));
 assert.equal(await page.locator('[data-calendar-date="2027-02-28"].hp-has-flights').count(),1);
 await page.getByRole('button',{name:'Año siguiente',exact:true}).click();
 await page.locator('[data-calendar-date="2028-02-29"]').waitFor();
 assert.equal(await page.locator('[data-calendar-date]').count(),366);
 await page.evaluate(()=>{dailyScheduleTab.click();renderCalendar();renderDayFlights('2026-10-30');updatePilotDropdown();itinerariosTab.click();closeDrawer();});
 await page.waitForFunction(()=>itineraryReads.length===2);
 await noOldScreen(page);
 await page.evaluate(result=>resolveRead(result),response());
 await page.waitForFunction(()=>document.querySelector('.hp-itinerary').getAttribute('aria-busy')==='false');
 await page.locator('[data-calendar-date="2026-11-03"]').click();
 await page.waitForFunction(()=>itineraryReads.at(-1)==='2026-11-03');
 await page.evaluate(result=>resolveRead(result),response('2026-11-03'));
 await page.waitForFunction(()=>document.querySelector('[data-date]').value==='2026-11-03');
 await noOldScreen(page);
});
test('Initial errors can be retried without returning to the old calendar',async t=>{
 const page=await app(t);
 await page.evaluate(()=>rejectRead(Error('Sin conexión')));
 const retry=page.getByRole('button',{name:'Reintentar',exact:true});
 await retry.waitFor({state:'visible'});
 await noOldScreen(page);
 assert.match(await page.locator('.hp-itinerary [role=status]').textContent(),/Sin conexión/);
 await retry.click();
 await page.waitForFunction(()=>itineraryReads.length===2);
 await page.evaluate(()=>resolveRead({version:0}));
 await retry.waitFor({state:'visible'});
 await noOldScreen(page);
 await retry.click();
 await page.waitForFunction(()=>itineraryReads.length===3);
 await page.evaluate(result=>resolveRead(result),response());
 await page.locator('[data-date]').waitFor({state:'visible'});
 await noOldScreen(page);
});
test('Annual calendar is absent for pilots, administrators and readers',async t=>{
 for(const role of ['pilot','admin','reader']){
  const page=await app(t),result=response();result.rights={role,create:role==='admin',boxes:{planner:true,flights:true,requests:true}};delete result.calendar;
  await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
  assert.equal(await page.locator('[data-year-calendar]').count(),0);assert.equal(await page.locator('[data-calendar-date]').count(),0);
 }
});
test('Cancelling a schedule date change keeps the explicitly selected day',async t=>{
 const page=await app(t),selected='2026-10-30';
 await page.evaluate(date=>{selectScheduleDate(date);window.confirm=()=>false;selectScheduleOffset(1);},selected);
 assert.equal(await page.locator('#panel-horario-dia').getAttribute('data-schedule-selected-date'),selected);
 await page.evaluate(()=>renderDailySchedule());
 assert.equal(await page.locator('#panel-horario-dia').getAttribute('data-schedule-date'),selected);
});
test('Director sees detailed flights, requires a student or client, and allows blank observations',async t=>{
 const page=await app(t),result=response();Object.assign(result.state.confirmed[0],{route:'Chitré <referencia>',note:'Sin observaciones',studentId:'st1'});
 await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 const details=await page.locator('[data-flight-list]').textContent();
 for(const value of ['Aeronave','Hora de inicio y fin','Ruta o destino','Cliente / Estudiante','Estudiante A','Chitré <referencia>'])assert.ok(details.includes(value),value);
 await page.getByRole('button',{name:'Agendar vuelo',exact:true}).click();
 const form=page.locator('dialog form');
 assert.deepEqual(await form.evaluate(f=>Array.from(f.elements).filter(el=>el.required&&el.name&&!el.disabled).map(el=>el.name).sort()),['aircraft','flightType','newDate','pilot','routePart1','routePart2','routePart3','studentName'].sort());
 assert.equal(await form.locator('[data-route-part]').count(),3,'Route starts with three code boxes');
 await page.locator('[data-route-toggle]').click();
 const routeRows=await page.locator('[data-route-item]:visible button').allTextContents();
 assert.equal(routeRows[0],'Achutupo - MPAC','National route codes are listed alphabetically by place');
 assert.ok(routeRows.includes('Chitré - MPCE'),'Chitré is shown with its OACI code');
 await page.locator('[data-route-toggle]').click();
 assert.equal(await form.evaluate(f=>f.querySelectorAll('[data-time-field] [required]').length),6);
 assert.equal(await form.evaluate(f=>f.elements.studentName.required),true);
 assert.equal(await form.evaluate(f=>f.checkValidity()),false);
 await page.locator('[name=routePart1]').fill('MPMG');await page.locator('[name=routePart2]').fill('MPDA');await page.locator('[name=routePart3]').fill('MPMG');
 await page.locator('[data-route-add]').click();assert.equal(await form.locator('[data-route-part]').count(),4);await page.locator('[name=routePart4]').fill('MPCE');
 await page.locator('[name=studentName]').fill('Estudiante A');
 assert.equal(await form.evaluate(f=>f.checkValidity()),true);
 await page.locator('[name=flightType]').selectOption('socio');assert.equal(await form.evaluate(f=>f.elements.socioName.value),'Estudiante A');assert.equal(await form.evaluate(f=>f.checkValidity()),true);
 await page.locator('[data-time-field=start] [data-hour]').fill('6');
 await page.locator('[data-time-field=start] [data-minute]').fill('35');
 await page.locator('[data-time-field=start] [data-period]').selectOption('AM');
 await page.locator('[data-time-field=end] [data-hour]').fill('12');
 await page.locator('[data-time-field=end] [data-minute]').fill('45');
 await page.locator('[data-time-field=end] [data-period]').selectOption('PM');
 await page.evaluate(result=>{window.commandResult=result;},result);
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.locator('dialog').waitFor({state:'detached'});
 const saved=await page.evaluate(()=>itineraryCommands);assert.equal(saved.length,1);assert.equal(saved[0].date,'2026-10-30');assert.equal(saved[0].flight.route,'MPMG - MPDA - MPMG - MPCE');assert.equal(saved[0].flight.studentId,'st1');assert.equal(saved[0].flight.studentName,'Estudiante A');assert.equal(saved[0].flight.start,'06:35');assert.equal(saved[0].flight.end,'12:45');
});
test('Director can select every pilot while a pilot request stays linked to its own account',async t=>{
 const director=await app(t),directorResult=response();directorResult.rights={role:'director',create:true,edit:true,settings:true,pilot:'c'};
 await director.evaluate(result=>resolveRead(result),directorResult);await director.locator('[data-date]').waitFor();await director.locator('[data-manual]').click();
 const directorForm=director.locator('dialog form'),pilotSelect=directorForm.locator('[name=pilot]');
 assert.equal(await pilotSelect.inputValue(),'c','Director defaults to the pilot record linked to the account');
 assert.deepEqual(await pilotSelect.locator('option').allTextContents(),['Piloto A','Piloto B','Piloto C','Piloto D'],'Director can choose all pilots in alphabetical order');
 await director.getByRole('button',{name:'Cancelar',exact:true}).click();

 const pilotPage=await app(t),pilotResult=response();pilotResult.rights={role:'pilot',request:true,pilot:'b',boxes:{planner:true,flights:true,requests:true}};
 await pilotPage.evaluate(result=>resolveRead(result),pilotResult);await pilotPage.locator('[data-date]').waitFor();
 await pilotPage.locator('[data-slot]').first().click();
 const requestForm=pilotPage.locator('dialog form');
 assert.equal(await requestForm.locator('select[name=pilot]').count(),0,'Pilot cannot choose another pilot');
 assert.match(await requestForm.textContent(),/· Piloto B/);
 await pilotPage.locator('[name=routePart1]').fill('MPMG');await pilotPage.locator('[name=routePart2]').fill('MPDA');await pilotPage.locator('[name=routePart3]').fill('MPMG');
 await pilotPage.locator('[name=existingStudentId]').selectOption('st1');
 await pilotPage.evaluate(result=>{window.commandResult=result;},pilotResult);await pilotPage.getByRole('button',{name:'Guardar',exact:true}).click();
 await pilotPage.locator('dialog').waitFor({state:'detached'});
 const commands=await pilotPage.evaluate(()=>itineraryCommands);assert.equal(commands.length,1);assert.equal(commands[0].flight.pilot,'b','The request payload is bound to the signed-in pilot');
});
test('AM/PM appears in flights, blocks and alerts; mobile editors preserve canonical times',async t=>{
 const page=await app(t,390),result=response();
 Object.assign(result.state.confirmed[0],{start:'00:00',end:'12:00',route:'MPMG - MPDA - MPMG',note:'Sin observaciones'});
 Object.assign(result.state.confirmed[1],{start:'13:07',end:'23:59'});
 result.alerts=[{aircraft:'HP1907',date:'2026-10-30',start:'13:07',end:'23:59',status:'mantenimiento'}];
 await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 const flights=await page.locator('[data-flight-list]').textContent();assert.match(flights,/12:00 AM – 12:00 PM/);assert.match(flights,/1:07 PM – 11:59 PM/);
 assert.match(await page.locator('[data-director-alerts]').textContent(),/1:07 PM – 11:59 PM/);
 assert.match(await page.locator('[data-board]').textContent(),/12:30 PM – 3:30 PM/);
 await page.locator('[data-edit-flight="fixed-2"]').click();
 const startBox=await page.locator('[data-time-field=start]').boundingBox(),endBox=await page.locator('[data-time-field=end]').boundingBox();
 assert(Math.abs(endBox.y-startBox.y)<2,'Start and end times share a compact row on mobile');assert(endBox.x>startBox.x,'End time follows start time on mobile');assert(endBox.width<startBox.width*1.1,'Time fields do not stretch across the full row');assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 assert.equal(await page.locator('[data-time-field=start] [data-hour]').inputValue(),'1');assert.equal(await page.locator('[data-time-field=start] [data-minute]').inputValue(),'07');assert.equal(await page.locator('[data-time-field=start] [data-period]').inputValue(),'PM');
 await page.locator('[data-time-field=start] [data-hour]').fill('0');assert.equal(await page.locator('dialog form').evaluate(f=>f.checkValidity()),false);
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.locator('[data-config="HP1907"]').click();
 assert.equal(await page.locator('[data-time-field=start4] [data-hour]').inputValue(),'6');assert.equal(await page.locator('[data-time-field=start4] [data-period]').inputValue(),'PM');
 const bounds=await page.locator('dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 await page.evaluate(result=>{window.commandResult=result;},result);await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
 const saved=await page.evaluate(()=>itineraryCommands);assert.equal(saved.length,1);assert.deepEqual(saved[0].slots,result.state.aircraft.find(a=>a.id==='HP1907').slots);assert.equal(saved[0].release.from,'06:30');
});
async function assertExamDelegationValidity(page){
 const form=page.locator('dialog form');await page.locator('[name=flightType]').selectOption('examen');await page.locator('[name=routePart1]').fill('MPMG');await page.locator('[name=routePart2]').fill('MPDA');await page.locator('[name=routePart3]').fill('MPMG');await page.locator('[name=studentName]').fill('Estudiante A');
 const field=page.locator('[name=delegationNumber]');assert.equal(await field.getAttribute('maxlength'),null,'custom validation matches the server after trimming');
 assert.equal(await form.evaluate(f=>f.elements.delegationNumber.required),true);assert.equal(await form.evaluate(f=>f.checkValidity()),false,'blank value is rejected');
 await field.fill('   ');assert.equal(await form.evaluate(f=>f.checkValidity()),false,'spaces-only value is rejected');
 await field.fill('FAA-26 / 007 #A +B');assert.equal(await form.evaluate(f=>f.checkValidity()),true,'alphanumeric value with signs and internal spaces is accepted');
 await field.fill(' '+('A'.repeat(30))+' ');assert.equal(await form.evaluate(f=>f.checkValidity()),true,'length is measured after normalization, like the server');
 await field.fill('A'.repeat(31));assert.equal(await form.evaluate(f=>f.checkValidity()),false,'more than 30 trimmed characters is rejected');
 await field.evaluate(el=>{el.value='AB\u0001CD';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await form.evaluate(f=>f.checkValidity()),false,'internal control characters are rejected');
}
test('Exam delegation browser validation matches the server in Director scheduling',async t=>{
 const page=await app(t),result=response();await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 await page.getByRole('button',{name:'Agendar vuelo',exact:true}).click();await assertExamDelegationValidity(page);
});
test('Exam delegation browser validation matches the server in pilot requests and released slots',async t=>{
 const result=response();result.rights={role:'pilot',request:true,pilot:'b',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};
 const requestPage=await app(t);await requestPage.evaluate(result=>resolveRead(result),result);await requestPage.locator('[data-date]').waitFor();
 await requestPage.locator('[data-slot="HP1907:b1"]').click();await assertExamDelegationValidity(requestPage);
 const slotResult=response();slotResult.rights={role:'pilot',request:true,pilot:'b',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};slotResult.state.published=true;slotResult.state.openSlots=[{id:'open-exam-test',aircraft:'HP1907',start:'06:30',end:'09:30',flightType:'examen'}];
 const claimPage=await app(t);await claimPage.evaluate(result=>resolveRead(result),slotResult);await claimPage.locator('[data-date]').waitFor();
 await claimPage.locator('[data-claim-slot="open-exam-test"]').click();await assertExamDelegationValidity(claimPage);
});
test('Director window editor saves exact AM/PM range and labels it for monomotors',async t=>{
 const page=await app(t,390),result=response(),scheduleWindow={start:'08:00',end:'16:00'};
 await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 await page.getByRole('button',{name:'Horario monomotores',exact:true}).click();
 for(const [field,hour,period]of [['windowStart','8','AM'],['windowEnd','4','PM']]){
  await page.locator(`[data-time-field=${field}] [data-hour]`).fill(hour);
  await page.locator(`[data-time-field=${field}] [data-minute]`).fill('0');
  await page.locator(`[data-time-field=${field}] [data-period]`).selectOption(period);
 }
 const saved={...result,state:{...result.state,scheduleWindow,revision:1,aircraft:result.state.aircraft.map(a=>({...a,scheduleWindow:a.category==='Monomotor'?scheduleWindow:null}))}};
 await page.evaluate(result=>{window.commandResult=result;},saved);await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
 const commands=await page.evaluate(()=>itineraryCommands);assert.equal(commands.length,1);assert.equal(commands[0].command,'settings');assert.deepEqual(commands[0].scheduleWindow,scheduleWindow);
 assert.match(await page.locator('[data-message]').textContent(),/Guardado en Firebase/);assert.match(await page.locator('.hp-itinerary').textContent(),/Horario para monomotores/);
});
test('Pilot sees the daily range only when requesting a monomotor, not HP880BL',async t=>{
 const result=response(),scheduleWindow={start:'08:00',end:'16:00'};
 result.rights={role:'pilot',request:true,pilot:'a',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};
 result.state.scheduleWindow=scheduleWindow;
 result.state.aircraft=result.state.aircraft.map(a=>({...a,scheduleWindow:a.category==='Monomotor'?scheduleWindow:null}));
 const page=await app(t,390);await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 await page.locator('[data-slot="HP1907:b1"]').click();assert.match(await page.locator('dialog').textContent(),/Horario permitido para monomotores/);
 await page.locator('dialog [data-close]').click();
 await page.locator('[data-slot="HP880BL:b4"]').click();assert.doesNotMatch(await page.locator('dialog').textContent(),/Horario permitido para monomotores/);
});
test('Director config shows independent Multi and ATP aircraft lists and pilot can select each HP880BL type',async t=>{
 const directorPage=await app(t),directorData=response();await directorPage.evaluate(result=>resolveRead(result),directorData);await directorPage.locator('[data-date]').waitFor();
 await directorPage.locator('[data-types]').click();
 const config=directorPage.locator('dialog'),configured=await config.locator('[data-type]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.type,label:row.querySelector('summary')?.textContent.trim(),aircraft:[...row.querySelectorAll('[data-id]')].map(item=>({id:item.dataset.id,checked:item.querySelector('input')?.checked}))})));
 const expected=[['multi','Multi Estudiante'],['multiLey89','Multi Ley 89'],['multiConversion','Multi Conversión'],['atp','ATP']];
 for(const [id,label] of expected){const row=configured.find(item=>item.id===id);assert.ok(row,'missing settings list '+id);assert.equal(row.label,label);assert.equal(row.aircraft.find(item=>item.id==='HP880BL')?.checked,true);assert.ok(row.aircraft.every(item=>directorData.state.aircraft.find(a=>a.id===item.id)?.category==='Multimotor'));}
 assert.ok(configured.some(item=>item.id==='ley89'&&item.label==='Ley 89'));assert.ok(configured.some(item=>item.id==='conversion'&&item.label==='Conversión'));
 await config.locator('[data-type="privado"] summary').click();
 await config.locator('[data-type="privado"] input').first().uncheck();
 await directorPage.evaluate(result=>{window.commandResult=result},directorData);
 await config.locator('[type=submit]').click();
 const savedRules=await directorPage.evaluate(()=>window.itineraryCommands.at(-1).typeRules);
 assert.deepEqual(Object.keys(savedRules),['privado']);
 const pilotData=response();pilotData.rights={role:'pilot',request:true,pilot:'a',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};
 const pilotPage=await app(t);await pilotPage.evaluate(result=>resolveRead(result),pilotData);await pilotPage.locator('[data-date]').waitFor();await pilotPage.locator('[data-slot="HP880BL:b4"]').click();
 const form=pilotPage.locator('dialog form'),options=await form.locator('[name="flightType"] option').evaluateAll(nodes=>nodes.map(option=>({value:option.value,label:option.textContent,disabled:option.disabled,hidden:option.hidden})));
 for(const [id,label] of expected){const option=options.find(item=>item.value===id);assert.ok(option,'missing pilot option '+id);assert.equal(option.label,label);assert.equal(option.disabled,false);assert.equal(option.hidden,false);}
 await form.locator('[name="flightType"]').selectOption('atp');assert.equal(await form.locator('[name="flightType"]').inputValue(),'atp');
 await form.locator('[name="flightType"]').selectOption('multiLey89');assert.equal(await form.locator('[name="flightType"]').inputValue(),'multiLey89');
 await form.locator('[data-close]').click();
 const monoData=response();monoData.rights={role:'pilot',request:true,pilot:'a',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};monoData.state.requests=[];monoData.state.confirmed=[];
 const monoPage=await app(t);await monoPage.evaluate(result=>resolveRead(result),monoData);await monoPage.locator('[data-date]').waitFor();await monoPage.locator('[data-slot="HP1907:b1"]').click();
 const monoForm=monoPage.locator('dialog form');await monoForm.locator('[name="flightType"]').selectOption('atp');assert.equal(await monoForm.locator('[name="flightType"]').inputValue(),'atp');await monoForm.locator('[name="flightType"]').selectOption('multiConversion');
 assert.equal(await monoForm.locator('[name="flightType"]').inputValue(),'multiConversion');assert.equal(await monoForm.locator('[type=submit]').isEnabled(),true);
});
test('A Multi request started from a monomotor uses HP880BL hours outside the mono window',async t=>{
 const result=response(),scheduleWindow={start:'08:00',end:'16:00'};
 result.rights={role:'pilot',request:true,pilot:'a',settings:false,create:false,boxes:{planner:true,flights:true,requests:true}};
 result.state.scheduleWindow=scheduleWindow;
 result.state.requests=[{id:'q9',pilot:'a',aircraft:'HP1907',slot:'b4',start:'15:30',end:'18:30',flightType:'ifr',created:9}];
 result.state.aircraft=result.state.aircraft.map(a=>({...a,scheduleWindow:a.category==='Monomotor'?scheduleWindow:null}));
 const page=await app(t,390);await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 await page.locator('[data-request-edit="q9"]').click();const form=page.locator('dialog form'),windowNotice=form.locator('[data-day-window]'),submit=form.locator('[type=submit]');
 await windowNotice.waitFor({state:'visible'});assert.equal(await submit.isDisabled(),true);
 await form.locator('[name="flightType"]').selectOption('multi');
 assert.equal(await windowNotice.isVisible(),false);assert.equal(await submit.isEnabled(),true);
});
