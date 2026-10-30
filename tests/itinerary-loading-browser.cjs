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
test('Director sees detailed confirmed flights and cannot submit without route or observations',async t=>{
 const page=await app(t),result=response();Object.assign(result.state.confirmed[0],{route:'Chitré <referencia>',note:'Sin observaciones',studentId:'st1'});
 await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 const details=await page.locator('[data-flight-list]').textContent();
 for(const value of ['Aeronave','Hora de inicio y fin','Ruta o destino','Cliente / Estudiante','Estudiante A','Chitré <referencia>'])assert.ok(details.includes(value),value);
 await page.getByRole('button',{name:'Agendar vuelo',exact:true}).click();
 const form=page.locator('dialog form');
 assert.deepEqual(await form.evaluate(f=>Array.from(f.elements).filter(el=>el.required&&el.name).map(el=>el.name).sort()),['aircraft','flightType','newDate','note','pilot','route'].sort());
 assert.equal(await form.evaluate(f=>f.querySelectorAll('[data-time-field] [required]').length),6);
 assert.equal(await form.evaluate(f=>f.elements.studentId.required),false);
 assert.equal(await form.evaluate(f=>f.checkValidity()),false);
 await page.locator('[name=route]').fill('MPMG – Chitré');await page.locator('[name=note]').fill('Sin observaciones');
 assert.equal(await form.evaluate(f=>f.checkValidity()),true);
 await page.locator('[name=flightType]').selectOption('socio');assert.equal(await form.evaluate(f=>f.elements.socioName.required),true);assert.equal(await form.evaluate(f=>f.checkValidity()),false);
 await page.locator('[name=socioName]').fill('Socio de prueba');
 await page.locator('[data-time-field=start] [data-hour]').fill('12');
 await page.locator('[data-time-field=start] [data-minute]').fill('05');
 await page.locator('[data-time-field=start] [data-period]').selectOption('AM');
 await page.locator('[data-time-field=end] [data-hour]').fill('12');
 await page.locator('[data-time-field=end] [data-minute]').fill('45');
 await page.locator('[data-time-field=end] [data-period]').selectOption('PM');
 await page.evaluate(result=>{window.commandResult=result;},result);
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.locator('dialog').waitFor({state:'detached'});
 const saved=await page.evaluate(()=>itineraryCommands);assert.equal(saved.length,1);assert.equal(saved[0].date,'2026-10-30');assert.equal(saved[0].flight.route,'MPMG – Chitré');assert.equal(saved[0].flight.studentId,'');assert.equal(saved[0].flight.start,'00:05');assert.equal(saved[0].flight.end,'12:45');
});
test('AM/PM appears in flights, blocks and alerts; mobile editors preserve canonical times',async t=>{
 const page=await app(t,390),result=response();
 Object.assign(result.state.confirmed[0],{start:'00:00',end:'12:00',route:'MPMG',note:'Sin observaciones'});
 Object.assign(result.state.confirmed[1],{start:'13:07',end:'23:59'});
 result.alerts=[{aircraft:'HP1907',date:'2026-10-30',start:'13:07',end:'23:59',status:'mantenimiento'}];
 await page.evaluate(result=>resolveRead(result),result);await page.locator('[data-date]').waitFor();
 const flights=await page.locator('[data-flight-list]').textContent();assert.match(flights,/12:00 AM – 12:00 PM/);assert.match(flights,/1:07 PM – 11:59 PM/);
 assert.match(await page.locator('[data-director-alerts]').textContent(),/1:07 PM – 11:59 PM/);
 assert.match(await page.locator('[data-board]').textContent(),/12:30 PM – 3:30 PM/);
 await page.locator('[data-edit-flight="fixed-2"]').click();
 const startBox=await page.locator('[data-time-field=start]').boundingBox(),endBox=await page.locator('[data-time-field=end]').boundingBox();
 assert.equal(startBox.y,endBox.y,'Start and end times stay on the same row on mobile');assert(endBox.x>startBox.x);assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 assert.equal(await page.locator('[data-time-field=start] [data-hour]').inputValue(),'1');assert.equal(await page.locator('[data-time-field=start] [data-minute]').inputValue(),'07');assert.equal(await page.locator('[data-time-field=start] [data-period]').inputValue(),'PM');
 await page.locator('[data-time-field=start] [data-hour]').fill('0');assert.equal(await page.locator('dialog form').evaluate(f=>f.checkValidity()),false);
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.locator('[data-config="HP1907"]').click();
 assert.equal(await page.locator('[data-time-field=start4] [data-hour]').inputValue(),'6');assert.equal(await page.locator('[data-time-field=start4] [data-period]').inputValue(),'PM');
 const bounds=await page.locator('dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 await page.evaluate(result=>{window.commandResult=result;},result);await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
 const saved=await page.evaluate(()=>itineraryCommands);assert.equal(saved.length,1);assert.deepEqual(saved[0].slots,result.state.aircraft.find(a=>a.id==='HP1907').slots);assert.equal(saved[0].release.from,'06:30');
});
