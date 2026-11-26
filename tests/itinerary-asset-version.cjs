'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('Director and role frames load the repaired itinerary engine through the same fresh asset version',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),loader=fs.readFileSync(path.join(root,'role-main-view.js'),'utf8'),cloud=fs.readFileSync(path.join(root,'cloud.js'),'utf8');
 const engine=html.match(/src="functions\/itinerary-engine\.js\?v=([^"\s]+)"/),ui=html.match(/src="itinerary-ui\.js\?v=([^"\s]+)"/),role=html.match(/src="role-main-view\.js\?v=([^"\s]+)"/),cloudTag=html.match(/src="cloud\.js\?v=([^"\s]+)"/),native=loader.match(/fetch\(path\+'\?native=([^']+)'/),dashboard=cloud.match(/script\.src='dashboard\.js\?v=([^']+)'/);
 assert(engine&&ui&&role&&cloudTag&&native&&dashboard,'All app loading paths must declare their versions');
 assert.equal(engine[1],ui[1],'Director engine and scheduling UI must invalidate together');
 assert.equal(engine[1],native[1],'The role frame and Director must invalidate the same engine release');
 assert.equal(role[1],native[1],'The role loader itself must refresh with the engine release');
 assert.equal(dashboard[1],native[1],'Director and role views must load the same dashboard bundle');
 assert.notEqual(cloudTag[1],'20261119-exam-flight-priority-2','Refresh cloud.js when its dashboard cache key changes');
 assert.notEqual(dashboard[1],'20261119-mobile-flight-log-2','Refresh the Director dashboard bundle');
 assert.notEqual(engine[1],'20261116-priority-2','Do not retain the corrupted engine cache key');
 assert.notEqual(native[1],'20261112-maintenance-duration-1','Do not retain the older role bundle cache key');
 assert.notEqual(ui[1],'20261125-mobile-route-picker-1','The prior mobile itinerary must refresh its dossier form');
 assert.equal(html.match(/href="itinerary-mobile-fixes\.css\?v=([^"\s]+)"/)?.[1],ui[1],'Keep mobile styles and itinerary script on the same release');
 assert.equal(dashboard[1],'20261125-mobile-itinerary-dossiers-2','Director dashboard cache key must match the combined itinerary release');
});
