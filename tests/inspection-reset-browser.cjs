'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const dashboard=fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
const cloud=fs.readFileSync(require.resolve('../cloud.js'),'utf8');
function section(source,start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
 assert(from>=0&&to>from,`Could not extract ${start}`);
 return source.slice(from,to);
}
const defaults=section(dashboard,'function defaultAc(ac) {','function daysUntil(');
const renderer=section(dashboard,'function renderDocList(idx, items) {','// Preset statuses');
const reset=section(dashboard,'async function resetInspectionBar(idx,limitHours){','function requestInspectionDeleteReason(');
const cloudUi=section(cloud,'function restoreCloudUiAfterWrite(){','function showCloudError(');
const resetCloud=section(cloud,'window.cloudResetInspectionBar=async function({reg,limitHours,expectedBefore,id,reason}={}){','function validateBackup(data){');

const dashboardFixture=`<!doctype html><meta charset="utf-8"><div id="dashboard-app"><label>Serial<input id="serial-0" value="LOCAL-SERIAL"></label></div><div id="cloud-busy" hidden>Guardando en Firebase…</div><div id="doc-list-0"></div><output id="state-output"></output><script>
function isDualTAC(){return false}
function escapeRecord(value){return String(value??'')}
function docStatusBadge(){return '<span>OK</span>'}
${defaults}
${renderer}
var fleet=[{reg:'HP-1784'}];var state=[Object.assign(defaultAc(fleet[0]),{serial:'LOCAL-SERIAL',horas_acum_50:'5.00',horas_totales:'5.00',documentos:[{nombre:'Documento ficticio válido',vence:'2030-01-01',estado:'vigente'}]})];
var aircraftDirty=new Set();var alerts=[];var consumed=[];var requested=null;var finishReset=null;var failReset=null;
function canResetInspectionBar(){return true}
function requestInspectionResetReason(){return Promise.resolve('Motivo ficticio')}
function savePanel(){return Promise.resolve(true)}
function refreshPanel(idx){renderDocList(idx,state[idx].documentos);document.getElementById('state-output').textContent=JSON.stringify(state[idx])}
function updateSummary(){}function buildResumen(){}function updateUndoButtons(){}
window.hasDraftChanges=()=>false;window.ROLE_VIEW=null;
window.ChangeHistory={reason:'',getReason(){return this.reason},setReason(v){this.reason=v},consume(v){consumed.push(v)}};
window.alert=m=>alerts.push(String(m));
window.cloudResetInspectionBar=options=>{requested=options;return new Promise((resolve,reject)=>{finishReset=resolve;failReset=reject})};
${reset}
${cloudUi}
window.startReset=()=>resetInspectionBar(0,50);
window.readState=()=>structuredClone(state[0]);
window.readDefaults=()=>normalizeAircraftState(fleet[0],{serial:'SERVER-ONLY'},{});
window.readAlerts=()=>alerts.slice();
window.readConsumed=()=>consumed.slice();
</script>`;

async function browser(){return chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox']});}
async function fixture(t){
 const b=await browser();const page=await b.newPage();page.setDefaultTimeout(3000);page.on('pageerror',e=>{throw e});await page.setContent(dashboardFixture);t.after(()=>b.close());return page;
}
async function begin(page){await page.evaluate(()=>{window.resetPromise=window.startReset()});await page.waitForFunction(()=>!!requested);}

test('a slow reset locks aircraft edits through the save and fills historical defaults',async t=>{
 const page=await fixture(t);await begin(page);
 assert.equal(await page.locator('#dashboard-app').evaluate(el=>el.inert),true);
 assert.equal(await page.locator('#cloud-busy').isVisible(),true);
 await page.locator('#serial-0').evaluate(el=>el.focus());
 assert.equal(await page.locator('#serial-0').evaluate(el=>document.activeElement===el),false,'Inert dashboard must block focus while the server is pending.');
 await page.evaluate(()=>restoreCloudUiAfterWrite());
 assert.equal(await page.locator('#dashboard-app').evaluate(el=>el.inert),true,'cloudWrite cleanup must not release the outer reset lock.');
 await page.evaluate(()=>finishReset({ok:true,aircraft:{serial:'SERVER-SERIAL',horas_acum_50:'0.00',horas_totales:'0.00',bitacora_reinicios_inspeccion:[{id:'fictional-reset',reason:'Motivo ficticio'}]}}));
 assert.equal(await page.evaluate(()=>window.resetPromise),true);
 assert.equal(await page.locator('#dashboard-app').evaluate(el=>el.inert),false);
 assert.equal(await page.locator('#doc-list-0 .doc-row').count(),1,'A missing response field must preserve valid local document data.');
 const saved=await page.evaluate(()=>readState());assert.equal(saved.serial,'SERVER-SERIAL');assert.equal(saved.documentos[0].vence,'2030-01-01');assert.equal(saved.bitacora_reinicios_inspeccion[0].reason,'Motivo ficticio');
 assert.equal((await page.evaluate(()=>readDefaults())).documentos.length,6,'A genuinely absent legacy field must fall back to aircraft defaults.');
});

test('a stale response is normalized before refresh and keeps valid server fields',async t=>{
 const page=await fixture(t);await begin(page);
 await page.evaluate(()=>finishReset({ok:false,stale:true,aircraft:{serial:'NEWER-SERVER-SERIAL',horas_acum_50:'7.00',documentos:undefined}}));
 assert.equal(await page.evaluate(()=>window.resetPromise),false);
 const saved=await page.evaluate(()=>readState());assert.equal(saved.serial,'NEWER-SERVER-SERIAL');assert.equal(saved.horas_acum_50,'7.00');
 assert.equal(await page.locator('#doc-list-0 .doc-row').count(),1);assert.equal(await page.locator('#dashboard-app').evaluate(el=>el.inert),false);
 assert.match((await page.evaluate(()=>readAlerts())).join(' '),/Las horas cambiaron/);
});

test('server errors release the interface and leave the local aircraft unchanged',async t=>{
 const page=await fixture(t);await begin(page);
 await page.evaluate(()=>failReset(new Error('Falla ficticia del servidor')));
 assert.equal(await page.evaluate(()=>window.resetPromise),false);
 const saved=await page.evaluate(()=>readState());assert.equal(saved.serial,'LOCAL-SERIAL');assert.equal(saved.horas_acum_50,'5.00');
 assert.equal(await page.locator('#dashboard-app').evaluate(el=>el.inert),false);assert.match((await page.evaluate(()=>readAlerts())).join(' '),/Falla ficticia/);
});

test('a lost confirmation retry reuses one reset ID and leaves one audited event',async t=>{
 const page=await fixture(t);
 await page.setContent(`<!doctype html><div id="dashboard-app"></div><div id="cloud-busy" hidden></div><script>
let cloudBusy=false,cloudBlocked=false,cloudETag='etag-1',cloudVersion=1,cloudOperation='operation-1',profileDirty=false,previewData={};
let writes=0,serverOperation='operation-1',serverRevision=1;
let serverData={fleet:{HP_1784:{serial:'FICTIONAL',horas_acum_50:'5.00',horas_totales:'5.00',horas_acum_100:'3.00',horas_limite:'3.00',bitacora_horas:[],bitacora_reinicios_inspeccion:[]}},pilotos:[],itinerarios:[],school:{students:[],rates:{},intakes:[]}};
function el(id){return document.getElementById(id)}function isDirectorUser(){return true}function validateBackup(value){return structuredClone(value)}
window.hasDraftChanges=()=>false;window.ChangeHistory={getReason(){return''}};window.failedCloudData=null;
async function cloudRequest(){return{value:{revision:serverRevision,operation:serverOperation,payload:JSON.stringify(serverData)},etag:'etag-current'}}
window.cloudWrite=async next=>{writes++;serverData=structuredClone(next);serverOperation='operation-2';serverRevision++;throw new Error('Los datos cambiaron. Actualiza antes de guardar.')};
${resetCloud}
window.runIdempotentReset=()=>window.cloudResetInspectionBar({reg:'HP-1784',limitHours:50,expectedBefore:'5.00',id:'fictional-stable-reset-id',reason:'Motivo ficticio de auditoría'});
window.resultState=()=>({writes,operation:serverOperation,aircraft:serverData.fleet.HP_1784});
</script>`);
 const result=await page.evaluate(()=>window.runIdempotentReset());
 assert.equal(result.ok,true);assert.equal(result.alreadyApplied,true);assert.equal(result.rebased,true);
 const state=await page.evaluate(()=>resultState());assert.equal(state.writes,1);assert.equal(state.aircraft.bitacora_reinicios_inspeccion.length,1);
 const event=state.aircraft.bitacora_reinicios_inspeccion[0];assert.equal(event.id,'fictional-stable-reset-id');assert.equal(event.reason,'Motivo ficticio de auditoría');assert.equal(event.after,'0.00');
});
