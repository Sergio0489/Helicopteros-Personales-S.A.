'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {boxView}=require('../functions/box-view'),{applyChanges}=require('../functions/box-write');
const {findings}=require('../scripts/public-privacy.cjs');
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
 await page.evaluate(data=>{crypto.randomUUID ||= ()=>'test-'+Math.random().toString(36).slice(2);window.CLOUD_INITIAL=data;window.writes=[];window.cloudWrite=async next=>{if(window.failSave)throw Error('Fallo de prueba');writes.push(structuredClone(next));};window.showCloudError=e=>{window.lastSaveError=e.message;};},data);
 for(const file of ['functions/boxes.js','functions/company.js','functions/school-information.js','functions/school-certificates.js','dashboard.js','students.js','registro.js','pilots-ui.js','company-ui.js','school-info.js','box-ui.js'])await page.addScriptTag({path:path.join(root,file)});
 await page.evaluate(()=>{document.getElementById('access-screen').hidden=true;document.getElementById('dashboard-app').hidden=false;escuelaTab.click();closeDrawer();});
 t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});return page;
}
test('company personnel, linked org names, school certificate deletion and mobile layout',async t=>{
 const data=fixture();data.pilotos=[{id:'pilot-example',nombre:'Piloto de prueba',verificaciones:[]}];data.school.students=[{id:'student-example',name:'Estudiante de prueba',courses:[]}];
 const page=await director(t,data);await page.evaluate(()=>empresaTab.click());const panel=page.locator('#panel-empresa');
 assert.equal(await panel.locator('h1').innerText(),'HP CHARTER');assert.equal(await panel.locator('[data-school-person]').count(),5);
 await panel.locator('[data-personnel-new]').click();assert.equal(await page.locator('dialog [name=licencia],dialog [name=medico],dialog [name=verificaciones]').count(),0);
 await page.locator('dialog [name=nombre]').fill('Colaborador de prueba');await page.locator('dialog [name=position]').fill('Operaciones');await page.locator('dialog [name=email]').fill('personal@example.test');await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
 const person=await page.evaluate(()=>previewData.school.personnel[0]);assert.equal(person.name,'Colaborador de prueba');assert.equal(person.fechaInicioHP,'2026-10-19');
 await panel.locator('[data-school-content=people][data-content-id=director]').click();const options=await page.locator('#organization-people option').evaluateAll(x=>x.map(n=>n.value));assert.equal(options.length,3);await page.locator('dialog [name=name]').fill(options.find(v=>v.startsWith('Colaborador')));await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>previewData.school.charter.information.people[1].personRef),{kind:'personnel',id:person.id});
 await panel.locator('[data-personnel-edit]').click();await page.locator('dialog [name=nombre]').fill('Colaborador actualizado');await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
 assert.equal(await panel.locator('[data-school-person=director] h3').innerText(),'Colaborador actualizado');
 await page.evaluate(()=>escuelaTab.click());const school=page.locator('#panel-escuela');await school.locator('[data-school-content=people][data-content-id=director]').click();const student=await page.locator('#organization-people option').evaluateAll(x=>x.map(n=>n.value).find(v=>v.startsWith('Estudiante')));await page.locator('dialog [name=name]').fill(student);await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
 await page.evaluate(()=>{previewData.school.students[0].name='Estudiante actualizado';SchoolInformation.refresh();});assert.equal(await school.locator('[data-school-person=director] h3').innerText(),'Estudiante actualizado');
 await school.locator('[data-cert-delete=operation]').click();assert.equal(await school.locator('[data-school-certificate=operation]').count(),0);assert.equal(await page.evaluate(()=>previewData.school.certificates.operation),undefined);
 await school.locator('[data-cert-delete=exploitation]').click();await school.locator('[data-cert-delete=simulator]').click();assert.equal(await page.locator('#resumen-content [data-alert-kind=school]').count(),0);
 const saved=await page.evaluate(()=>structuredClone(previewData));delete saved.school.information.certificates;const reload=await director(t,saved);assert.equal(await reload.locator('[data-school-certificate]').count(),2,'Only the two charter defaults remain; school deletion persists even if RTDB omits an empty array');
 await page.evaluate(()=>empresaTab.click());await panel.locator('[data-school-cert-edit=operation]').click();await page.locator('dialog [name=expiresOn]').fill('18/10/2026');await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('#resumen-content [data-alert-kind=charter] .alert-row').count(),1);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>closeDrawer());await page.clock.runFor(500);
 const heading=await panel.locator('.school-institution-heading').boundingBox(),first=await panel.locator('.school-organization').boundingBox();assert(heading.y+heading.height<=first.y+1);
 const overflow=await panel.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert(overflow.scroll<=overflow.width+2,JSON.stringify(overflow));
 await page.locator('#sidebar').evaluate(el=>el.style.transition='none');await page.screenshot({path:'/tmp/charter-mobile.png'});await panel.locator('[data-charter-personnel]').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/charter-personnel-mobile.png'});await panel.locator('h1').scrollIntoViewIfNeeded();await page.setViewportSize({width:1440,height:1050});await page.clock.runFor(500);await page.screenshot({path:'/tmp/charter-desktop.png'});
});
test('role personnel and certificate edits remain isolated; read-only directory works',async t=>{
 let data=fixture();data.school.personnel=[{id:'person-test',authUid:'staff-owner',directoryKind:'personnel',name:'Personal de prueba',email:'staff@example.test',notes:'INFORMACION-RESERVADA'}];data.school.charter={information:require('../functions/company').value(data.school),certificates:{operation:{expiresOn:'2028-01-01'}}};data.school.charter.information.people[1]={...data.school.charter.information.people[1],personRef:{kind:'personnel',id:'person-test'}};
 const account={role:'Gerente',uid:'test-manager'},policy={charter:{actions:{view:true,edit:true},boxes:{information:{view:true},certificates:{view:true,edit:true},personnel:{view:true,edit:true}}}};
 const page=await browser.newPage(),errors=[];t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.fulfill({body:''}));await page.exposeFunction('testSave',body=>{data=applyChanges(data,body.before,body.after,policy,account).data;return {operation:'saved'};});await page.goto(origin+'/test');await page.evaluate(()=>window.AccountRegistration={api:(_,body)=>window.testSave(body)});
 const mount=async()=>{const native={...boxView(data,account,policy,'charter'),operation:'test',uid:account.uid};await page.evaluate(async native=>{window.dispose?.();window.dispose=await RoleMainView.mount(document.getElementById('shell'),{native,pages:[{id:'charter',name:'HP CHARTER'}],role:'Gerente'},'charter',()=>{});},native);const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('#panel-empresa.active').waitFor({state:'visible'});return frame;};
 let frame=await mount();assert.equal(await frame.locator('#panel-empresa [data-school-person=director] h3').innerText(),'Personal de prueba');assert.equal(await frame.locator('[data-cert-delete]').count(),0);
 await frame.locator('[data-personnel-edit]').click();await frame.locator('dialog [name=nombre]').fill('Personal editado');await frame.locator('dialog [type=submit]').click();await frame.locator('dialog').waitFor({state:'detached'});assert.equal(data.school.personnel[0].name,'Personal editado');assert.equal(data.school.personnel[0].authUid,'staff-owner');assert.equal(data.school.personnel[0].directoryKind,'personnel');
 await frame.locator('#panel-empresa [data-school-cert-edit=operation]').click();await frame.locator('dialog [name=expiresOn]').fill('01/12/2028');await frame.locator('dialog [type=submit]').click();await frame.locator('dialog').waitFor({state:'detached'});assert.equal(data.school.charter.certificates.operation.expiresOn,'2028-12-01');
 policy.charter.actions.edit=false;frame=await mount();assert.equal(await frame.locator('[data-personnel-edit]').count(),0);assert.equal(await frame.locator('[data-personnel-select]').isEnabled(),true);await frame.locator('[data-personnel-search]').fill('no match');assert.equal(await frame.locator('[data-personnel-select]').count(),0);
 policy.charter.boxes.personnel.view=false;const projection=boxView(data,account,policy,'charter');assert(!JSON.stringify(projection).includes('INFORMACION-RESERVADA'));assert(!JSON.stringify(projection).includes('staff@example.test'));frame=await mount();assert.equal(await frame.locator('[data-charter-personnel]').count(),0);assert.equal(await frame.locator('#panel-empresa [data-school-person=director] h3').innerText(),'Personal editado');
});
test('staff classification moves the visible dossier out of the student directory while retaining its ledger',async t=>{
 const data=fixture();data.school.students=[{id:'s-visible',name:'Estudiante visible',courses:[]},{id:'s-staff',name:'Colaborador clasificado',directoryKind:'personnel',courses:[]}];data.school.personnel=[{id:'staff',name:'Colaborador clasificado',directoryKind:'personnel',authUid:'owner'}];const page=await director(t,data);
 await page.evaluate(()=>{const tab=[...document.querySelectorAll('#sidebar-tabs .aircraft-tab')].find(el=>el.textContent.includes('ESTUDIANTES'));tab.click();});
 assert.deepEqual(await page.locator('#school-student-list b').allTextContents(),['Estudiante visible']);assert.equal(await page.evaluate(()=>previewData.school.students.length),2);
 await page.evaluate(()=>empresaTab.click());assert.equal(await page.locator('[data-personnel-select]').count(),1);assert.equal(await page.locator('[data-personnel-profile] h2').innerText(),'Colaborador clasificado');
});
