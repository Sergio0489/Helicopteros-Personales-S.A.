'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});});
after(async()=>{await browser?.close();});

function fixture(){return {fleet:{HP_1784:{mantenimiento:[
  {nombre:'Pendiente legado',fecha:'18/11/2026',resuelto:false,piezas:[]},
  {nombre:'Inspección histórica',fecha:'01/10/2026',fecha_resuelto:'06/10/2026',resuelto:true,piezas:[]},
]}},pilotos:[],itinerarios:[],school:{version:1,students:[],rates:{},intakes:[],brochureUrl:'',registry:{entries:[],clients:[],destinations:[]},paymentReceipts:[]}};}

async function app(t,role){
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.setDefaultTimeout(6000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
 await page.route('**/*',route=>route.fulfill({body:''}));
 await page.clock.install({time:new Date('2026-11-20T04:30:00Z')});
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 await page.setContent(html);
 await page.evaluate(({initial,role})=>{
  if(role)window.ROLE_VIEW=role;
  crypto.randomUUID ||= () => `test-${Math.random().toString(36).slice(2)}`;
  window.CLOUD_INITIAL=initial;window.writes=[];
  window.cloudWrite=async next=>{window.writes.push(structuredClone(next));};
  window.showCloudError=e=>{throw e;};
  window.getPaymentReceivers=()=>[{uid:'fictional-recipient',label:'Synthetic test'}];
 },{initial:fixture(),role});
 for(const file of ['functions/boxes.js','dashboard.js','students.js','registro.js','pilots-ui.js','box-ui.js'])await page.addScriptTag({path:path.join(root,file)});
 await page.evaluate(()=>{
  document.getElementById('access-screen').hidden=true;document.getElementById('dashboard-app').hidden=false;
  document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="0"]').click();
 });
 t.after(async()=>{await page.close();assert.deepEqual(errors,[],'No browser errors or unexpected dialogs');});
 assert.equal(await page.evaluate(()=>writes.length),0,'Opening fictional maintenance logs must not save anything');
 return page;
}

test('Maintenance dates preserve legacy history, use Panama day, save resolution, and allow director edits',async t=>{
 const page=await app(t);
 const pending=page.locator('#maint-list-0 input[aria-label="Fecha de inicio de la tarea"]').first();
 assert.equal(await pending.inputValue(),'18/11/2026','Legacy pending dates display DD/MM/YYYY');
 const created=page.locator('#bitacora-list-0 input[aria-label="Fecha de creación del mantenimiento"]');
 const closed=page.locator('#bitacora-list-0 input[aria-label="Fecha de cierre del mantenimiento"]');
 assert.equal(await created.inputValue(),'01/10/2026','Historical creation date is not replaced by today');
 assert.equal(await closed.inputValue(),'06/10/2026','Historical resolution date is preserved');
 assert.match(await page.locator('#bitacora-list-0').innerText(),/Duración: 5d/);

 // 04:30 UTC is still the prior calendar day in Panama (UTC-5).
 await page.getByRole('button',{name:'+ Agregar tarea',exact:true}).click();
 let newTask=page.locator('#maint-list-0 input[placeholder="Tarea de mantenimiento"]').last();
 assert.equal(await page.locator('#maint-list-0 input[aria-label="Fecha de inicio de la tarea"]').last().inputValue(),'19/11/2026');
 assert.equal(await page.evaluate(()=>state[0].mantenimiento.at(-1).fecha),'2026-11-19');
 await newTask.fill('Tarea al cruzar medianoche de Panamá');await newTask.press('Tab');

 // 05:30 UTC is the new day in Panama.
 await page.clock.setSystemTime(new Date('2026-11-20T05:30:00Z'));
 await page.getByRole('button',{name:'+ Agregar tarea',exact:true}).click();
 newTask=page.locator('#maint-list-0 input[placeholder="Tarea de mantenimiento"]').last();
 assert.equal(await page.locator('#maint-list-0 input[aria-label="Fecha de inicio de la tarea"]').last().inputValue(),'20/11/2026');
 assert.equal(await page.evaluate(()=>state[0].mantenimiento.at(-1).fecha),'2026-11-20');
 await newTask.fill('Tarea resuelta en el nuevo día');await newTask.press('Tab');
 const row=page.locator('#maint-wrap-0-3');
 await row.getByRole('button',{name:'✓ Resuelto'}).click();
 await page.waitForFunction(()=>writes.length===1);
 let saved=await page.evaluate(()=>previewData.fleet.HP_1784.mantenimiento[3]);
 assert.equal(saved.fecha,'2026-11-20');assert.equal(saved.fecha_resuelto,'2026-11-20');assert.equal(saved.resuelto,true);
 assert.equal(await created.last().inputValue(),'20/11/2026');assert.equal(await closed.last().inputValue(),'20/11/2026');
 assert.match(await page.locator('#bitacora-list-0').innerText(),/Duración: 0d/);

 // The Director can correct historical dates, and those edits persist as ISO dates.
 await created.last().fill('17/11/2026');await created.last().press('Tab');
 await page.waitForFunction(()=>writes.length===2);
 saved=await page.evaluate(()=>previewData.fleet.HP_1784.mantenimiento[3]);
 assert.equal(saved.fecha,'2026-11-17');
 assert.match(await page.locator('#bitacora-list-0').innerText(),/Duración: 3d/);
 await closed.last().fill('21/11/2026');await closed.last().press('Tab');
 await page.waitForFunction(()=>writes.length===3);
 saved=await page.evaluate(()=>previewData.fleet.HP_1784.mantenimiento[3]);
 assert.equal(saved.fecha_resuelto,'2026-11-21');
 assert.equal(await page.evaluate(()=>writes.length),3,'Only explicit resolution and director date edits write the fictional backup');
});

test('Non-director views display historical maintenance dates without date-edit controls',async t=>{
 const page=await app(t,{role:'Mecánico'});
 const log=page.locator('#bitacora-list-0');
 assert.match(await log.innerText(),/Inicio: 01\/10\/2026/);
 assert.match(await log.innerText(),/✓ 06\/10\/2026/);
 assert.equal(await log.locator('input[aria-label="Fecha de creación del mantenimiento"]').count(),0);
 assert.equal(await log.locator('input[aria-label="Fecha de cierre del mantenimiento"]').count(),0);
 assert.equal(await page.evaluate(()=>writes.length),0,'Read-only views perform no writes');
});
