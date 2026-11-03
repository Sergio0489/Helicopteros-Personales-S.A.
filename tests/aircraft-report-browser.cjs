'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {catalog}=require('../functions/boxes'),{boxView}=require('../functions/box-view'),{handle}=require('../functions/aircraft-reports');
const root=path.resolve(__dirname,'..'),description='Vibración en el rotor de cola',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const data={fleet:{HP_1784:{reg:'HP-1784',model:'Aeronave de prueba',status:'operativo',component_schema_v2:true,mantenimiento:[],documentos:[]}},pilotos:[{id:'pilot-record',authUid:'pilot-fixture',nombre:'Piloto de prueba',verificaciones:[]}],itinerarios:[],school:{students:[],registry:{clients:[],entries:[]}}};
const account={uid:'pilot-fixture',role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const policy=Object.fromEntries(Object.entries(catalog).map(([page,boxes])=>[page,{actions:{view:true,edit:false},boxes:Object.fromEntries(boxes.map(box=>[box.id,{view:true,edit:false}]))}]));
const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]);if(req.url==='/test'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<body><div id="shell"></div><script src="role-main-view.js"></script></body>');}else if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',(file.endsWith('.js')?'application/javascript':'text/html')+'; charset=utf-8');res.end(fs.readFileSync(file));}else{res.statusCode=404;res.end();}});

function backend(){
 let saved={operation:'fixture',revision:0,payload:JSON.stringify(data)};
 const db={ref:dbPath=>{assert.equal(dbPath,'dashboard');return {transaction:async update=>{const next=update(structuredClone(saved));if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(saved)}};saved=next;return {committed:true,snapshot:{val:()=>structuredClone(saved)}};}};}};
 return {
  call:body=>handle(db,{user:{uid:account.uid,email:'pilot@example.test',emailVerified:true},account,actor:{uid:account.uid,name:account.profile.name,role:account.role},body}),
  assertSingleReport(){const snapshot=JSON.parse(saved.payload),tasks=snapshot.fleet.HP_1784.mantenimiento,notices=snapshot.operationalNotices||[];assert.equal(tasks.length,1,'overlapping requests for one report must create one task');assert.equal(notices.length,1,'overlapping requests for one report must create one alert');assert.equal(notices[0].taskId,tasks[0].id);}
 };
}

async function fixture(browser){
 const requests=[],pending=[],waiters=[],errors=[],api=backend(),page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 const waitForRequests=count=>requests.length>=count?Promise.resolve():new Promise(resolve=>waiters.push({count,resolve}));
 await page.exposeFunction('holdAircraftReport',body=>new Promise((resolve,reject)=>{requests.push(structuredClone(body));pending.push({resolve,reject});for(const waiter of waiters.splice(0))if(requests.length>=waiter.count)waiter.resolve();else waiters.push(waiter);}));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));await page.goto(origin+'/test');
 await page.evaluate(()=>{window.AccountRegistration={api:(action,body)=>{if(action!=='aircraft-report')throw Error('Unexpected API action '+action);return window.holdAircraftReport(body);}};window.aircraftReportMessages=[];window.addEventListener('message',event=>{if(event.data?.action==='aircraft-report')window.aircraftReportMessages.push(event.data);});});
 const view=boxView(data,account,policy,'aeronaves'),result={native:{...view,operation:'fixture',uid:account.uid},pages:[{id:'aeronaves',name:'Aeronaves'}],name:account.profile.name,role:account.role};
 await page.evaluate(async result=>{window.dispose=await RoleMainView.mount(document.getElementById('shell'),result,'aeronaves',()=>{});},result);
 const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('#panel-0').waitFor();
 await frame.evaluate(()=>{
  window.aircraftReportResults=[];window.addEventListener('message',event=>{if(event.data?.action==='aircraft-report-result')window.aircraftReportResults.push(event.data);});
  // Drive the real report timeout callback inside the sandboxed iframe. The
  // page clock does not reliably advance timers in that isolated document.
  const nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window),active=new Map();window.reportTimers=[];
  window.setTimeout=(callback,delay,...args)=>{const timer=nativeSet(callback,delay,...args);if(delay===25000){const item={active:true,expire(){if(!item.active)throw Error('Report timeout already cleared');item.active=false;active.delete(timer);nativeClear(timer);callback(...args);}};active.set(timer,item);window.reportTimers.push(item);}return timer;};
  window.clearTimeout=timer=>{const item=active.get(timer);if(item){item.active=false;active.delete(timer);}nativeClear(timer);};
 });
 const stored=()=>page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('hp-aircraft-report:')));
 return {page,frame,requests,pending,errors,api,waitForRequests,stored,
  async open(){await frame.getByRole('button',{name:/Reportar problema a taller/}).click();await frame.locator('dialog textarea').fill(description);},
  async send(){await frame.locator('dialog [data-send]').click();},
  async expire(attempt){await frame.evaluate(attempt=>window.reportTimers[attempt].expire(),attempt);await frame.getByText(/Puedes reintentar el mismo formulario/).waitFor();},
  async received(count){await frame.waitForFunction(count=>window.aircraftReportResults.length===count,count);},
  async assertIdentity(count){assert.equal(requests.length,count);const keys=requests.map(request=>request.idempotencyKey);assert.equal(typeof keys[0],'string');assert.match(keys[0],uuid,'the API must receive a UUID idempotency key');for(const key of keys)assert.equal(key,keys[0],'every retry of the same pending report must keep its backend key');const entries=await stored();assert.equal(entries.length,1,'the unconfirmed report must retain one stored key');assert.equal(entries[0][1],keys[0],'the API key must match the persisted value');const ids=await page.evaluate(()=>window.aircraftReportMessages.map(message=>message.id));assert.equal(ids.length,count);assert.equal(new Set(ids).size,count,'every attempt needs its own response correlation id');},
  async assertPending(){assert.equal(await frame.locator('dialog [data-status]').textContent(),'Enviando reporte…','an old response must not settle the active retry');assert.equal(await frame.locator('dialog [data-send]').isDisabled(),true);},
  async assertSuccess(){await frame.getByText('Reporte guardado como tarea pendiente de taller.').waitFor();await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('hp-aircraft-report:')));},
  async close(){assert.deepEqual(errors,[]);await page.close();}
 };
}

(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox']});
  for(const staleResult of ['error','success'])for(const staleBeforeSuccess of [true,false]){
   const f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);await f.expire(0);await f.send();await f.waitForRequests(2);await f.assertIdentity(2);
   const settleStale=async()=>{const saved=await f.api.call(f.requests[0]);assert.equal(saved.ok,true);staleResult==='error'?f.pending[0].reject(Error('Error tardío del primer intento')):f.pending[0].resolve(saved);};
   if(staleBeforeSuccess){await settleStale();await f.received(1);await f.assertPending();await f.assertIdentity(2);}
   f.pending[1].resolve(await f.api.call(f.requests[1]));await f.assertSuccess();
   if(!staleBeforeSuccess){await settleStale();await f.received(2);assert.equal(await f.frame.locator('dialog [data-status]').textContent(),'Reporte guardado como tarea pendiente de taller.','a stale '+staleResult+' must not replace the confirmed success');}
   f.api.assertSingleReport();await f.close();
  }
  console.log('PASS overlapping report retries use distinct correlation IDs, retain one idempotency key and ignore stale errors and successes before and after confirmation');

  for(const closeMethod of ['cancel','escape']){
   const f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);
   if(closeMethod==='cancel')await f.frame.locator('dialog [data-cancel]').click();else await f.frame.locator('dialog textarea').press('Escape');
   await f.frame.locator('dialog').waitFor({state:'detached'});
   await f.open();await f.send();await f.waitForRequests(2);await f.assertIdentity(2);
   f.pending[0].resolve(await f.api.call(f.requests[0]));await f.received(1);await f.assertPending();
   await f.expire(1);await f.send();await f.waitForRequests(3);await f.assertIdentity(3);
   f.pending[2].resolve(await f.api.call(f.requests[2]));await f.assertSuccess();
   f.pending[1].resolve(await f.api.call(f.requests[1]));await f.received(3);
   assert.equal(await f.frame.locator('dialog [data-status]').textContent(),'Reporte guardado como tarea pendiente de taller.','a late response from the cancelled/reopened flow must not replace success');
   f.api.assertSingleReport();await f.close();
  }
  console.log('PASS cancelling or escaping and reopening a pending report preserves its backend key and creates one task and alert');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
