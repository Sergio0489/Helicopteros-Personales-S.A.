'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {catalog}=require('../functions/boxes'),{boxView}=require('../functions/box-view');
const root=path.resolve(__dirname,'..'),data={fleet:{HP_1784:{reg:'HP-1784',model:'Aeronave de prueba',status:'operativo',component_schema_v2:true,mantenimiento:[],documentos:[]}},pilotos:[{id:'pilot-record',authUid:'pilot-fixture',nombre:'Piloto de prueba',verificaciones:[]}],itinerarios:[],school:{students:[],registry:{clients:[],entries:[]}}};
const account={uid:'pilot-fixture',role:'Piloto',assignedAt:'fixture',recordKind:'pilot',recordId:'pilot-record',syncStatus:'matched',profile:{name:'Piloto de prueba'}};
const policy=Object.fromEntries(Object.entries(catalog).map(([page,boxes])=>[page,{actions:{view:true,edit:false},boxes:Object.fromEntries(boxes.map(box=>[box.id,{view:true,edit:false}]))}]));
let requests=[];const pending=[],requestWaiters=[];
function waitForRequests(count){if(requests.length>=count)return Promise.resolve();return new Promise(resolve=>requestWaiters.push({count,resolve}));}
const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]);if(req.url==='/test'){res.setHeader('Content-Type','text/html');res.end('<body><div id="shell"></div><script src="role-main-view.js"></script></body>');}else if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(file));}else{res.statusCode=404;res.end();}});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.clock.install();
  await page.exposeFunction('holdAircraftReport',body=>new Promise(resolve=>{requests.push(structuredClone(body));pending.push(resolve);for(const waiter of requestWaiters.splice(0))if(requests.length>=waiter.count)waiter.resolve();else requestWaiters.push(waiter);}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));await page.goto('http://127.0.0.1:'+server.address().port+'/test');
  await page.evaluate(()=>{window.AccountRegistration={api:(action,body)=>{if(action!=='aircraft-report')throw Error('Unexpected API action '+action);return window.holdAircraftReport(body);}};window.addEventListener('message',event=>{if(event.data?.action==='aircraft-report')window.aircraftReportMessages.push(event.data);});window.aircraftReportMessages=[];});
  const view=boxView(data,account,policy,'aeronaves'),result={native:{...view,operation:'fixture',uid:account.uid},pages:[{id:'aeronaves',name:'Aeronaves'}],name:'Piloto de prueba',role:'Piloto'};
  await page.evaluate(async result=>{window.dispose=await RoleMainView.mount(document.getElementById('shell'),result,'aeronaves',()=>{});},result);
  let frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('#panel-0').waitFor();
  await frame.getByRole('button',{name:/Reportar problema a taller/}).click();await frame.locator('dialog textarea').fill('Vibración en el rotor de cola');await frame.locator('dialog [data-send]').click();
  await waitForRequests(1);await page.clock.fastForward(25001);await frame.getByText(/Puedes reintentar el mismo formulario/).waitFor();
  await frame.locator('dialog [data-send]').click();await waitForRequests(2);
  assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey,'a retry after the confirmation timeout must keep the server idempotency key');
  const sent=await page.evaluate(()=>window.aircraftReportMessages.map(message=>message.id));assert.equal(sent.length,2);assert.equal(sent[0],sent[1],'the iframe request and response correlation id must remain stable');
  pending[1]({ok:true,taskId:'synthetic-task',deduplicated:true});await frame.getByText('Reporte guardado como tarea pendiente de taller.').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS delayed report confirmation preserves request and backend idempotency IDs across retry');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
