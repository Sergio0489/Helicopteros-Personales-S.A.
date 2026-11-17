'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const targetUid='distinct-target',counterpartKey='user:distinct-counterpart';
const firstRevision='a'.repeat(64),firstRequest='11111111-1111-4111-8111-111111111111';
const nextRevision='b'.repeat(64),nextRequest='22222222-2222-4222-8222-222222222222';
const hostileName='Persona de prueba <img src=x onerror="window.identityXss=1">';
const motive='Verificación ficticia individual <svg onload="window.identityXss=1">';

async function fixture(t,options={}){
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),requests=[],errors=[],waiters=[];
 const config={accept:false,protected:false,eligible:true,remaining:0,status:200,previewStatus:200,hold:false,revision:firstRevision,requestId:firstRequest,...options};
 let release;
 const gate=new Promise(resolve=>release=resolve);
 t.after(async()=>{release();await browser.close();});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.message().startsWith('¿Confirmas que verificaste')&&config.accept?dialog.accept():dialog.dismiss());
 const identity={key:'user:'+targetUid,uid:targetUid,name:hostileName,email:'target@example.test',identity:'TEST-TARGET',role:'Estudiante'};
 const other={key:counterpartKey,uid:'distinct-counterpart',name:hostileName,email:'counterpart@example.test',identity:'TEST-COUNTERPART',role:'Estudiante'};
 await page.route('**/*',async route=>{
  const request=route.request();
  if(!request.url().endsWith('/accountRegistration'))return route.fulfill({body:''});
  assert.equal(request.headers().authorization,'Bearer synthetic-distinct-token');
  const body=request.postDataJSON();requests.push(body);
  if(body.action==='users')return route.fulfill({json:{users:[{...identity,uid:targetUid,verified:true,assignedAt:'fixture',identityReviewPending:true}],nextPageToken:null}});
  if(body.action==='identity-preview')return route.fulfill({json:{operation:'fixture-operation',groups:[{revision:'fixture-group',role:'Estudiante',uids:[targetUid,'distinct-counterpart'],reviewTargets:[targetUid],distinctProtected:config.protected,members:[identity,other]}]}});
  if(body.action==='identity-distinct-preview'){
   if(config.previewStatus!==200)return route.fulfill({status:config.previewStatus,json:{error:'El permiso de Director cambió.'}});
   if(!body.counterpartKey)return route.fulfill({json:{targetUid,counterpartKey:'',remaining:1,candidates:[{counterpartKey,label:hostileName}],target:[identity],counterpart:[],eligible:false,blockers:[]}});
   return route.fulfill({json:{targetUid,counterpartKey,revision:config.revision,requestId:config.requestId,eligible:config.eligible,blockers:config.eligible?[]:['El documento de identidad coincide.'],target:[identity],counterpart:[other],remaining:1}});
  }
  if(body.action==='identity-distinct-confirm'){
   for(const resolve of waiters.splice(0))resolve();
   if(config.hold)await gate;
   if(config.status!==200)return route.fulfill({status:config.status,json:{error:config.status===403?'El permiso de Director cambió.':'La pareja cambió <img src=x onerror="window.identityXss=1">.'}});
   return route.fulfill({json:{ok:true,decisionId:body.requestId,targetUid,remaining:config.remaining,resolved:config.remaining===0,deduplicated:false}});
  }
  throw Error('Unexpected synthetic operation '+body.action);
 });
 await page.setContent('<button id="create-account"></button><p id="access-message"></p><button id="profile-requests"></button><details id="profile-menu"></details><div id="content-area"></div><div id="sidebar-tabs"></div>');
 await page.evaluate(director=>{
  window.isDirectorUser=()=>director;
  window.profileUser=()=>{if(!director)throw Error('Solo Director');return {uid:'director-fixture'};};
  window.ADMIN_UID='root-fixture';window.STAFF_ROLES=['Director','Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
  window.firebase={auth:()=>({currentUser:{uid:'director-fixture',getIdToken:async()=>'synthetic-distinct-token'}})};
  window.consumedMotives=[];window.ChangeHistory={getReason:()=> 'Motivo global no relacionado',consume:reason=>window.consumedMotives.push(reason)};
 },options.director!==false);
 await page.addScriptTag({path:path.join(root,'registration.js')});
 async function openParent(){await page.click('#profile-requests');await page.locator('[data-counts]').filter({hasText:'1 usuarios'}).waitFor();await page.click('[data-identities]');await page.locator('[data-distinct]').waitFor();}
 async function openDistinct(){await page.click('[data-distinct]');await page.locator('[data-distinct-facts]').filter({hasText:'TEST-COUNTERPART'}).waitFor();}
 async function ready(){await page.fill('[data-distinct-reason]',motive);await page.check('[data-distinct-verified]');}
 const commits=()=>requests.filter(body=>body.action==='identity-distinct-confirm');
 return {page,config,requests,errors,openParent,openDistinct,ready,commits,release,waitForCommit:()=>commits().length?Promise.resolve():new Promise(resolve=>waiters.push(resolve))};
}

test('distinct-person review is separate from merge, escapes names and cancels without writes',async t=>{
 const f=await fixture(t,{protected:true});await f.openParent();
 assert.equal(await f.page.locator('[data-unify]').isEnabled(),false,'a confirmed distinct-person pair must not offer group merging');
 await f.openDistinct();
 assert.equal(await f.page.locator('[data-distinct-facts] img').count(),0);
 assert((await f.page.locator('[data-distinct-facts]').textContent()).includes(hostileName));
 assert.equal(await f.page.evaluate(()=>window.identityXss),undefined);
 assert.equal(await f.page.locator('[data-distinct-confirm]').isEnabled(),false);
 await f.ready();assert.equal(await f.page.locator('[data-distinct-confirm]').isEnabled(),true);
 await f.page.click('[data-distinct-confirm]');
 assert.equal(f.commits().length,0,'cancelling confirmation must not send a decision');
 await f.page.keyboard.press('Escape');await f.page.locator('[data-distinct-close]').waitFor({state:'detached'});
 assert.equal(f.requests.filter(r=>r.action==='identity-merge').length,0,'the distinct-person button must never invoke merge');
 assert.equal(await f.page.locator('[data-groups]>section').count(),1);
 assert.deepEqual(f.errors,[]);
});

test('explicit distinct-person confirmation sends the reviewed pair and own motive once without granting access',async t=>{
 const f=await fixture(t,{accept:true,hold:true,remaining:2});await f.openParent();await f.openDistinct();await f.ready();
 await f.page.evaluate(()=>{const button=document.querySelector('[data-distinct-confirm]');button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await f.waitForCommit();assert.equal(f.commits().length,1,'double confirmation must create one request');
 assert.deepEqual(f.commits()[0],{action:'identity-distinct-confirm',targetUid,counterpartKey,revision:firstRevision,requestId:firstRequest,reason:motive,confirm:true,verifiedIndependently:true});
 await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-distinct-close]').isVisible(),true,'Escape must not hide a decision while its result is uncertain');
 f.release();await f.page.locator('[data-distinct-status]').filter({hasText:'Quedan 2 coincidencias pendientes'}).waitFor();
 assert.doesNotMatch(await f.page.locator('[data-distinct-status]').textContent(),/acceso habilitado|revisión resuelta/i);
 assert.equal(await f.page.locator('[data-groups]>section').count(),1,'partial confirmation must preserve the group for remaining review');
 assert.equal(await f.page.locator('[data-unify]').isEnabled(),false);
 assert.equal(f.requests.filter(r=>r.action==='identity-merge'||r.action==='assign').length,0);
 assert.deepEqual(await f.page.evaluate(()=>window.consumedMotives),[],'a pair-specific motive must not consume a separate pending global motive');
 assert.equal(await f.page.evaluate(()=>window.identityXss),undefined);assert.deepEqual(f.errors,[]);
});

test('stale or revoked distinct-person decisions stay visible and require a fresh server review',async t=>{
 for(const status of [409,403]){
  const f=await fixture(t,{accept:true,status});await f.openParent();await f.openDistinct();await f.ready();await f.page.click('[data-distinct-confirm]');
  await f.page.locator('[data-distinct-status]').filter({hasText:'Vuelve a consultar antes de confirmar'}).waitFor();
  assert.equal(await f.page.locator('[data-groups]>section').count(),1);
  assert.equal(await f.page.locator('[data-distinct-confirm]').isEnabled(),false);
  assert.doesNotMatch(await f.page.locator('[data-distinct-status]').textContent(),/Revisión resuelta|Decisión registrada/);
  assert.equal(await f.page.locator('[data-distinct-status] img').count(),0);
  if(status===409){
   f.config.status=200;f.config.revision=nextRevision;f.config.requestId=nextRequest;
   await f.page.click('[data-distinct-refresh]');await f.page.locator('[data-distinct-facts]').filter({hasText:'TEST-COUNTERPART'}).waitFor();
   await f.ready();await f.page.click('[data-distinct-confirm]');await f.page.locator('[data-distinct-status]').filter({hasText:'Revisión resuelta'}).waitFor();
   assert.equal(f.commits()[1].revision,nextRevision);assert.equal(f.commits()[1].requestId,nextRequest);
  }else{
   f.config.previewStatus=403;await f.page.click('[data-distinct-refresh]');
   await f.page.locator('[data-merge-status]').filter({hasText:'El permiso de Director cambió'}).waitFor();
   assert.equal(await f.page.locator('[data-distinct-close]').count(),0);
   assert.equal(f.commits().length,1,'a revoked review must not reuse the former client permission');
  }
  assert.equal(f.requests.filter(r=>r.action==='identity-merge').length,0);assert.deepEqual(f.errors,[]);
 }
});

test('a strong identity conflict cannot be confirmed by the distinct-person UI',async t=>{
 const f=await fixture(t,{eligible:false,accept:true});await f.openParent();await f.openDistinct();await f.ready();
 await f.page.locator('[data-distinct-status]').filter({hasText:'El documento de identidad coincide'}).waitFor();
 assert.equal(await f.page.locator('[data-distinct-confirm]').isEnabled(),false);
 await f.page.evaluate(()=>document.querySelector('[data-distinct-confirm]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 assert.equal(f.commits().length,0);assert.equal(f.requests.filter(r=>r.action==='identity-merge').length,0);assert.deepEqual(f.errors,[]);
});

test('a non-Director session receives no distinct-person controls',async t=>{
 const f=await fixture(t,{director:false});await f.page.evaluate(()=>AccountRegistration.installUsersPage());
 assert.equal(await f.page.locator('#panel-usuarios').count(),0);assert.equal(await f.page.locator('[data-distinct]').count(),0);
 assert.equal(f.requests.length,0);assert.deepEqual(f.errors,[]);
});
