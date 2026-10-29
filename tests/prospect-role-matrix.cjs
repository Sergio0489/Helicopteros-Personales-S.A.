'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
test('Director can configure CRM page for Administrative without granting access by default',async t=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',r=>r.abort());
 await page.setContent('<div id="profile-menu"></div><button id="profile-roles">Roles</button>');
 await page.evaluate(()=>{window.STAFF_ROLES=['Director','Administrativo','Piloto'];window.profileUser=()=>({uid:'fictional-director'});window.previewData={school:{accessConfiguration:{roles:{Administrativo:{}}}}};window.fleet=[];window.suggestedRolePolicy=()=>({});window.cloudWrite=async next=>{window.saved=next;};window.AccountRegistration={api:async()=>({version:7,prospectRolePermissions:true,outputPermissions:true,boxEditing:true,aircraftSchedule:true})};});
 for(const file of ['functions/boxes.js','box-permissions-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
 await page.evaluate(()=>openBoxPermissions());await page.locator('[data-role]').selectOption('Administrativo');
 await page.getByText('Interesados y consultas',{exact:false}).first().click();
 assert.equal(await page.locator('[data-page="interesados"]').inputValue(),'none');
 await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
 assert.equal(await page.evaluate(()=>Object.hasOwn(saved.school.accessConfiguration.roles.Administrativo,'interesados')),false);
 await page.locator('[data-page="interesados"]').selectOption('edit');
 await page.locator('[data-page-box="interesados"]').selectOption('edit');
 await page.locator('[data-output-page="interesados"]').check();await page.locator('[data-output-box="interesados"]').check();
 await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
 const saved=await page.evaluate(()=>window.saved.school.accessConfiguration.roles.Administrativo.interesados);
 assert.deepEqual(saved.boxes.contacts,{view:true,edit:true,export:true});assert.equal(saved.actions.export,true);
 await page.locator('[data-page="interesados"]').selectOption('none');await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
 assert.equal(await page.evaluate(()=>saved.school.accessConfiguration.roles.Administrativo.interesados.actions.view),false);
 await page.locator('[data-role]').selectOption('Piloto');assert.equal(await page.locator('[data-page="interesados"]').isDisabled(),true);
});

test('saving another page preserves CRM grants and explicit denials with an older backend',async t=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>browser.close());
 const {scope}=require('../functions/prospect-access');
 const user={uid:'fictional-staff',email:'staff@example.test',emailVerified:true};
 const account={role:'Administrativo',assignedAt:'fixture',prospectAccess:{email:user.email,area:'charters',assignedAt:'fixture'}};
 for(const ready of [true,false])for(const crm of [undefined,{}, {actions:{view:true,edit:false,export:true},boxes:{contacts:{view:true,edit:false,export:true}}}]){
  await t.test(`capability ${ready}; CRM ${crm===undefined?'unset':crm.actions?'read/export':'denied'}`,async()=>{
   const page=await browser.newPage();
   await page.route('**/*',r=>r.abort());
   await page.setContent('<div id="profile-menu"></div><button id="profile-roles">Roles</button>');
   const policy=crm===undefined?{}:{interesados:crm};
   await page.evaluate(({policy,ready})=>{
    window.STAFF_ROLES=['Director','Administrativo'];window.profileUser=()=>({uid:'fictional-director'});
    window.previewData={school:{accessConfiguration:{roles:{Administrativo:policy}}}};
    window.fleet=[];window.suggestedRolePolicy=()=>({});window.cloudWrite=async next=>{window.saved=next;};
    window.AccountRegistration={api:async()=>({version:7,prospectRolePermissions:ready,outputPermissions:true,boxEditing:true,aircraftSchedule:true})};
   },{policy,ready});
   for(const file of ['functions/boxes.js','box-permissions-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
   await page.evaluate(()=>openBoxPermissions());await page.locator('[data-role]').selectOption('Administrativo');
   assert.equal(await page.locator('[data-page="interesados"]').isDisabled(),!ready);
   await page.locator('[data-page="aeronaves"]').selectOption('view');
   await page.locator('[data-page-box="aeronaves"][data-box="identity"]').selectOption('view');
   await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
   const saved=await page.evaluate(()=>window.saved.school.accessConfiguration.roles.Administrativo);
   assert.deepEqual(saved.interesados,crm,'unrelated saves must preserve the exact CRM policy');
   assert.deepEqual(scope(user,account,false,saved),scope(user,account,false,policy),'the effective grant must not change');
   assert.equal(saved.aeronaves.boxes.identity.view,true);
   if(ready&&crm?.actions){
    await page.getByText('Interesados y consultas',{exact:false}).first().click();
    await page.locator('[data-output-box="interesados"]').uncheck();
    await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
    assert.equal(await page.evaluate(()=>saved.school.accessConfiguration.roles.Administrativo.interesados.boxes.contacts.export),false);
    await page.locator('[data-output-page="interesados"]').uncheck();
    await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
    assert.equal(await page.evaluate(()=>saved.school.accessConfiguration.roles.Administrativo.interesados.actions.export),false);
    await page.locator('[data-page-box="interesados"]').selectOption('none');
    await page.getByRole('button',{name:'Guardar permisos',exact:true}).click();
    assert.equal(await page.evaluate(()=>saved.school.accessConfiguration.roles.Administrativo.interesados.boxes.contacts.view),false);
   }
   await page.close();
  });
 }
});
