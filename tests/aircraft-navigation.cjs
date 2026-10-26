'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dashboard.js'),'utf8');
const handler=source.slice(source.indexOf('let confirmedNavigation=false;'),source.indexOf('updateUndoButtons();',source.indexOf('let confirmedNavigation=false;')));
async function run({role,dirty=false,saveOK=true,same=false}={}){
 let listener,saves=0,blocked=false,selected=false;
 const tab={dataset:{idx:same?'0':'1'},click(){selected=true;}};
 const context={window:{ROLE_VIEW:role},document:{
 addEventListener(type,fn){listener=fn;},
 querySelectorAll(){return [{id:'panel-0'}];}
 },aircraftDirty:new Set(dirty?[0]:[]),fleet:[{reg:'HP1784'}],
 state:[{status:'operativo'}],previewData:{fleet:{HP1784:{status:'operativo',normalized:''}}},
 aircraftKey:x=>x,decodeAircraft:x=>x,defaultAc:()=>({}),
 savePanel:async()=>{saves++;return saveOK;}};
 vm.runInNewContext(handler,context);
 await listener({target:{closest:()=>tab},preventDefault(){blocked=true;},stopImmediatePropagation(){}});
 if(!blocked)selected=true; // Original tab's click handler runs.
 return {saves,blocked,selected};
}
(async()=>{
 for(const editable of [false,true])assert.deepEqual(await run({role:{editable}}),{saves:0,blocked:false,selected:true});
 assert.deepEqual(await run({role:{editable:false},dirty:true}),{saves:0,blocked:false,selected:true});
 assert.deepEqual(await run({role:{editable:true},dirty:true}),{saves:1,blocked:true,selected:true});
 assert.deepEqual(await run({role:{editable:true},dirty:true,saveOK:false}),{saves:1,blocked:true,selected:false});
 assert.deepEqual(await run({role:{editable:true},dirty:true,same:true}),{saves:0,blocked:false,selected:true});
 assert.deepEqual(await run(),{saves:1,blocked:true,selected:true});
 console.log('PASS: role navigation, actual edits, failed saves, current aircraft and director autosave');
})().catch(e=>{console.error(e);process.exitCode=1;});
