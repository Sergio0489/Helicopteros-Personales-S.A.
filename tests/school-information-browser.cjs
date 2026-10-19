'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {boxView}=require('../functions/box-view'),{applyChanges}=require('../functions/box-write');
const root=path.resolve(__dirname,'..'),at='2026-10-19';
const date=days=>new Date(Date.parse(at+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const fixture=()=>({fleet:{},pilotos:[],itinerarios:[],school:{version:1,students:[],rates:{},intakes:[],registry:{entries:[],clients:[]},certificates:{exploitation:{expiresOn:date(90)},operation:{expiresOn:date(60)},simulator:{expiresOn:date(-1)}}}});
let browser,server,origin;
before(async()=>{
 server=http.createServer((req,res)=>{const name=req.url.split('?')[0];if(name==='/test'){res.setHeader('Content-Type','text/html');res.end('<div id="shell"></div><script src="role-main-view.js"></script>');return;}const file=path.join(root,name);if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));}else{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function director(t,data=fixture()){
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({body:''}));
 await page.clock.install({time:new Date('2026-10-19T18:00:00Z')});
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<head>','<head><base href="'+origin+'/">');await page.setContent(html);
 await page.evaluate(data=>{crypto.randomUUID ||= ()=>String(Math.random());window.CLOUD_INITIAL=data;window.writes=[];window.cloudWrite=async next=>{if(window.failSave)throw Error('Fallo de prueba');writes.push(structuredClone(next));};window.showCloudError=e=>{window.lastSaveError=e.message;};},data);
 for(const file of ['functions/boxes.js','functions/school-certificates.js','dashboard.js','students.js','registro.js','pilots-ui.js','school-info.js','box-ui.js'])await page.addScriptTag({path:path.join(root,file)});
 await page.evaluate(()=>{document.getElementById('access-screen').hidden=true;document.getElementById('dashboard-app').hidden=false;escuelaTab.click();closeDrawer();});
 t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});return page;
}
test('school information, isolated certificate saves, failures and synchronized alerts',async t=>{
 const page=await director(t),panel=page.locator('#panel-escuela');
 assert.equal(await panel.locator('h1').innerText(),'HP FLIGHT SCHOOL');assert((await panel.innerText()).includes('AAC/DSA/EEAP/007'));
 assert.equal(await panel.locator('[data-school-person]').count(),5);assert.equal(await panel.locator('.school-specifications li').count(),7);
 assert.equal(await panel.locator('.school-specifications time[datetime="2017-05-03"]').count(),6);
 assert.equal(await panel.locator('.school-specifications time[datetime="2021-07-15"]').count(),1);
 for(const [id,level]of [['exploitation','warn'],['operation','orange'],['simulator','danger']])assert.equal(await panel.locator('[data-school-certificate='+id+']').getAttribute('data-level'),level);
 assert.equal(await page.evaluate(()=>writes.length),0);
 const initial=await page.evaluate(()=>structuredClone(previewData));
 for(const id of ['exploitation','operation','simulator']){
  const before=await page.evaluate(()=>structuredClone(previewData));
  await panel.locator('[data-school-cert-edit='+id+']').click();await page.locator('dialog [name=expiresOn]').fill('01/01/2028');await page.locator('dialog [type=submit]').click();await page.locator('dialog.school-dialog').waitFor({state:'detached'});
  const expected=structuredClone(before);expected.school.certificates[id].expiresOn='2028-01-01';assert.deepEqual(await page.evaluate(()=>structuredClone(previewData)),expected);
  assert.equal(await panel.locator('[data-school-certificate='+id+']').getAttribute('data-level'),'ok');
 }
 assert.equal(await page.locator('#resumen-content [data-alert-kind=school]').count(),0);
 await panel.locator('[data-school-cert-edit=operation]').click();await page.locator('dialog [name=expiresOn]').fill('18/10/2026');await page.locator('dialog [type=submit]').click();await page.locator('dialog.school-dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('#resumen-content [data-alert-kind=school] .alert-row').count(),1);
 assert((await page.locator('#resumen-content [data-alert-kind=school]').innerText()).includes('Certificado de Operación'));
 const saved=await page.evaluate(()=>structuredClone(previewData));
 await page.evaluate(()=>{window.failSave=true;});await panel.locator('[data-school-cert-edit=operation]').click();await page.locator('dialog [name=expiresOn]').fill('01/01/2029');await page.locator('dialog [type=submit]').click();await page.locator('dialog .record-error').filter({hasText:'No se pudo guardar'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>structuredClone(previewData)),saved);await page.locator('dialog [data-close]').click();await page.locator('dialog.school-dialog').waitFor({state:'detached'});
 await page.evaluate(()=>{window.failSave=false;});await panel.locator('[data-school-cert-edit=operation]').click();await page.locator('dialog [name=expiresOn]').fill('');await page.locator('dialog [type=submit]').click();await page.locator('dialog.school-dialog').waitFor({state:'detached'});
 assert.equal(await panel.locator('[data-school-certificate=operation]').getAttribute('data-level'),'empty');assert.equal(await page.locator('#resumen-content [data-alert-kind=school]').count(),0);
 const reloaded=await director(t,await page.evaluate(()=>structuredClone(previewData)));assert.equal(await reloaded.locator('[data-school-certificate=exploitation] time').getAttribute('datetime'),'2028-01-01');
 const unchanged=structuredClone(initial);delete unchanged.school.certificates;const after=await page.evaluate(()=>structuredClone(previewData));delete after.school.certificates;assert.deepEqual(after,unchanged);
});
test('school mobile layout and expiration updates at midnight in Panama',async t=>{
 const data=fixture();data.school.certificates.operation.expiresOn=at;
 const page=await director(t,data);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>closeDrawer());
 assert(await page.locator('#panel-escuela').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 for(const node of await page.locator('[data-school-person]').all())assert(await node.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
 assert.equal(await page.locator('[data-school-certificate=operation]').getAttribute('data-level'),'orange');
 await page.clock.fastForward(12*3600000);
 assert.equal(await page.locator('[data-school-certificate=operation]').getAttribute('data-level'),'danger');
 assert.equal(await page.evaluate(()=>writes.length),0);
 if(process.env.SCHOOL_SCREENSHOTS){await page.evaluate(()=>closeDrawer());await page.clock.runFor(500);await page.screenshot({path:'/tmp/school-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1050});await page.clock.runFor(500);await page.evaluate(()=>{document.body.style.overflow='visible';document.querySelector('.content').style.overflow='visible';});await page.screenshot({path:'/tmp/school-desktop.png',fullPage:true});}
});
test('role view permits authorized certificate edits and blocks read-only users',async t=>{
 let data=fixture();const account={role:'Gerente',uid:'manager',assignedAt:'test'};
 const policy={escuela:{actions:{view:true,edit:true},boxes:{information:{view:true},certificates:{view:true,edit:true}}}};
 const page=await browser.newPage(),errors=[];t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.fulfill({body:''}));
 await page.exposeFunction('testSave',body=>{data=applyChanges(data,body.before,body.after,policy,account).data;return {operation:'saved'};});await page.goto(origin+'/test');await page.evaluate(()=>{window.AccountRegistration={api:(_,body)=>window.testSave(body)};});
 const mount=async(legacy=false)=>{const native={...boxView(data,account,policy,'escuela'),operation:'test',uid:'manager'};if(legacy)delete native.schoolCertificates;await page.evaluate(async native=>{window.dispose?.();window.dispose=await RoleMainView.mount(document.getElementById('shell'),{native,pages:[{id:'escuela',name:'Escuela'}],name:'Gerente de prueba',role:'Gerente'},'escuela',()=>{});},native);const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('#panel-escuela.active').waitFor({state:'visible'});return frame;};
 let frame=await mount();await frame.locator('[data-school-cert-edit=simulator]').click();await frame.locator('dialog [name=expiresOn]').fill('31/12/2028');await frame.locator('dialog [type=submit]').click();await frame.locator('dialog.school-dialog').waitFor({state:'detached'});assert.equal(data.school.certificates.simulator.expiresOn,'2028-12-31');
 policy.escuela.actions.edit=false;policy.escuela.boxes.certificates.edit=false;frame=await mount();assert.equal(await frame.locator('[data-school-cert-edit]').count(),0);assert.equal(await frame.locator('[data-school-certificate=simulator] time').getAttribute('datetime'),'2028-12-31');
 policy.escuela.boxes.certificates.view=false;frame=await mount();assert.equal(await frame.locator('[data-school-certificates]').count(),0);assert.equal(await frame.locator('[data-school-person]').count(),5);
 policy.escuela.boxes.certificates.view=true;frame=await mount(true);assert.equal(await frame.locator('[data-school-certificates]').count(),0,'Legacy server must not show missing dates as empty certificates');
});
