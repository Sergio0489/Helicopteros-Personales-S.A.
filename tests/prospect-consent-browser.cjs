'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),p=require('../functions/prospects');
const {now,config,body,memory,statement}=require('./helpers/consent-fixtures.cjs');
const root=path.join(__dirname,'..');
async function launch(t){const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>browser.close());return browser;}
async function capture(page,name){if(!process.env.HP_CONSENT_PREVIEW_DIR)return;fs.mkdirSync(process.env.HP_CONSENT_PREVIEW_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.HP_CONSENT_PREVIEW_DIR,name+'.png'),fullPage:true});}
test('both local form references submit with and without consent on desktop and mobile',async t=>{
 const browser=await launch(t);
 for(const width of [1100,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});await page.route('**/*',r=>r.abort());
  // An HTTPS origin provides the Web Crypto API without any network request.
  await page.route('https://consent.example.test/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'examples/school-consent/preview.html'),'utf8')}));
  await page.goto('https://consent.example.test/');
  assert.equal(await page.locator('[name=courseUpdates]').isChecked(),false);
  assert.equal(await page.locator('[name=courseUpdates]').getAttribute('required'),null);
  assert.equal(await page.locator('#consent-statement').textContent(),statement);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture(page,'formulario-'+width);
  for(const formId of ['school-contact','school-contact-2'])for(const accepted of [false,true]){
   await page.locator('[name=formId]').selectOption(formId);await page.locator('[name=courseUpdates]').setChecked(accepted);
   await page.getByRole('button',{name:'Simular envío'}).click();
   const payload=JSON.parse(await page.locator('#payload').textContent());assert.equal(payload.courseUpdates,accepted);assert.equal(payload.consentVersion,'hpfs-cursos-email-v1');
   assert.equal(payload.token,undefined);
   const db=memory();await p.receive(db,p.webhookInput({...payload,token:config.token},config,payload.submittedAt),payload.submittedAt);
   const contact=db.read('prospects/contacts/'+p.hash(payload.email));assert.equal(contact.consent.status,accepted?'granted':'unknown');
  }
  await page.close();
 }
});
test('CRM shows evidence and withdrawal history to School, with safe text and no Charters access',async t=>{
 const browser=await launch(t),db=memory(),key=p.hash(body.email);
 await p.receive(db,p.webhookInput({...body,interest:'Consulta ficticia. <img src=x onerror=alert(1)>'},config,now),now);
 const saved=db.read('prospects/contacts/'+key);
 await p.handle(db,'prospect-save',{record:{...saved,consentStatus:'withdrawn',consentEvidence:'Retirada ficticia por correo.'}},{uid:'school',prospectArea:'school'},'2026-11-09T15:02:00Z');
 await p.receive(db,p.webhookInput({...body,formId:'charters',requestedCourse:undefined,courseUpdates:false,consentVersion:undefined},config,now),now);
 for(const area of ['school','charters'])for(const width of [1100,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});let revoked=false;
  const scope={director:false,area,edit:false,export:false};
  await page.route('**/*',r=>r.abort());await page.setContent('<div id="role-portal"></div>');
  await page.exposeFunction('fixtureApi',async(action,input)=>{
   if(action==='prospect-session')return {access:revoked?null:scope};
   if(revoked)throw Error('Acceso retirado');
   return p.handle(db,action,input||{},{uid:area,prospectArea:area});
  });
  await page.evaluate(()=>{window.firebase={auth:()=>({currentUser:{uid:'fixture-user'}})};window.AccountRegistration={api:(a,b)=>window.fixtureApi(a,b)};window.isDirectorUser=()=>false;});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'prospects-ui.js'),'utf8')});
  await page.evaluate(scope=>window.Prospects.openStaff(scope,()=>{}),scope);
  if(area==='charters'){
   assert.equal(await page.getByRole('button',{name:'Historial de autorizaciones'}).count(),0);
   await page.getByRole('button',{name:'Historial de consultas',exact:true}).click();
   assert(!(await page.locator('dialog').textContent()).includes(statement));
  }else{
   await page.getByRole('button',{name:'Historial de autorizaciones'}).click();
   await page.locator('dialog [data-items] article').first().waitFor();
   assert((await page.locator('dialog').textContent()).includes('hpfs-cursos-email-v1'));
   assert((await page.locator('dialog [data-current]').textContent()).includes('Retiró la autorización'));
   assert.equal(await page.locator('dialog img').count(),0);
   const dialogText=await page.locator('dialog').textContent();
   assert(dialogText.includes('noviembre de 2026')&&dialogText.includes('10:00'),dialogText);
   assert(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth));
   await capture(page,'historial-'+width);
   await page.getByRole('button',{name:'Cerrar',exact:true}).click();
   await page.getByRole('button',{name:'Historial de consultas',exact:true}).click();
   await page.locator('dialog [data-items] article').first().waitFor();
   assert((await page.locator('dialog').textContent()).includes('Aceptó recibir novedades'));
   assert((await page.locator('dialog').textContent()).includes('Piloto privado'));
   assert((await page.locator('dialog').textContent()).includes('<img src=x onerror=alert(1)>'));
   assert.equal(await page.locator('dialog img').count(),0);
   await page.getByRole('button',{name:'Cerrar',exact:true}).click();
   revoked=true;
   await page.getByRole('button',{name:'Historial de autorizaciones'}).click();
   await page.getByText('Tus permisos cambiaron. Actualiza la página para volver a abrir Interesados y consultas.').waitFor();
   assert.equal(await page.locator('dialog [data-current]').textContent(),'');
  }
  await page.close();
 }
});
