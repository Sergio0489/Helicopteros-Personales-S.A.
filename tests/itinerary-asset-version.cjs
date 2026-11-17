'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('Director and role frames load the repaired itinerary engine through the same fresh asset version',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),loader=fs.readFileSync(path.join(root,'role-main-view.js'),'utf8');
 const engine=html.match(/src="functions\/itinerary-engine\.js\?v=([^"\s]+)"/),role=html.match(/src="role-main-view\.js\?v=([^"\s]+)"/),native=loader.match(/fetch\(path\+'\?native=([^']+)'/);
 assert(engine&&role&&native,'Both loading paths must declare their versions');
 assert.equal(engine[1],native[1],'The role frame and Director must invalidate the same engine release');
 assert.equal(role[1],native[1],'The role loader itself must refresh with the engine release');
 assert.notEqual(engine[1],'20261116-priority-2','Do not retain the corrupted engine cache key');
 assert.notEqual(native[1],'20261112-maintenance-duration-1','Do not retain the older role bundle cache key');
});
