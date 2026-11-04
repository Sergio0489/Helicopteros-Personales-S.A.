'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {catalog}=require('../functions/boxes'),{boxView}=require('../functions/box-view'),{handle}=require('../functions/aircraft-reports');
const root=path.resolve(__dirname,'..'),description='Vibración en el rotor de cola',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const data={fleet:{HP_1784:{reg:'HP-1784',model:'Aeronave de prueba',status:'operativo',component_schema_v2:true,mantenimiento:[],documentos:[]}},pilotos:[{id:'pilot-record',authUid:'pilot-fixture',nombre:'Piloto de prueba',verificaciones:[]}],itinerarios:[],school:{students:[],registry:{clients:[],entries:[]}}};
const account={uid:'pilot-fixture',role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const policy=Object.fromEntries(Object.entries(catalog).map(([page,boxes])=>[page,{actions:{view:true,edit:false},boxes:Object.fromEntries(boxes.map(box=>[box.id,{view:true,edit:false}]))}]));
const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]);if(req.url==='/test'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<body><div id="shell"></div><script src="aircraft-report-recovery.js"></script><script src="role-main-view.js"></script></body>');}else if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',(file.endsWith('.js')?'application/javascript':'text/html')+'; charset=utf-8');res.end(fs.readFileSync(file));}else{res.statusCode=404;res.end();}});

function backend(){
 let saved={operation:'fixture',revision:0,payload:JSON.stringify(data)};
 const db={ref:dbPath=>{assert.equal(dbPath,'dashboard');return {transaction:async update=>{const next=update(structuredClone(saved));if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(saved)}};saved=next;return {committed:true,snapshot:{val:()=>structuredClone(saved)}};}};}};
 return {
  call:body=>handle(db,{user:{uid:account.uid,email:'pilot@example.test',emailVerified:true},account,actor:{uid:account.uid,name:account.profile.name,role:account.role},body}),
  assertReports(count,descriptions){const snapshot=JSON.parse(saved.payload),tasks=snapshot.fleet.HP_1784.mantenimiento,notices=snapshot.operationalNotices||[];assert.equal(tasks.length,count,'one task must exist per distinct report');assert.equal(notices.length,count,'one alert must exist per distinct report');for(const notice of notices)assert(tasks.some(task=>task.id===notice.taskId));if(descriptions)assert.deepEqual(tasks.map(task=>task.description).sort(),[...descriptions].sort());},
  assertSingleReport(){this.assertReports(1,[description]);}
 };
}

async function fixture(browser){
 const requests=[],pending=[],waiters=[],errors=[],sent=[],api=backend(),page=await browser.newPage();let frame,activeAccount=account;page.on('pageerror',error=>errors.push(error.message));
 const waitForRequests=count=>requests.length>=count?Promise.resolve():new Promise(resolve=>waiters.push({count,resolve}));
 await page.exposeFunction('holdAircraftReport',body=>new Promise((resolve,reject)=>{requests.push(structuredClone(body));pending.push({resolve,reject});for(const waiter of waiters.splice(0))if(requests.length>=waiter.count)waiter.resolve();else waiters.push(waiter);}));
 await page.exposeFunction('captureAircraftReport',message=>sent.push(structuredClone(message)));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 async function mount(who=account){
  activeAccount=who;
  await page.evaluate(uid=>{window.firebase={auth:()=>({currentUser:{uid}})};window.AccountRegistration={api:(action,body)=>{if(action!=='aircraft-report')throw Error('Unexpected API action '+action);return window.holdAircraftReport(body);}};window.aircraftReportMessages=[];if(window.aircraftReportObserver)window.removeEventListener('message',window.aircraftReportObserver);window.aircraftReportObserver=event=>{if(event.data?.action==='aircraft-report'){window.aircraftReportMessages.push(event.data);window.captureAircraftReport(event.data);}};window.addEventListener('message',window.aircraftReportObserver);},who.uid);
  const viewData=structuredClone(data);viewData.pilotos=[{...viewData.pilotos[0],id:who.recordId,authUid:who.uid,nombre:who.profile.name}];
  const view=boxView(viewData,who,policy,'aeronaves'),result={native:{...view,operation:'fixture',uid:who.uid},pages:[{id:'aeronaves',name:'Aeronaves'}],name:who.profile.name,role:who.role};
  await page.evaluate(async result=>{window.dispose=await RoleMainView.mount(document.getElementById('shell'),result,'aeronaves',()=>{});},result);
  frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('#panel-0').waitFor();
  await frame.evaluate(()=>{
   window.aircraftReportResults=[];window.addEventListener('message',event=>{if(event.data?.action==='aircraft-report-result')window.aircraftReportResults.push(event.data);});
   // Drive the real report timeout callback inside the sandboxed iframe. The
   // page clock does not reliably advance timers in that isolated document.
   const nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window),active=new Map();window.reportTimers=[];window.reportCloseTimers=[];
   window.setTimeout=(callback,delay,...args)=>{const timer=nativeSet(callback,delay,...args);if(delay===25000||delay===800){const item={active:true,expire(){if(!item.active)throw Error('Report timer already cleared');item.active=false;active.delete(timer);nativeClear(timer);callback(...args);}};active.set(timer,item);(delay===25000?window.reportTimers:window.reportCloseTimers).push(item);}return timer;};
   window.clearTimeout=timer=>{const item=active.get(timer);if(item){item.active=false;active.delete(timer);}nativeClear(timer);};
  });
 }
 await page.goto(origin+'/test');await mount();
 const stored=(uid=activeAccount.uid)=>page.evaluate(uid=>Object.entries(localStorage).filter(([key])=>key.startsWith('hp:aircraft-report:v1:'+encodeURIComponent(uid)+':')).map(([key,value])=>[key,JSON.parse(value)]),uid);
 return {page,get frame(){return frame;},requests,pending,errors,sent,api,waitForRequests,stored,
  async reload(who=activeAccount){await page.reload();await mount(who);},
  async open({recover=true,text=description}={}){await frame.getByRole('button',{name:/Reportar problema a taller/}).click();await frame.locator('dialog').waitFor();await frame.locator('dialog [data-report-new]').waitFor({state:'attached'});const choices=frame.locator('dialog [data-report-recover]');if(await choices.count()){if(recover)await choices.first().click();}else await frame.locator('dialog textarea').fill(text);},
  async recover(){await frame.locator('dialog [data-report-recover]').first().click();},
  async send(){await frame.locator('dialog [data-send]').click();},
  async expire(attempt){await frame.evaluate(attempt=>window.reportTimers[attempt].expire(),attempt);await frame.getByText(/Puedes reintentar el mismo formulario/).waitFor();},
  async received(count){await frame.waitForFunction(count=>window.aircraftReportResults.length===count,count);},
  async assertUniqueIds(count){assert.equal(sent.length,count);assert.equal(new Set(sent.map(message=>message.id)).size,count,'every attempt needs its own response correlation id');},
  async assertIdentity(count,attempts=count){assert.equal(requests.length,count);const keys=requests.map(request=>request.idempotencyKey);assert.equal(typeof keys[0],'string');assert.match(keys[0],uuid,'the API must receive a UUID idempotency key');for(const key of keys)assert.equal(key,keys[0],'every retry of the same pending report must keep its backend key');const entries=await stored();assert.equal(entries.length,1,'the unconfirmed report must retain one stored record');const entry=entries[0][1];assert.equal(entry.id,keys[0],'the API key must match the persisted UUID');assert.equal(entry.aircraft,requests[0].aircraft);assert.equal(entry.description,requests[0].description,'recovery must preserve the original report text');await this.assertUniqueIds(attempts);},
  async assertPending(){assert.equal(await frame.locator('dialog [data-status]').textContent(),'Enviando reporte…','an old response must not settle the active retry');assert.equal(await frame.locator('dialog [data-send]').isDisabled(),true);},
  async assertSuccess(remaining=0){await frame.getByText('Reporte guardado como tarea pendiente de taller.').waitFor();await page.waitForFunction(({uid,remaining})=>Object.keys(localStorage).filter(key=>key.startsWith('hp:aircraft-report:v1:'+encodeURIComponent(uid)+':')).length===remaining,{uid:activeAccount.uid,remaining});},
  async closeDialog(){if(await frame.locator('dialog').count())await frame.locator('dialog [data-cancel]').click();await frame.locator('dialog').waitFor({state:'detached'});},
  async replayResult(message,error){await page.evaluate(({message,error})=>document.querySelector('iframe').contentWindow.postMessage({channel:message.channel,action:'aircraft-report-result',id:message.id,error},'*'),{message,error});},
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

  {
   const f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);
   const accepted=await f.api.call(f.requests[0]);assert.equal(accepted.ok,true);await f.expire(0);await f.assertIdentity(1);
   const oldMessage=structuredClone(f.sent[0]);await f.reload();
   assert.equal(f.requests.length,1,'reloading must never resend an uncertain report automatically');
   await f.open({recover:false});assert.equal(await f.frame.locator('dialog [data-report-recover]').count(),1);
   assert.equal(f.requests.length,1,'displaying recovery must not write to the server');await f.recover();
   assert.equal(await f.frame.locator('dialog textarea').inputValue(),description,'reload recovery must restore the original content');
   assert.equal(await f.frame.locator('dialog textarea').evaluate(element=>element.readOnly),true,'a pending retry cannot silently change its original content');
   await f.send();await f.waitForRequests(2);await f.assertIdentity(2);
   const retry=await f.api.call(f.requests[1]);assert.equal(retry.deduplicated,true);f.pending[1].resolve(retry);await f.assertSuccess();
   f.pending[0].resolve(accepted);await f.replayResult(oldMessage,'Error tardío anterior a la recarga');await f.received(2);
   assert.equal(await f.frame.locator('dialog [data-status]').textContent(),'Reporte guardado como tarea pendiente de taller.','an old pre-reload response must not replace the recovered report success');
   assert.equal((await f.stored()).length,0,'confirmation must remove the recovered original content and key');
   f.api.assertSingleReport();await f.close();
  }
  console.log('PASS a saved report with delayed confirmation survives reload and explicit recovery without duplicate task or alert');

  {
   const changed='Vibración en el rotor de cola y ruido nuevo en cabina',f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);
   const accepted=await f.api.call(f.requests[0]);await f.expire(0);
   assert.equal(await f.frame.locator('dialog textarea').evaluate(element=>element.readOnly),true);
   await f.frame.locator('dialog [data-report-modify]').click();
   assert.equal(await f.frame.locator('dialog textarea').evaluate(element=>element.readOnly),false,'creating a distinct report must explicitly unlock editing');
   await f.send();await f.frame.getByText('Modifica la descripción para crear otro reporte, o recupera el original para reintentarlo.').waitFor();assert.equal(f.requests.length,1,'an unchanged copy must return to retrying the original instead of creating a duplicate');
   await f.frame.locator('dialog textarea').fill(changed);await f.send();await f.waitForRequests(2);await f.assertUniqueIds(2);
   assert.notEqual(f.requests[0].idempotencyKey,f.requests[1].idempotencyKey,'an explicitly changed new report needs a different key');
   assert.equal(f.requests[0].description,description);assert.equal(f.requests[1].description,changed);
   assert.equal((await f.stored()).length,2,'the original uncertain report must remain recoverable while a different report is sent');
   f.pending[1].resolve(await f.api.call(f.requests[1]));await f.assertSuccess(1);
   const original=(await f.stored())[0][1];assert.equal(original.id,f.requests[0].idempotencyKey);assert.equal(original.description,description,'confirming a new report must not erase the old pending report');
   f.pending[0].resolve(accepted);await f.received(2);assert.equal((await f.stored()).length,1,'a stale old success must not clear an unconfirmed recovery record');
   await f.closeDialog();await f.open();assert.equal(await f.frame.locator('dialog textarea').inputValue(),description);
   await f.send();await f.waitForRequests(3);assert.equal(f.requests[2].idempotencyKey,f.requests[0].idempotencyKey);
   const retry=await f.api.call(f.requests[2]);assert.equal(retry.deduplicated,true);f.pending[2].resolve(retry);await f.assertSuccess();
   f.api.assertReports(2,[description,changed]);await f.close();
  }
  console.log('PASS explicit changed reports use new keys while confirmation removes only the matching pending record');

  {
   const f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);const accepted=await f.api.call(f.requests[0]);await f.expire(0);
   const other={...account,uid:'other-pilot-fixture',recordId:'other-pilot-record',profile:{name:'Otro piloto de prueba'}};
   await f.reload(other);await f.open({recover:false,text:''});
   assert.equal(await f.frame.locator('dialog [data-report-recover]').count(),0,'a different pilot must not see another pilot recovery choices');
   assert.equal(await f.frame.locator('dialog textarea').inputValue(),'','another pilot report content must not be restored');
   assert.equal((await f.stored(other.uid)).length,0);assert.equal((await f.stored(account.uid)).length,1,'switching users must preserve the owner pending record without exposing it');
   assert.equal(f.requests.length,1,'changing users must not send another pilot report');
   await f.closeDialog();await f.reload(account);await f.open();assert.equal(await f.frame.locator('dialog textarea').inputValue(),description);
   await f.send();await f.waitForRequests(2);await f.assertIdentity(2);f.pending[1].resolve(await f.api.call(f.requests[1]));await f.assertSuccess();f.pending[0].resolve(accepted);
   f.api.assertSingleReport();await f.close();
  }
  console.log('PASS recovered report content and keys are isolated by pilot across browser reloads');

  {
   const f=await fixture(browser),legacyId='33a19660-7319-4be6-a1ab-75593db84200',legacyKey='hp-aircraft-report:'+account.uid+':'+require('node:crypto').createHash('sha256').update(account.uid+'\u0000HP-1784\u0000'+description).digest('hex');
   await f.page.evaluate(({legacyKey,legacyId})=>localStorage.setItem(legacyKey,legacyId),{legacyKey,legacyId});
   await f.frame.getByRole('button',{name:/Reportar problema a taller/}).click();await f.frame.locator('dialog [data-report-new]').waitFor({state:'attached'});
   await f.frame.getByText('Hay envíos de una versión anterior sin texto recuperable. Revisa lo recibido antes de crear otro reporte.').waitFor();
   assert.equal(await f.frame.locator('dialog [data-report-recover]').count(),0,'a legacy UUID without text cannot claim to restore its original content');assert.equal(await f.frame.locator('dialog textarea').isVisible(),false);assert.equal(f.requests.length,0);
   await f.frame.locator('dialog [data-report-new]').click();await f.frame.locator('dialog textarea').fill(description);await f.send();await f.waitForRequests(1);await f.assertIdentity(1);
   assert.equal(f.requests[0].idempotencyKey,legacyId,'an exact match must migrate the earlier UUID before any API call');assert.equal(await f.page.evaluate(key=>localStorage.getItem(key),legacyKey),legacyId,'uncertain legacy sends must retain their original key');
   const accepted=await f.api.call(f.requests[0]);await f.expire(0);await f.reload();await f.open();assert.equal(await f.frame.locator('dialog textarea').inputValue(),description);
   await f.send();await f.waitForRequests(2);await f.assertIdentity(2);const retry=await f.api.call(f.requests[1]);assert.equal(retry.deduplicated,true);f.pending[1].resolve(retry);await f.assertSuccess();
   await f.page.waitForFunction(key=>localStorage.getItem(key)===null,legacyKey);f.pending[0].resolve(accepted);f.api.assertSingleReport();await f.close();
  }
  console.log('PASS exact legacy matches retain their UUID, gain recoverable content and clear both legacy and current records only after confirmation');

  {
   const f=await fixture(browser);await f.open();
   await f.page.evaluate(()=>{const native=Storage.prototype.setItem;window.restoreAircraftReportStorage=()=>{Storage.prototype.setItem=native;};Storage.prototype.setItem=function(key,value){if(String(key).startsWith('hp:aircraft-report:v1:'))throw new DOMException('Synthetic storage quota failure','QuotaExceededError');return native.call(this,key,value);};});
   await f.send();await f.frame.getByText('No se pudo acceder al almacenamiento local de reportes. Revisa este dispositivo antes de enviar.').waitFor();await f.received(1);
   assert.equal(f.requests.length,0,'a report without durable recovery state must never reach the API');assert.equal((await f.stored()).length,0);assert.equal(await f.frame.locator('dialog textarea').inputValue(),description);assert.equal(await f.frame.locator('dialog textarea').evaluate(element=>element.readOnly),false);f.api.assertReports(0,[]);
   await f.page.evaluate(()=>window.restoreAircraftReportStorage());await f.send();await f.waitForRequests(1);await f.assertIdentity(1,2);f.pending[0].resolve(await f.api.call(f.requests[0]));await f.assertSuccess();f.api.assertSingleReport();await f.close();
  }
  console.log('PASS local storage failures block API writes and allow a durable retry after storage recovers');

  {
   const f=await fixture(browser);await f.open();
   await f.page.evaluate(()=>{const native=Storage.prototype.removeItem;window.restoreAircraftReportCleanup=()=>{Storage.prototype.removeItem=native;};Storage.prototype.removeItem=function(key){if(String(key).startsWith('hp:aircraft-report:v1:'))throw new DOMException('Synthetic cleanup failure','SecurityError');return native.call(this,key);};});
   await f.send();await f.waitForRequests(1);f.pending[0].resolve(await f.api.call(f.requests[0]));
   await f.frame.getByText('Reporte guardado, pero no se pudo completar la limpieza local. La copia pendiente no equivale a otro reporte nuevo.').waitFor();await f.assertIdentity(1);
   assert.equal(await f.frame.locator('dialog').evaluate(dialog=>dialog.open),true,'a successful send with failed local cleanup must keep its explanation visible');assert.equal(await f.frame.evaluate(()=>window.reportCloseTimers.some(timer=>timer.active)),false,'cleanup errors must cancel automatic dialog closure');f.api.assertSingleReport();
   await f.page.evaluate(()=>window.restoreAircraftReportCleanup());await f.closeDialog();await f.open();assert.equal(await f.frame.locator('dialog textarea').inputValue(),description);
   await f.send();await f.waitForRequests(2);await f.assertIdentity(2);const retry=await f.api.call(f.requests[1]);assert.equal(retry.deduplicated,true);f.pending[1].resolve(retry);await f.assertSuccess();f.api.assertSingleReport();await f.close();
  }
  console.log('PASS successful sends with failed local cleanup remain visible and recover with the same key without duplicate task or alert');

  {
   const f=await fixture(browser);await f.open();await f.send();await f.waitForRequests(1);const accepted=await f.api.call(f.requests[0]);await f.expire(0);await f.closeDialog();
   await f.page.evaluate(()=>{window.firebase={auth:()=>({currentUser:{uid:'different-active-user'}})};});
   await f.frame.getByRole('button',{name:/Reportar problema a taller/}).click();await f.frame.getByText('La sesión cambió. Abre la aplicación con tu usuario antes de recuperar o enviar reportes.').waitFor();
   assert.equal(await f.frame.locator('dialog [data-report-recover]').count(),0,'a stale mounted view cannot recover the previous pilot content after authentication changes');assert.equal(await f.frame.locator('dialog textarea').isVisible(),false);
   const error=await f.frame.evaluate(async({id,description})=>{try{await window.reportAircraft('HP-1784',description,{reportId:id,isNew:false});return null;}catch(error){return error.message;}},{id:f.requests[0].idempotencyKey,description});
   assert.match(error,/La sesión cambió/);assert.equal(f.requests.length,1,'a changed authentication session must block stale view API requests');assert.equal((await f.stored(account.uid)).length,1);f.pending[0].resolve(accepted);f.api.assertSingleReport();await f.close();
  }
  console.log('PASS authentication changes block recovery and sending from the previous pilot view');

 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
