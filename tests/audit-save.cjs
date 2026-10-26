'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../cloud.js','utf8');
test('Director uses audited save marker, avoids no-op writes and blocks after conflict; old backend stays usable before activation',async()=>{
 for(const enabled of [true,false]){
  const nodes={},calls=[],ctx={window:{},AccountRegistration:{api:async(action,extra)=>{calls.push({action,extra});if(action==='permission-capabilities')return {auditHistory:enabled};if(extra.operation==='conflict')throw Error('Conflicto');return {operation:'next',revision:2};}},cloudRequest:async(...args)=>{calls.push({legacy:args});return {etag:'newtag'};},cloudBusy:false,cloudBlocked:false,cloudETag:'tag',cloudVersion:1,cloudOperation:'initial',lastCloudPayload:'{}',crypto:require('node:crypto'),firebase:{auth:()=>({currentUser:{uid:'director'}})},el:id=>nodes[id]||=( {}),setCloudStatus(){},showCloudError(){},structuredClone};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('const legacyCloudWrite='),source.indexOf('function validateBackup(')),ctx);
  await ctx.window.cloudWrite({fleet:{}});if(enabled){assert.equal(calls.find(x=>x.action==='director-save').extra.operation,'initial');assert.equal(ctx.cloudOperation,'next');}else assert.equal(calls.filter(x=>x.legacy).length,1);
  const count=calls.length;await ctx.window.cloudWrite({fleet:{}});assert.equal(calls.length,count);
  if(enabled){ctx.cloudOperation='conflict';await assert.rejects(()=>ctx.window.cloudWrite({fleet:{new:1}}));assert.equal(ctx.cloudBlocked,true);assert(ctx.window.failedCloudData);}
 }
});
