'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

test('Users endpoint requires a valid session and current Director authorization',async()=>{
 const actor={uid:'actor',email:'director@example.test',emailVerified:true,disabled:false};
 const account={role:'Director',assignedAt:'synthetic'};
 const member={uid:'member',email:'member@example.test',emailVerified:true,disabled:false,metadata:{}};
 const profile={role:'Estudiante',verified:true,email:member.email,syncedOperation:'op',syncVersion:4,syncedRole:'Estudiante',profile:{name:'Usuario de prueba',phone:'TEST-PHONE'}};
 let directoryReads=0,writes=0;
 const db={ref:key=>({get:async()=>({val:()=>key==='accountRequests/actor'?account:key==='accountRequests/member'?profile:key==='dashboard/operation'?'op':null}),update:async()=>{writes++;}})};
 const auth={verifyIdToken:async token=>{if(token!=='valid'){const error=Error();error.code='auth/id-token-revoked';throw error;}return {uid:actor.uid};},getUser:async()=>actor,listUsers:async()=>{directoryReads++;return {users:[member]};}};
 const endpoint={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'functions/index.js'),'utf8'),{exports:endpoint,console,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 async function request(action='users',token='valid'){
  let status=200,reply;const headers={};
  const res={set:(k,v)=>{headers[k]=v;},status:n=>{status=n;return res;},json:v=>{reply=v;},end(){}};
  await endpoint.accountRegistration({method:'POST',headers:{authorization:token?'Bearer '+token:''},body:{action,uid:'member',role:'Director'}},res);
  assert.equal(headers['Cache-Control'],'no-store');return {status,reply};
 }
 assert.equal((await request('users','')).status,401);
 assert.equal((await request('users','revoked')).status,401);
 for(const role of ['Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad']){
  account.role=role;
  for(const action of ['users','list','assign'])assert.equal((await request(action)).status,403);
 }
 account.role='Director';actor.disabled=true;assert.equal((await request()).status,403);actor.disabled=false;
 actor.emailVerified=false;assert.equal((await request()).status,403);actor.emailVerified=true;
 account.assignedAt='';assert.equal((await request()).status,403);account.assignedAt='synthetic';
 assert.equal(directoryReads,0);assert.equal(writes,0);
 const allowed=await request();assert.equal(allowed.status,200);assert.equal(allowed.reply.users[0].phone,'TEST-PHONE');assert.equal(directoryReads,1);assert.equal(writes,0);
});

test('Users UI still loads authorized dynamic data, filters and saves roles',async t=>{
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 t.after(()=>browser.close());
 const page=await browser.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',async route=>{
  const request=route.request();
  if(!request.url().endsWith('/accountRegistration'))return route.fulfill({body:''});
  assert.equal(request.headers().authorization,'Bearer synthetic-token');
  const body=request.postDataJSON();requests.push(body);
  const users=[{uid:'member-z',name:'Zulu de prueba',email:'zulu@example.test',phone:'TEST-PHONE',role:'Estudiante',verified:true},{uid:'member-a',name:'Ana de prueba',email:'ana@example.test',phone:'TEST-CONTACT',role:'Piloto',verified:true}];
  await route.fulfill({json:body.action==='users'?{users:[users[body.pageToken?1:0]],nextPageToken:body.pageToken?null:'page-two'}:{ok:true}});
 });
 await page.setContent('<button id="create-account"></button><p id="access-message"></p><button id="profile-requests"></button><details id="profile-menu"></details><div id="content-area"></div><div id="sidebar-tabs"></div>');
 await page.evaluate(()=>{
  window.director=true;window.isDirectorUser=()=>window.director;
  window.profileUser=()=>{if(!window.director)throw Error('Solo Director');return {uid:'actor'};};
  window.ADMIN_UID='system-admin';window.STAFF_ROLES=['Director','Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
  window.firebase={auth:()=>({currentUser:{uid:'actor',getIdToken:async()=>'synthetic-token'}})};
 });
 await page.addScriptTag({path:path.join(root,'registration.js')});
 await page.click('#profile-requests');await page.locator('[data-counts]').filter({hasText:'2 usuarios'}).waitFor();
 assert.deepEqual(await page.locator('#panel-usuarios tbody b').allTextContents(),['Ana de prueba','Zulu de prueba']);
 assert((await page.locator('#panel-usuarios').innerText()).includes('TEST-CONTACT'));
 await page.fill('[data-search]','zulu');assert.equal(await page.locator('tbody [data-save]').count(),1);
 await page.click('[data-save]');await page.locator('[data-status]').filter({hasText:'Cargo guardado'}).waitFor();
 assert.deepEqual(requests.at(-1),{action:'assign',uid:'member-z',role:'Estudiante'});
 const count=requests.length;await page.click('[data-save]');assert.equal(requests.length,count,'Already confirmed roles do not generate redundant writes');
 await page.selectOption('[data-edit]','Piloto');await page.click('[data-save]');await page.locator('[data-status]').filter({hasText:'Cargo guardado'}).waitFor();
 assert.deepEqual(requests.at(-1),{action:'assign',uid:'member-z',role:'Piloto'});
 await page.fill('[data-search]','');await page.selectOption('[data-role-filter]','Estudiante');assert((await page.locator('tbody').innerText()).includes('Sin usuarios'));
 assert.deepEqual(errors,[]);
});

test('Users directory is not installed for a non-Director session',async t=>{
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());
 await page.setContent('<button id="create-account"></button><button id="profile-requests"></button>');
 await page.evaluate(()=>{window.isDirectorUser=()=>false;});await page.addScriptTag({path:path.join(root,'registration.js')});
 await page.evaluate(()=>AccountRegistration.installUsersPage());assert.equal(await page.locator('#panel-usuarios').count(),0);
});


test('Returning to an active portal or signup form does not discard drafts',async t=>{
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());
 await page.setContent('<button id="create-account"></button><button id="profile-requests"></button><div id="access-screen"></div><div id="dashboard-app"></div><section id="account-waiting" hidden></section><input id="draft" value="Sin guardar">');
 await page.evaluate(()=>{window.isDirectorUser=()=>false;window.reloads=0;window.firebase={auth:()=>({currentUser:{reload:async()=>{window.reloads++;throw Error('Synthetic reload');}}})};});
 await page.addScriptTag({path:path.join(root,'registration.js')});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await page.evaluate(()=>reloads),0);
 await page.evaluate(()=>{document.getElementById('account-waiting').hidden=false;const dialog=document.createElement('dialog');dialog.className='signup-dialog';document.body.appendChild(dialog);dialog.showModal();window.dispatchEvent(new Event('focus'));});assert.equal(await page.evaluate(()=>reloads),0);
 await page.evaluate(()=>{document.querySelector('dialog').close();window.dispatchEvent(new Event('focus'));});assert.equal(await page.evaluate(()=>reloads),1,'Waiting users can still recheck email verification');
 assert.equal(await page.inputValue('#draft'),'Sin guardar');
});
