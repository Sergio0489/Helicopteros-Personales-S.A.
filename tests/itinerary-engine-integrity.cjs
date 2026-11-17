'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=process.env.HP_ENGINE_FILE||path.resolve(__dirname,'../functions/itinerary-engine.js');
const names=['panamaClock','reservationGate','requestError','directorFlightError','operationalAlerts','competingRequests','prepareApproval','publishedChange','simulate'];
test('the shared itinerary engine is complete JavaScript rather than truncated tool output',()=>{
 const source=fs.readFileSync(engine,'utf8');assert.doesNotMatch(source,/^Warning: truncated output|^Total output lines:|…\d+ tokens truncated…/m);new vm.Script(source,{filename:engine});
});
test('the itinerary engine exposes its scheduling contract to both browsers and the server',()=>{
 const browser={};vm.runInNewContext(fs.readFileSync(engine,'utf8'),browser,{filename:engine});
 const server=require(engine);for(const name of names){assert.equal(typeof browser.HPItinerary?.[name],'function','browser '+name);assert.equal(typeof server[name],'function','server '+name);}
});
test('restored request gates retain tomorrow-only publication and Panama opening/closing boundaries',()=>{
 const E=require(engine),state=now=>({date:'2026-11-17',now,published:false});
 assert.match(E.reservationGate(state('2026-11-16T12:00:00-05:00')),/cerradas/);
 assert.equal(E.reservationGate(state('2026-11-16T12:01:00-05:00')),'');
 assert.equal(E.reservationGate(state('2026-11-16T19:59:00-05:00')),'');
 assert.match(E.reservationGate(state('2026-11-16T20:00:00-05:00')),/cerradas/);
 assert.match(E.reservationGate({...state('2026-11-16T13:00:00-05:00'),date:'2026-11-16'}),/mañana/);
 assert.match(E.reservationGate({...state('2026-11-16T13:00:00-05:00'),published:true}),/publicado/);
 assert.equal(E.panamaClock('2026-11-17T00:59:00Z').date,'2026-11-16');assert.equal(E.panamaClock('2026-11-17T00:59:00Z').tomorrow,'2026-11-17');
});
