'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {boxView}=require('../functions/box-view');
const root=path.resolve(__dirname,'..');
// Entirely fictional records; no Firebase or live data is used.
const data={fleet:{HP1186:{component_schema_v2:true,ciclos_totales:2200,ciclos_limite:100,limite_helice:'incorrecto',helice1_ciclos:1920,helice1_limite:2400,helice2_ciclos:3000,helice2_limite:3000}},school:{students:[],registry:{clients:[],entries:[]}},pilotos:[]};
const actor={role:'Mecánico',uid:'test-mechanic',assignedAt:'test'};
const policy=visible=>({pendientes:{actions:{view:true,edit:false},boxes:{aircraft:{view:visible,edit:false},pilots:{view:true,edit:false}}}});
const server=http.createServer((req,res)=>{
 const file=path.join(root,req.url.split('?')[0]);
 if(req.url==='/test'){res.setHeader('Content-Type','text/html');res.end('<body><div id="shell"></div><script src="role-main-view.js"></script></body>');}
 else if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(file));}
 else{res.statusCode=404;res.end();}
});
(async()=>{
 let browser;
 try{
  const original=JSON.stringify(data);
  const allowed=boxView(data,actor,policy(true),'pendientes'),denied=boxView(data,actor,policy(false),'pendientes');
  assert.equal(allowed.data.fleet.HP1186.ciclos_totales,2200);
  assert.deepEqual(denied.data.fleet,{});
  assert.throws(()=>boxView(data,actor,{},'pendientes'),/permiso/);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:''}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/test');
  for(const visible of [true,false]){
   const view=visible?allowed:denied;
   await page.evaluate(async view=>{window.dispose?.();window.dispose=await RoleMainView.mount(document.getElementById('shell'),{native:{...view,operation:'fixture',uid:'test-mechanic'},pages:[{id:'pendientes',name:'Pendientes'}],name:'Test',role:'Mecánico'},'pendientes',()=>{});},view);
   const frame=await(await page.locator('iframe').elementHandle()).contentFrame();
   await frame.locator('#panel-resumen.active').waitFor();
   for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:844});
    const info=frame.locator('[data-alert-level="info"]');assert.equal(await info.count(),visible?2:0);
    if(!visible){assert.equal(await frame.locator('[data-alert-kind="aircraft"]').count(),0);continue;}
    assert.equal(await frame.locator('[data-alert-level="warn"]').count(),1);
    assert.equal(await frame.locator('[data-alert-level="danger"]').count(),1);
    assert.match(await info.first().innerText(),/Motor izquierdo[\s\S]*Límite pendiente de configurar/);
    assert.match(await frame.locator('.pending-configuration').innerText(),/2/);
    assert.match(await frame.locator('.pending-upcoming').innerText(),/1/);
    assert.match(await frame.locator('.pending-urgent').innerText(),/1/);
    assert.equal(await info.first().evaluate(e=>e.style.background),'rgba(0, 89, 179, 0.08)');
    const layout=await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('.alert-row')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,width:e.clientWidth};})}));
    assert(layout.scroll<=layout.width+1,JSON.stringify(layout));
    assert(layout.rows.every(r=>r.scroll<=r.width+1&&r.left>=0&&r.right<=layout.width+1),JSON.stringify(layout));
    await info.last().scrollIntoViewIfNeeded();assert(await info.last().isVisible());
   }
  }
  assert.equal(JSON.stringify(data),original);assert.deepEqual(errors,[]);
  console.log('PASS configuration notices, independent counts, read-only permissions, denied category, desktop and 390/320px mobile');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
